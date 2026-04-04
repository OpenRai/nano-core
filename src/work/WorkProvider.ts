import { HttpEndpointPool, type HttpPoolOptions } from '../transport/http.js';
import type { EndpointActivityEvent, EndpointAuditRecord } from '../transport/types.js';
import { PowBackendName, PowService } from 'nano-pow-with-fallback';

export enum LocalCompute {
  WEBGPU = 'webgpu',
  WEBGL = 'webgl',
  WASM = 'wasm',
}

type PowBackendNameValue = typeof PowBackendName[keyof typeof PowBackendName];
type WorkPlanStepKind = 'remote' | 'webgpu' | 'webgl' | 'wasm';

export interface WorkCalibrationProfile {
  measuredMhs: number;
  activeStrategy: 'remote-first' | 'planned';
}

export interface WorkGenerationTrace {
  mode: 'remote' | 'local';
  backend?: PowBackendNameValue;
}

export interface WorkProbeResult {
  kind: WorkPlanStepKind;
  available: boolean;
  durationMs?: number;
  reason?: string;
}

export interface WorkPlanStep {
  kind: WorkPlanStepKind;
}

export interface WorkExecutionPlan {
  source: 'default' | 'probe';
  steps: WorkPlanStep[];
  disabledLocalBackends: PowBackendNameValue[];
  probeResults: WorkProbeResult[];
}

export class RemoteWorkServer {
  private readonly _url: string;
  private readonly _timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    this._url = url;
    this._timeoutMs = timeoutMs;
  }

  public get url(): string { return this._url; }
  public get timeoutMs(): number { return this._timeoutMs; }

  public static of(url: string, options: { timeoutMs?: number, circuitBreakerMs?: number } = {}): RemoteWorkServer {
    return new RemoteWorkServer(url, options.timeoutMs ?? 5000);
  }
}

export interface WorkProviderOptions {
  urls?: string[];
  env?: string;
  defaults?: string[];
  warn?: (message: string) => void;
  onActiveEndpointChange?: (event: EndpointActivityEvent) => void;
  timeoutMs?: number;
  remotes?: RemoteWorkServer[];
  localChain?: LocalCompute[];
  profiler?: {
    mode: 'manual' | 'auto';
    preferLocalAboveMhs: number;
    cacheStrategy: 'persistent' | 'memory';
  };
}

const DEFAULT_LOCAL_CHAIN: LocalCompute[] = [LocalCompute.WEBGPU, LocalCompute.WEBGL, LocalCompute.WASM];
const DEFAULT_LOCAL_TIMEOUT_MS = 10_000;
const PROBE_HASH = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';
const PROBE_DIFFICULTY = 'fffffe0000000000';

function localComputeToBackendName(compute: LocalCompute): PowBackendNameValue {
  switch (compute) {
    case LocalCompute.WEBGPU:
      return PowBackendName.WEBGPU;
    case LocalCompute.WEBGL:
      return PowBackendName.WEBGL;
    case LocalCompute.WASM:
      return PowBackendName.WASM;
  }
}

function localComputeToPlanStep(compute: LocalCompute): WorkPlanStepKind {
  switch (compute) {
    case LocalCompute.WEBGPU:
      return 'webgpu';
    case LocalCompute.WEBGL:
      return 'webgl';
    case LocalCompute.WASM:
      return 'wasm';
  }
}

function planStepToBackendName(kind: WorkPlanStepKind): PowBackendNameValue {
  switch (kind) {
    case 'webgpu':
      return PowBackendName.WEBGPU;
    case 'webgl':
      return PowBackendName.WEBGL;
    case 'wasm':
      return PowBackendName.WASM;
    case 'remote':
      throw new Error('remote plan step does not map to a local backend');
  }
}

function isLocalStepKind(kind: WorkPlanStepKind): kind is Exclude<WorkPlanStepKind, 'remote'> {
  return kind !== 'remote';
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
  private readonly remotePool: HttpEndpointPool | null;
  private readonly warn: (message: string) => void;
  private readonly localTimeoutMs: number;
  private lastGenerationTrace: WorkGenerationTrace | null = null;
  private lastProbeResults: WorkProbeResult[] = [];
  private executionPlan: WorkExecutionPlan;
  private probePromise: Promise<WorkExecutionPlan> | null = null;

  private constructor(options: WorkProviderOptions) {
    this.options = options;
    this.warn = options.warn ?? ((message: string) => console.warn(`[nano-core] ${message}`));
    this.localTimeoutMs = DEFAULT_LOCAL_TIMEOUT_MS;

    const hasRemotePool = (options.urls && options.urls.length > 0) || options.env || (options.defaults && options.defaults.length > 0);
    if (!hasRemotePool) {
      this.remotePool = null;
    } else {
      const remotePoolOptions: HttpPoolOptions = {
        kind: 'work',
        defaults: options.defaults ?? [],
        transportPolicy: 'bearer-and-json-body-key',
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      };
      if (options.urls && options.urls.length > 0) remotePoolOptions.urls = options.urls;
      if (options.env) remotePoolOptions.env = options.env;
      if (options.warn) remotePoolOptions.warn = options.warn;
      if (options.onActiveEndpointChange) remotePoolOptions.onActiveEndpointChange = options.onActiveEndpointChange;
      this.remotePool = new HttpEndpointPool(remotePoolOptions);
    }

    this.executionPlan = this.buildDefaultPlan();
  }

  public static auto(options: WorkProviderOptions): WorkProvider {
    return new WorkProvider(options);
  }

  public getRemoteAuditReport(): EndpointAuditRecord[] {
    return this.remotePool?.getAuditReport() ?? [];
  }

  public getAuditReport(): {
    remotePool: EndpointAuditRecord[];
    remotes: Array<{ url: string; timeoutMs: number }>;
    localChain: LocalCompute[];
    profiler: WorkProviderOptions['profiler'] | 'default';
    localBackend: PowBackendNameValue | null;
    lastGenerationTrace: WorkGenerationTrace | null;
    executionPlan: WorkExecutionPlan;
  } {
    const localStep = this.lastGenerationTrace?.mode === 'local' ? this.lastGenerationTrace.backend ?? null : null;
    return {
      remotePool: this.getRemoteAuditReport(),
      remotes: this.options.remotes?.map((remote) => ({ url: remote.url, timeoutMs: remote.timeoutMs })) ?? [],
      localChain: this.options.localChain ?? DEFAULT_LOCAL_CHAIN,
      profiler: this.options.profiler ?? 'default',
      localBackend: localStep,
      lastGenerationTrace: this.lastGenerationTrace,
      executionPlan: this.executionPlan,
    };
  }

  public async calibrate(): Promise<WorkCalibrationProfile> {
    const plan = await this.probe();
    const localProbeDurations = plan.probeResults
      .filter((result) => result.available && result.kind !== 'remote' && typeof result.durationMs === 'number')
      .map((result) => result.durationMs as number);
    const bestLocalDuration = localProbeDurations.length > 0 ? Math.min(...localProbeDurations) : 0;
    const measuredMhs = bestLocalDuration > 0 ? Number((1_000 / bestLocalDuration).toFixed(2)) : 0;

    return {
      measuredMhs,
      activeStrategy: plan.source === 'probe' ? 'planned' : 'remote-first',
    };
  }

  public async probe(): Promise<WorkExecutionPlan> {
    if (this.probePromise) {
      return this.probePromise;
    }

    this.probePromise = this.runProbe();
    try {
      const plan = await this.probePromise;
      this.executionPlan = plan;
      return plan;
    } finally {
      this.probePromise = null;
    }
  }

  private buildDefaultPlan(): WorkExecutionPlan {
    const localChain = this.options.localChain ?? DEFAULT_LOCAL_CHAIN;
    const steps: WorkPlanStep[] = [];
    if (this.remotePool) {
      steps.push({ kind: 'remote' });
    }
    for (const compute of localChain) {
      steps.push({ kind: localComputeToPlanStep(compute) });
    }

    return {
      source: 'default',
      steps,
      disabledLocalBackends: [],
      probeResults: [],
    };
  }

  private createLocalPowService(backend: PowBackendNameValue): PowService {
    const disabledBackends = Object.values(PowBackendName).filter((candidate) => candidate !== backend);
    return new PowService({ disabledBackends });
  }

  private async probeRemote(): Promise<WorkProbeResult> {
    if (!this.remotePool) {
      return { kind: 'remote', available: false, reason: 'remote pool not configured' };
    }

    const startedAt = performance.now();
    try {
      await this.remotePool.postJson<{ node_vendor?: string }>({ action: 'version' });
      return {
        kind: 'remote',
        available: true,
        durationMs: performance.now() - startedAt,
      };
    } catch (error) {
      return {
        kind: 'remote',
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async probeLocalBackend(compute: LocalCompute): Promise<WorkProbeResult> {
    const backend = localComputeToBackendName(compute);
    const startedAt = performance.now();
    const powService = this.createLocalPowService(backend);

    try {
      await powService.ready;
      await withTimeout(
        powService.getProofOfWork({ hash: PROBE_HASH, threshold: PROBE_DIFFICULTY }),
        this.localTimeoutMs,
        () => powService.cancel(),
      );
      return {
        kind: localComputeToPlanStep(compute),
        available: true,
        durationMs: performance.now() - startedAt,
      };
    } catch (error) {
      return {
        kind: localComputeToPlanStep(compute),
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildPlanFromProbeResults(results: WorkProbeResult[]): WorkExecutionPlan {
    const remote = results.find((result) => result.kind === 'remote');
    const locals = results.filter((result): result is WorkProbeResult & { kind: Exclude<WorkPlanStepKind, 'remote'> } => isLocalStepKind(result.kind));
    const availableLocals = locals
      .filter((result) => result.available)
      .sort((a, b) => (a.durationMs ?? Number.POSITIVE_INFINITY) - (b.durationMs ?? Number.POSITIVE_INFINITY));
    const disabledLocalBackends = locals
      .filter((result) => !result.available)
      .map((result) => planStepToBackendName(result.kind));

    const steps: WorkPlanStep[] = [];
    if (availableLocals.length > 0) {
      steps.push({ kind: availableLocals[0].kind });
      if (remote?.available) {
        steps.push({ kind: 'remote' });
      }
      for (const local of availableLocals.slice(1)) {
        steps.push({ kind: local.kind });
      }
    } else if (remote?.available) {
      steps.push({ kind: 'remote' });
    }

    if (steps.length === 0) {
      return this.buildDefaultPlan();
    }

    return {
      source: 'probe',
      steps,
      disabledLocalBackends,
      probeResults: results,
    };
  }

  private async runProbe(): Promise<WorkExecutionPlan> {
    const localChain = this.options.localChain ?? DEFAULT_LOCAL_CHAIN;
    const results: WorkProbeResult[] = [];

    results.push(await this.probeRemote());
    for (const compute of localChain) {
      results.push(await this.probeLocalBackend(compute));
    }

    this.lastProbeResults = results;
    return this.buildPlanFromProbeResults(results);
  }

  private async generateRemote(hash: string, difficulty: string): Promise<string> {
    if (!this.remotePool) {
      throw new Error('Remote work pool is not configured');
    }

    const response = await this.remotePool.postJson<{ work: string }>({
      action: 'work_generate',
      hash,
      difficulty,
    });

    if (!response.work || response.work === '0000000000000000') {
      throw new Error('Remote work provider returned invalid/zero nonce');
    }

    this.lastGenerationTrace = { mode: 'remote' };
    return response.work;
  }

  private async generateLocalWithBackend(hash: string, difficulty: string, backend: PowBackendNameValue): Promise<string> {
    const powService = this.createLocalPowService(backend);
    await powService.ready;
    const result = await withTimeout(
      powService.getProofOfWork({ hash, threshold: difficulty }),
      this.localTimeoutMs,
      () => powService.cancel(),
    );
    this.lastGenerationTrace = { mode: 'local', backend: result.backend as PowBackendNameValue };
    return result.proofOfWork;
  }

  private async executePlan(hash: string, difficulty: string, plan: WorkExecutionPlan): Promise<string> {
    let lastError: unknown;

    for (const step of plan.steps) {
      try {
        if (step.kind === 'remote') {
          return await this.generateRemote(hash, difficulty);
        }

        return await this.generateLocalWithBackend(hash, difficulty, planStepToBackendName(step.kind));
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No work generation strategy succeeded');
  }

  public async generate(hash: string, difficulty: string): Promise<string> {
    const shouldProbe = this.options.profiler?.mode === 'auto';
    const plan = shouldProbe ? await this.probe() : this.executionPlan;
    return await this.executePlan(hash, difficulty, plan);
  }
}
