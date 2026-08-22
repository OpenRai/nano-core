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
  generate(hash: string, difficulty: string): Promise<string>;
}

export interface WorkProviderOptions {
  localEngine?: LocalPowEngine;
  remoteEngine?: RemotePowEngine;
  localTimeoutMs?: number;
  selectRoute?: () => WorkRoute;
  onRemoteFailure?: 'error' | 'local';
}

const DEFAULT_LOCAL_TIMEOUT_MS = 60_000;
export const WorkDifficulty = {
  Send: 'send',
  Receive: 'receive',
  LegacyEpoch1: 'legacy-epoch1',
  Dev: 'dev',
} as const;
export type WorkDifficulty = (typeof WorkDifficulty)[keyof typeof WorkDifficulty];

const THRESHOLDS: Record<WorkDifficulty, string> = {
  [WorkDifficulty.Send]: 'fffffff800000000',
  [WorkDifficulty.Receive]: 'fffffe0000000000',
  [WorkDifficulty.LegacyEpoch1]: 'ffffffc000000000',
  [WorkDifficulty.Dev]: 'fe00000000000000',
};

export type { PowEngine } from '@openrai/nano-pow-contract';

/** Convert a named Nano work difficulty (or its threshold) to a threshold. */
export function workDifficultyToThreshold(difficulty: string): string {
  const normalized = difficulty.toLowerCase();
  if (normalized === WorkDifficulty.Send || normalized === THRESHOLDS[WorkDifficulty.Send]) return THRESHOLDS[WorkDifficulty.Send];
  if (normalized === WorkDifficulty.Receive || normalized === THRESHOLDS[WorkDifficulty.Receive]) return THRESHOLDS[WorkDifficulty.Receive];
  if (normalized === 'legacyepoch1' || normalized === WorkDifficulty.LegacyEpoch1 || normalized === 'epoch1' || normalized === THRESHOLDS[WorkDifficulty.LegacyEpoch1]) return THRESHOLDS[WorkDifficulty.LegacyEpoch1];
  if (normalized === WorkDifficulty.Dev || normalized === THRESHOLDS[WorkDifficulty.Dev]) return THRESHOLDS[WorkDifficulty.Dev];
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
  private readonly localEngine: LocalPowEngine | null;
  private readonly remoteEngine: RemotePowEngine | null;
  private readonly selectRoute: (() => WorkRoute) | null;
  private readonly onRemoteFailure: 'error' | 'local';
  private lastGenerationTrace: WorkGenerationTrace | null = null;

  private constructor(options: WorkProviderOptions) {
    this.localTimeoutMs = options.localTimeoutMs ?? DEFAULT_LOCAL_TIMEOUT_MS;
    this.localEngine = options.localEngine ?? null;
    this.remoteEngine = options.remoteEngine ?? null;
    this.selectRoute = options.selectRoute ?? null;
    this.onRemoteFailure = options.onRemoteFailure ?? 'error';
  }

  public static auto(options: WorkProviderOptions = {}): WorkProvider {
    return new WorkProvider(options);
  }

  /** Create an executor that always computes work locally. */
  public static local(options: Omit<WorkProviderOptions, 'remoteEngine' | 'selectRoute' | 'onRemoteFailure'>): WorkProvider {
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
    if (!this.localEngine) throw new Error('Local work was selected but no local PoW engine is configured');
    await this.localEngine.ready?.();
    const threshold = workDifficultyToThreshold(difficulty);
    const work = await withTimeout(this.localEngine.generate(hash, threshold), this.localTimeoutMs);
    if (!this.localEngine.validate(hash, work, threshold)) {
      throw new Error('Local work generator returned invalid nonce');
    }
    this.lastGenerationTrace = { mode: 'local', backend: this.localEngine.name, fallbackFromRemote };
    return work;
  }

  private async generateRemote(hash: string, difficulty: string): Promise<string> {
    if (!this.remoteEngine) {
      throw new Error('Remote work was selected but no work endpoints are configured');
    }

    if (!this.localEngine) throw new Error('Remote work requires a local PoW engine to validate the returned nonce');
    await this.localEngine.ready?.();
    const threshold = workDifficultyToThreshold(difficulty);
    const work = await this.remoteEngine.generate(hash, threshold);
    if (!this.localEngine.validate(hash, work, threshold)) {
      throw new Error('Remote work generator returned invalid nonce');
    }
    this.lastGenerationTrace = { mode: 'remote', backend: this.remoteEngine.name, fallbackFromRemote: false };
    return work;
  }

  public async generate(hash: string, difficulty: string): Promise<string> {
    const route = this.selectRoute ? this.selectRoute() : (this.localEngine ? 'local' : 'remote');
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
    if (!this.localEngine) throw new Error('No local PoW engine is configured');
    return this.localEngine.validate(hash, work, workDifficultyToThreshold(difficulty));
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
