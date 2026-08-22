import {
  generateWork,
  validateWork,
  WorkType,
  workTypeToHex,
  recommendLocalPow as nativeRecommendLocalPow,
  clearPowTuningCache as nativeClearPowTuningCache,
  type WorkThreshold,
} from 'nano-rspow-node';
import type { PowEngine } from '@openrai/nano-pow-contract';
import {
  type BlockSubtype,
  type StateBlock,
  type SendBlockWithPoW,
  type ReceiveBlockWithPoW,
  type OpenBlockWithPoW,
  type ChangeBlockWithPoW,
  type BlockWithPoW,
  getWorkRoot,
} from '../primitives/Block.js';

export type WorkRoute = 'local' | 'remote';

export interface WorkGenerationTrace {
  mode: WorkRoute;
  backend: string;
  fallbackFromRemote: boolean;
}

/** @deprecated Use PowEngine from @openrai/nano-pow-contract. */
export type LocalPowEngine = PowEngine;

export interface RemotePowEngine {
  readonly name: string;
  generate(hash: string, workType: WorkType): Promise<string>;
}

export interface WorkProviderOptions {
  localEngine?: LocalPowEngine;
  remoteEngine?: RemotePowEngine;
  localTimeoutMs?: number;
  selectRoute?: () => WorkRoute;
  onRemoteFailure?: 'error' | 'local';
}

const DEFAULT_LOCAL_TIMEOUT_MS = 60_000;
const WORK_TYPE = {
  Send: 'Send',
  Receive: 'Receive',
  LegacyEpoch1: 'LegacyEpoch1',
  Dev: 'Dev',
} as const;
const EPOCH_2_SEND_THRESHOLD = workTypeToHex(WORK_TYPE.Send as WorkType).toLowerCase();
const EPOCH_2_RECEIVE_THRESHOLD = workTypeToHex(WORK_TYPE.Receive as WorkType).toLowerCase();
const LEGACY_EPOCH_1_THRESHOLD = workTypeToHex(WORK_TYPE.LegacyEpoch1 as WorkType).toLowerCase();
const DEV_THRESHOLD = workTypeToHex(WORK_TYPE.Dev as WorkType).toLowerCase();

export type { WorkThreshold };
export type { PowEngine } from '@openrai/nano-pow-contract';
export { WorkType, workTypeToHex };

export class NanoRspowEngine implements LocalPowEngine {
  public readonly name = 'nano-rspow-node';

  public async generate(hash: string, difficulty: string): Promise<string> {
    return await generateWork(hash, difficultyToWorkType(difficulty));
  }

  public validate(hash: string, work: string, difficulty: string): boolean {
    return validateWork(hash, work, difficultyToWorkType(difficulty));
  }
}

/** Return the native engine's persisted local-work recommendation. */
export function recommendLocalPow(): boolean {
  return nativeRecommendLocalPow();
}

/** Clear the native engine's persisted local-work recommendation. */
export function clearPowTuningCache(): boolean {
  return nativeClearPowTuningCache();
}

function difficultyToWorkType(difficulty: string): WorkType {
  const normalized = difficulty.toLowerCase();
  if (normalized === 'send' || normalized === EPOCH_2_SEND_THRESHOLD) return WORK_TYPE.Send as WorkType;
  if (normalized === 'receive' || normalized === EPOCH_2_RECEIVE_THRESHOLD) return WORK_TYPE.Receive as WorkType;
  if (normalized === 'legacyepoch1' || normalized === 'legacy-epoch1' || normalized === 'epoch1' || normalized === LEGACY_EPOCH_1_THRESHOLD) {
    return WORK_TYPE.LegacyEpoch1 as WorkType;
  }
  if (normalized === 'dev' || normalized === DEV_THRESHOLD) return WORK_TYPE.Dev as WorkType;
  throw new Error(`Unsupported Nano work difficulty: ${difficulty}`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class WorkProvider {
  private readonly localTimeoutMs: number;
  private readonly localEngine: LocalPowEngine;
  private readonly remoteEngine: RemotePowEngine | null;
  private readonly selectRoute: (() => WorkRoute) | null;
  private readonly onRemoteFailure: 'error' | 'local';
  private lastGenerationTrace: WorkGenerationTrace | null = null;

  private constructor(options: WorkProviderOptions) {
    this.localTimeoutMs = options.localTimeoutMs ?? DEFAULT_LOCAL_TIMEOUT_MS;
    this.localEngine = options.localEngine ?? new NanoRspowEngine();
    this.remoteEngine = options.remoteEngine ?? null;
    this.selectRoute = options.selectRoute ?? null;
    this.onRemoteFailure = options.onRemoteFailure ?? 'error';
  }

  public static auto(options: WorkProviderOptions = {}): WorkProvider {
    return new WorkProvider(options);
  }

  /** Create an executor that always computes work locally. */
  public static local(options: Omit<WorkProviderOptions, 'remoteEngine' | 'selectRoute' | 'onRemoteFailure'> = {}): WorkProvider {
    return new WorkProvider({ ...options, selectRoute: () => 'local' });
  }

  public getAuditReport(): {
    configuredRemote: boolean;
    remoteFailurePolicy: 'error' | 'local';
    lastGenerationTrace: WorkGenerationTrace | null;
  } {
    return {
      configuredRemote: this.remoteEngine !== null,
      remoteFailurePolicy: this.onRemoteFailure,
      lastGenerationTrace: this.lastGenerationTrace,
    };
  }

  private async generateLocal(hash: string, difficulty: string, fallbackFromRemote = false): Promise<string> {
    const work = await withTimeout(this.localEngine.generate(hash, difficulty), this.localTimeoutMs);
    if (!this.localEngine.validate(hash, work, difficulty)) {
      throw new Error('Local work generator returned invalid nonce');
    }
    this.lastGenerationTrace = { mode: 'local', backend: this.localEngine.name, fallbackFromRemote };
    return work;
  }

  private async generateRemote(hash: string, difficulty: string): Promise<string> {
    if (!this.remoteEngine) {
      throw new Error('Remote work was selected but no work endpoints are configured');
    }

    const work = await this.remoteEngine.generate(hash, difficultyToWorkType(difficulty));
    if (!this.localEngine.validate(hash, work, difficulty)) {
      throw new Error('Remote work generator returned invalid nonce');
    }
    this.lastGenerationTrace = { mode: 'remote', backend: this.remoteEngine.name, fallbackFromRemote: false };
    return work;
  }

  public async generate(hash: string, difficulty: string): Promise<string> {
    const route = this.selectRoute ? this.selectRoute() : (recommendLocalPow() ? 'local' : 'remote');
    if (route !== 'local' && route !== 'remote') {
      throw new Error(`Unsupported work route: ${String(route)}`);
    }
    if (route === 'local') return await this.generateLocal(hash, difficulty);

    try {
      return await this.generateRemote(hash, difficulty);
    } catch (error) {
      if (this.onRemoteFailure !== 'local') throw error;
      return await this.generateLocal(hash, difficulty, true);
    }
  }

  public validate(hash: string, work: string, difficulty: string): boolean {
    return this.localEngine.validate(hash, work, difficulty);
  }

  public async generateBlockWithPoW(block: StateBlock, subtype: 'send'): Promise<SendBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'receive'): Promise<ReceiveBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'open', accountPublicKey?: string): Promise<OpenBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'change'): Promise<ChangeBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: BlockSubtype, accountPublicKey?: string): Promise<BlockWithPoW> {
    const difficulty = (subtype === 'open' || subtype === 'receive') ? 'receive' : 'send';
    const root = getWorkRoot(block, subtype, accountPublicKey);
    const work = await this.generate(root, difficulty);
    return { ...block, work } as BlockWithPoW;
  }

  public validateBlockWithPoW(block: BlockWithPoW, subtype: BlockSubtype, accountPublicKey?: string): boolean {
    const difficulty = (subtype === 'open' || subtype === 'receive') ? 'receive' : 'send';
    const root = getWorkRoot(block, subtype, accountPublicKey);
    return this.validate(root, block.work, difficulty);
  }
}
