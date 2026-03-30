import { PoWNodeBackend, PoWWebGPUBackend, PoWWebGLBackend, PoWWasmBackend } from 'nano-pow-with-fallback';

/**
 * Local compute engines available.
 */
export enum LocalCompute {
  WEBGPU = 'webgpu',
  WEBGL = 'webgl',
  WASM_THREADS = 'wasm',
  CPU = 'cpu'
}

export class RemoteWorkServer {
  private _url: string;
  private _timeoutMs: number;
  
  constructor(url: string, timeoutMs: number) {
    this._url = url;
    this._timeoutMs = timeoutMs;
  }

  public get url(): string { return this._url; }
  public get timeoutMs(): number { return this._timeoutMs; }

  static of(url: string, options: { timeoutMs?: number, circuitBreakerMs?: number } = {}) {
    return new RemoteWorkServer(url, options.timeoutMs ?? 5000);
  }
}

export interface WorkProviderOptions {
  remotes?: RemoteWorkServer[];
  localChain?: LocalCompute[];
  profiler?: {
    mode: 'manual' | 'auto';
    preferLocalAboveMhs: number;
    cacheStrategy: 'persistent' | 'memory';
  };
}

export class WorkProvider {
  private options: WorkProviderOptions;
  
  private constructor(options: WorkProviderOptions) {
    this.options = options;
  }

  public static auto(options: WorkProviderOptions): WorkProvider {
    return new WorkProvider(options);
  }

  /**
   * Generates a minimal JSON-serializable report of the work provider's active configuration.
   */
  public getAuditReport(): Record<string, any> {
    return {
      remotes: this.options.remotes?.map(r => ({ url: r.url, timeoutMs: r.timeoutMs })) || [],
      localChain: this.options.localChain || [],
      profiler: this.options.profiler || 'default'
    };
  }

  /**
   * Calibrates the work provider based on the environment.
   * Runs a dummy hash to determine optimal strategy.
   */
  public async calibrate(): Promise<{ measuredMhs: number; activeStrategy: string }> {
    // In a real implementation this would benchmark nano-pow-with-fallback.
    // For scaffolding, we return a simulated profile.
    
    // Simulate picking WASM/WebGL based on fallback strategy
    return {
      measuredMhs: 104.2, // simulated Node M1 webgpu speed
      activeStrategy: 'local-primary'
    };
  }

  /**
   * Generate Proof-of-Work for a given hash.
   */
  public async generate(hash: string, difficulty: string): Promise<string> {
    // In real implementation, this would route to Local vs Remote.
    // Placeholder to satisfy signature matching the design.
    return '0000000000000000'; // dummy work
  }
}
