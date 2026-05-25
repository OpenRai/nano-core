import { generateWork, validateWork, WorkType, workTypeToHex, type WorkThreshold } from 'nano-rspow-node';
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
import { createCacheStore, type WorkPlanCacheStore } from './cache-store.js';

export interface WorkCalibrationProfile {
  measuredMhs: number;
  activeStrategy: 'local' | 'planned';
}

export interface WorkGenerationTrace {
  mode: 'local';
  backend?: string;
}

export interface WorkProbeResult {
  kind: 'local';
  available: boolean;
  durationMs?: number;
  reason?: string;
}

export interface WorkPlanStep {
  kind: 'local';
}

export interface WorkExecutionPlan {
  source: 'default' | 'probe';
  steps: WorkPlanStep[];
  disabledLocalEngines: string[];
  probeResults: WorkProbeResult[];
}

export interface LocalPowEngine {
  readonly name: string;
  generate(hash: string, difficulty: string): Promise<string>;
  validate(hash: string, work: string, difficulty: string): boolean;
}

export class NanoRspowEngine implements LocalPowEngine {
  public readonly name = 'nano-rspow-node';

  public async generate(hash: string, difficulty: string): Promise<string> {
    return await generateWork(hash, difficultyToWorkType(difficulty));
  }

  public validate(hash: string, work: string, difficulty: string): boolean {
    return validateWork(hash, work, difficultyToWorkType(difficulty));
  }
}


export interface WorkProviderOptions {
  warn?: (message: string) => void;
  localEngine?: LocalPowEngine;
  localTimeoutMs?: number;
  profiler?: {
    mode: 'manual' | 'auto';
    preferLocalAboveMhs?: number;
    cacheStrategy?: 'persistent' | 'memory';
  };
}

const DEFAULT_LOCAL_TIMEOUT_MS = 60_000;
const PROBE_HASH = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';
const PROBE_DIFFICULTY = 'fffffff800000000';
const EPOCH_2_SEND_THRESHOLD = workTypeToHex('Send' as WorkType).toLowerCase();
const EPOCH_2_RECEIVE_THRESHOLD = workTypeToHex('Receive' as WorkType).toLowerCase();
const EPOCH_1_THRESHOLD = workTypeToHex('Epoch1' as WorkType).toLowerCase();
const DEV_THRESHOLD = workTypeToHex('Dev' as WorkType).toLowerCase();
const WORK_TYPE = {
  SEND: 'Send',
  RECEIVE: 'Receive',
  EPOCH1: 'Epoch1',
  DEV: 'Dev',
} as const;

export type { WorkThreshold };
export { WorkType, workTypeToHex };

function difficultyToWorkType(difficulty: string): WorkType {
  const normalized = difficulty.toLowerCase();
  if (normalized === 'send' || normalized === WORK_TYPE.SEND.toLowerCase() || normalized === EPOCH_2_SEND_THRESHOLD) {
    return WORK_TYPE.SEND as WorkType;
  }
  if (normalized === 'receive' || normalized === WORK_TYPE.RECEIVE.toLowerCase() || normalized === EPOCH_2_RECEIVE_THRESHOLD) {
    return WORK_TYPE.RECEIVE as WorkType;
  }
  if (normalized === 'epoch1' || normalized === WORK_TYPE.EPOCH1.toLowerCase() || normalized === EPOCH_1_THRESHOLD) {
    return WORK_TYPE.EPOCH1 as WorkType;
  }
  if (normalized === 'dev' || normalized === WORK_TYPE.DEV.toLowerCase() || normalized === DEV_THRESHOLD) {
    return WORK_TYPE.DEV as WorkType;
  }
  return WORK_TYPE.SEND as WorkType;
}

function computeOptionsFingerprint(options: WorkProviderOptions): string {
  const parts: Record<string, unknown> = {
    localEngine: options.localEngine?.name ?? 'nano-rspow-node',
  };

  const data = JSON.stringify(parts, Object.keys(parts).sort());

  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) ^ data.charCodeAt(i);
  }
  return Math.abs(hash).toString(16);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

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
  private readonly options: WorkProviderOptions;
  private readonly localTimeoutMs: number;
  private readonly localEngine: LocalPowEngine;
  private readonly cacheStore: WorkPlanCacheStore;
  private lastGenerationTrace: WorkGenerationTrace | null = null;
  private executionPlan: WorkExecutionPlan;
  private probePromise: Promise<WorkExecutionPlan> | null = null;
  private readonly preferLocalAboveMhs: number;

  private constructor(options: WorkProviderOptions, cacheStore: WorkPlanCacheStore) {
    this.options = options;
    this.localTimeoutMs = options.localTimeoutMs ?? DEFAULT_LOCAL_TIMEOUT_MS;
    this.localEngine = options.localEngine ?? new NanoRspowEngine();
    this.cacheStore = cacheStore;
    this.preferLocalAboveMhs = options.profiler?.preferLocalAboveMhs ?? 0;
    this.executionPlan = this.buildDefaultPlan();
  }

  public static auto(options: WorkProviderOptions = {}): WorkProvider {
    const fingerprint = computeOptionsFingerprint(options);
    const cacheStrategy = options.profiler?.cacheStrategy ?? 'memory';
    const cacheStore = createCacheStore(cacheStrategy, fingerprint);
    return new WorkProvider(options, cacheStore);
  }

  public getAuditReport(): {
    profiler: WorkProviderOptions['profiler'] | 'default';
    localBackend: string | null;
    lastGenerationTrace: WorkGenerationTrace | null;
    executionPlan: WorkExecutionPlan;
  } {
    return {
      profiler: this.options.profiler ?? 'default',
      localBackend: this.lastGenerationTrace?.backend ?? null,
      lastGenerationTrace: this.lastGenerationTrace,
      executionPlan: this.executionPlan,
    };
  }

  public async calibrate(): Promise<WorkCalibrationProfile> {
    const plan = await this.probe();
    const localProbeDurations = plan.probeResults
      .filter((result) => result.available && typeof result.durationMs === 'number')
      .map((result) => result.durationMs as number);
    const bestLocalDuration = localProbeDurations.length > 0 ? Math.min(...localProbeDurations) : 0;
    const measuredMhs = bestLocalDuration > 0 ? Number((1_000 / bestLocalDuration).toFixed(2)) : 0;

    return {
      measuredMhs,
      activeStrategy: plan.source === 'probe' ? 'planned' : 'local',
    };
  }

  public async probe(): Promise<WorkExecutionPlan> {
    const cached = this.cacheStore.read();
    if (cached) {
      this.executionPlan = cached;
      return cached;
    }

    if (this.probePromise) {
      return this.probePromise;
    }

    this.probePromise = this.runProbe();
    try {
      const plan = await this.probePromise;
      this.executionPlan = plan;
      await this.cacheStore.write(plan);
      return plan;
    } finally {
      this.probePromise = null;
    }
  }

  private buildDefaultPlan(): WorkExecutionPlan {
    return {
      source: 'default',
      steps: [{ kind: 'local' }],
      disabledLocalEngines: [],
      probeResults: [],
    };
  }

  private async probeLocalEngine(): Promise<WorkProbeResult> {
    const startedAt = performance.now();
    try {
      const work = await withTimeout(
        this.localEngine.generate(PROBE_HASH, PROBE_DIFFICULTY),
        this.localTimeoutMs,
      );
      if (!this.localEngine.validate(PROBE_HASH, work, PROBE_DIFFICULTY)) {
        throw new Error('local engine generated invalid work');
      }
      return {
        kind: 'local',
        available: true,
        durationMs: performance.now() - startedAt,
      };
    } catch (error) {
      return {
        kind: 'local',
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildPlanFromProbeResults(results: WorkProbeResult[]): WorkExecutionPlan {
    const local = results.find((result) => result.kind === 'local');
    const disabledLocalEngines = local?.available === false ? [this.localEngine.name] : [];

    if (!local?.available) {
      return this.buildDefaultPlan();
    }

    return {
      source: 'probe',
      steps: [{ kind: 'local' }],
      disabledLocalEngines,
      probeResults: results,
    };
  }

  private async runProbe(): Promise<WorkExecutionPlan> {
    const result = await this.probeLocalEngine();
    return this.buildPlanFromProbeResults([result]);
  }

  private async generateLocal(hash: string, difficulty: string): Promise<string> {
    const work = await withTimeout(this.localEngine.generate(hash, difficulty), this.localTimeoutMs);
    if (!this.localEngine.validate(hash, work, difficulty)) {
      throw new Error('Local work generator returned invalid nonce');
    }
    this.lastGenerationTrace = { mode: 'local', backend: this.localEngine.name };
    return work;
  }

  public async generate(hash: string, difficulty: string): Promise<string> {
    const shouldProbe = this.options.profiler?.mode === 'auto';
    const plan = shouldProbe ? await this.probe() : this.executionPlan;

    if (plan.steps.length === 0) {
      throw new Error('No work generation steps in plan');
    }

    return await this.generateLocal(hash, difficulty);
  }

  public validate(hash: string, work: string, difficulty: string): boolean {
    return this.localEngine.validate(hash, work, difficulty);
  }

  public async generateBlockWithPoW(block: StateBlock, subtype: 'send'): Promise<SendBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'receive'): Promise<ReceiveBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'open', accountPublicKey?: string): Promise<OpenBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: 'change'): Promise<ChangeBlockWithPoW>;
  public async generateBlockWithPoW(block: StateBlock, subtype: BlockSubtype, accountPublicKey?: string): Promise<BlockWithPoW> {
    const difficulty = (subtype === 'open' || subtype === 'receive') ? 'Receive' : 'Send';
    const root = getWorkRoot(block, subtype, accountPublicKey);
    const work = await this.generate(root, difficulty);
    return {
      ...block,
      work,
    } as BlockWithPoW;
  }

  public validateBlockWithPoW(block: BlockWithPoW, subtype: BlockSubtype, accountPublicKey?: string): boolean {
    const difficulty = (subtype === 'open' || subtype === 'receive') ? 'Receive' : 'Send';
    const root = getWorkRoot(block, subtype, accountPublicKey);
    return this.validate(root, block.work, difficulty);
  }
}
