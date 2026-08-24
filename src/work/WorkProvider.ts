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
import type { HashString, RootString, WorkString } from '../primitives/types.js';

export type WorkRoute = 'local' | 'remote';

export interface WorkGenerationTrace {
  /** Execution mode used for PoW generation. */
  mode: WorkRoute;
  /** Name of the backend generator engine. */
  backend: string;
  /** Indicates whether execution failed over from remote work server to local engine. */
  fallbackFromRemote: boolean;
}

/** @deprecated Use PowEngine from @openrai/nano-pow-contract. */
export type LocalPowEngine = PowEngine;

export interface RemotePowEngine {
  readonly name: string;
  /**
   * Requests proof-of-work generation from a remote work server.
   *
   * @param hash - 64-hex work root hash
   * @param difficulty - 16-hex difficulty threshold
   * @returns 16-hex work nonce string
   */
  generate(hash: string | RootString, difficulty: string): Promise<string | WorkString>;
}

export interface WorkProviderOptions {
  /** Local CPU or GPU PoW engine. */
  localEngine?: LocalPowEngine;
  /** Remote work server cluster client. */
  remoteEngine?: RemotePowEngine;
  /** Maximum execution duration in milliseconds before timing out local PoW generation. */
  localTimeoutMs?: number;
  /** Dynamic route selector function returning 'local' or 'remote'. */
  selectRoute?: () => WorkRoute;
  /** Action on remote work generation failure ('error' throws, 'local' falls back to local engine). */
  onRemoteFailure?: 'error' | 'local';
}

const DEFAULT_LOCAL_TIMEOUT_MS = 60_000;

/**
 * Standard Nano network work difficulty thresholds.
 *
 * @see https://docs.nano.org/integration-guides/work-generation/#difficulty-thresholds
 */
export const WorkDifficulty = {
  /** Standard send/change threshold (0xfffffff800000000). 8x receive base. */
  Send: 'send',
  /** Standard receive/open threshold (0xfffffe0000000000). 1x base. */
  Receive: 'receive',
  /** Legacy Epoch 1 threshold (0xffffffc000000000). */
  LegacyEpoch1: 'legacy-epoch1',
  /** Development testnet threshold (0xfe00000000000000). */
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

/**
 * Maps a named difficulty or 16-hex threshold string to its canonical 16-hex threshold value.
 *
 * @param difficulty - Named difficulty ('send', 'receive', 'legacy-epoch1', 'dev') or 16-hex string
 * @returns 16-character lowercase hexadecimal threshold string
 * @throws {Error} If difficulty identifier is unrecognized
 */
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

/**
 * Manages Proof of Work (PoW) generation, routing, and validation.
 *
 * Handles intelligent fallback between local CPU/GPU generators and remote work peer servers.
 *
 * @see https://docs.nano.org/integration-guides/work-generation/
 */
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

  /**
   * Instantiates a `WorkProvider` with automated local/remote routing.
   *
   * @param options - Configuration options for engines and failure policies
   */
  public static auto(options: WorkProviderOptions = {}): WorkProvider {
    return new WorkProvider(options);
  }

  /**
   * Instantiates a `WorkProvider` configured strictly for local PoW execution.
   *
   * @param options - Configuration options for local engine
   */
  public static local(options: Omit<WorkProviderOptions, 'remoteEngine' | 'selectRoute' | 'onRemoteFailure'>): WorkProvider {
    return new WorkProvider({ ...options, selectRoute: () => 'local' });
  }

  /**
   * Generates diagnostic report on configured engines and last PoW trace.
   */
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

  private async generateLocal(hash: string, difficulty: string, fallbackFromRemote = false): Promise<WorkString> {
    if (!this.localEngine) throw new Error('Local work was selected but no local PoW engine is configured');
    await this.localEngine.ready?.();
    const threshold = workDifficultyToThreshold(difficulty);
    const work = await withTimeout(this.localEngine.generate(hash, threshold), this.localTimeoutMs);
    if (!this.localEngine.validate(hash, work, threshold)) {
      throw new Error('Local work generator returned invalid nonce');
    }
    this.lastGenerationTrace = { mode: 'local', backend: this.localEngine.name, fallbackFromRemote };
    return work as WorkString;
  }

  private async generateRemote(hash: string, difficulty: string): Promise<WorkString> {
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
    return work as WorkString;
  }

  /**
   * Computes a valid PoW nonce for a 64-hex root hash and difficulty.
   *
   * @param hash - 64-hex work root hash
   * @param difficulty - Named difficulty or 16-hex threshold string
   * @returns 16-hex proof-of-work nonce
   */
  public async generate(hash: string | RootString, difficulty: string | WorkDifficulty): Promise<WorkString> {
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

  /**
   * Validates a 16-hex PoW nonce against a root hash and difficulty threshold.
   *
   * @param hash - 64-hex work root hash
   * @param work - 16-hex PoW nonce
   * @param difficulty - Named difficulty or 16-hex threshold string
   * @returns True if nonce meets or exceeds threshold
   */
  public validate(hash: string | RootString, work: string | WorkString, difficulty: string | WorkDifficulty): boolean {
    if (!this.localEngine) throw new Error('No local PoW engine is configured');
    return this.localEngine.validate(hash, work, workDifficultyToThreshold(difficulty));
  }

  public async generateBlockWithPoW(block: StateBlock, subtype: 'send'): Promise<SendBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'receive'): Promise<ReceiveBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'open', accountPublicKey?: string | HashString): Promise<OpenBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'change'): Promise<ChangeBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: BlockSubtype, accountPublicKey?: string | HashString): Promise<BlockWithPoW> {
    const difficulty = (subtype === 'open' || subtype === 'receive') ? 'receive' : 'send';
    const root = getWorkRoot(block, subtype, accountPublicKey);
    const work = await this.generate(root, difficulty);
    return { ...block, work } as BlockWithPoW;
  }

  public validateBlockWithPoW(block: BlockWithPoW, subtype: BlockSubtype, accountPublicKey?: string | HashString): boolean {
    const difficulty = (subtype === 'open' || subtype === 'receive') ? 'receive' : 'send';
    const root = getWorkRoot(block, subtype, accountPublicKey);
    return this.validate(root, block.work, difficulty);
  }
}
