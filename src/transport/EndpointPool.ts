import type {
  EndpointActivityEvent,
  EndpointAuditRecord,
  EndpointPoolOptions,
  EndpointState,
  NormalizedEndpoint,
} from './types.js';
import { normalizeEndpoints } from './normalize.js';

function withJitter(delay: number): number {
  const factor = 0.85 + (Math.random() * 0.3);
  return Math.round(delay * factor);
}

export class EndpointPool {
  private readonly states: EndpointState[];
  private readonly warn: (message: string) => void;
  private readonly now: () => number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly onActiveEndpointChange: ((event: EndpointActivityEvent) => void) | null;
  private activeEndpointUrl: string | null;

  constructor(options: EndpointPoolOptions) {
    this.warn = options.warn ?? (() => {});
    this.now = options.now ?? (() => Date.now());
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.onActiveEndpointChange = options.onActiveEndpointChange ?? null;

    const endpoints = normalizeEndpoints({
      kind: options.kind,
      defaults: options.defaults,
      warn: this.warn,
      ...(options.urls ? { inputs: options.urls } : {}),
      ...(options.env ? { env: options.env } : {}),
      ...(options.transportPolicy ? { transportPolicy: options.transportPolicy } : {}),
    });

    this.states = endpoints.map((endpoint) => ({
      endpoint,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      cooldownUntil: 0,
      lastLatencyMs: null,
    }));
    this.activeEndpointUrl = null;
  }

  private emitActiveEndpointChange(nextUrl: string): void {
    if (!this.onActiveEndpointChange) return;
    if (this.activeEndpointUrl === nextUrl) return;

    const previousUrl = this.activeEndpointUrl ?? undefined;
    this.activeEndpointUrl = nextUrl;
    this.onActiveEndpointChange({
      kind: this.states[0]?.endpoint.kind ?? 'rpc',
      status: previousUrl ? 'failover' : 'connected',
      activeUrl: nextUrl,
      ...(previousUrl ? { previousUrl } : {}),
    });
  }

  public getEndpoints(): NormalizedEndpoint[] {
    return this.states.map((state) => state.endpoint);
  }

  public getAuditReport(): EndpointAuditRecord[] {
    return this.states.map((state) => ({
      kind: state.endpoint.kind,
      url: state.endpoint.url.toString(),
      authUsed: state.endpoint.auth.type === 'api-key',
      authSource: state.endpoint.auth.type === 'api-key' ? state.endpoint.auth.source : null,
      policy: state.endpoint.auth.type === 'api-key' ? state.endpoint.auth.policy : null,
      consecutiveFailures: state.consecutiveFailures,
      lastSuccessAt: state.lastSuccessAt,
      lastFailureAt: state.lastFailureAt,
      cooldownUntil: state.cooldownUntil > 0 ? new Date(state.cooldownUntil).toISOString() : null,
      lastLatencyMs: state.lastLatencyMs,
    }));
  }

  public async execute<T>(
    attempt: (endpoint: NormalizedEndpoint) => Promise<T>,
  ): Promise<T> {
    const start = this.now();
    const orderedStates = [...this.states].sort((a, b) => {
      const aReady = a.cooldownUntil <= start ? 0 : 1;
      const bReady = b.cooldownUntil <= start ? 0 : 1;
      if (aReady !== bReady) return aReady - bReady;
      const aLatency = a.lastLatencyMs ?? Number.MAX_SAFE_INTEGER;
      const bLatency = b.lastLatencyMs ?? Number.MAX_SAFE_INTEGER;
      return aLatency - bLatency;
    });

    let lastError: unknown;

    for (const state of orderedStates) {
      if (state.cooldownUntil > start) continue;

      const attemptStarted = this.now();
      try {
        const result = await attempt(state.endpoint);
        state.consecutiveFailures = 0;
        state.cooldownUntil = 0;
        state.lastSuccessAt = new Date(this.now()).toISOString();
        state.lastLatencyMs = this.now() - attemptStarted;
        this.emitActiveEndpointChange(state.endpoint.url.toString());
        return result;
      } catch (error) {
        lastError = error;
        state.consecutiveFailures += 1;
        state.lastFailureAt = new Date(this.now()).toISOString();
        const delay = Math.min(this.baseDelayMs * (2 ** (state.consecutiveFailures - 1)), this.maxDelayMs);
        state.cooldownUntil = this.now() + withJitter(delay);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('All endpoints exhausted');
  }
}
