import { EndpointPool } from './EndpointPool.js';
import type { EndpointAuditRecord, EndpointPoolOptions, NormalizedEndpoint } from './types.js';
import { applyHttpAuth } from './auth.js';

export interface HttpPoolOptions extends Omit<EndpointPoolOptions, 'kind'> {
  /** Target endpoint kind ('rpc' for node calls or 'work' for PoW servers). Defaults to 'rpc'. */
  kind?: 'rpc' | 'work';
  /** Request timeout duration in milliseconds. When exceeded, the fetch request aborts. */
  timeoutMs?: number;
}

/**
 * Constructs HTTP authorization headers according to endpoint authentication policy.
 *
 * @param endpoint - Normalized endpoint configuration
 * @param extraHeaders - Optional caller-specified headers
 * @returns Combined HTTP headers dictionary
 */
export function buildHeaders(endpoint: NormalizedEndpoint, extraHeaders?: Record<string, string>): Record<string, string> {
  return applyHttpAuth(endpoint.auth, {}, extraHeaders).headers;
}

/**
 * Resilient HTTP client managing failover, retries, authentication, and timeouts across multiple node endpoints.
 */
export class HttpEndpointPool {
  private readonly pool: EndpointPool;
  private readonly timeoutMs: number | null;

  constructor(options: HttpPoolOptions) {
    this.timeoutMs = options.timeoutMs ?? null;
    this.pool = new EndpointPool({
      ...options,
      kind: options.kind ?? 'rpc',
    });
  }

  /**
   * Returns current health and audit metrics for all endpoints in the pool.
   */
  public getAuditReport(): EndpointAuditRecord[] {
    return this.pool.getAuditReport();
  }

  /**
   * Posts a JSON payload to the active endpoint with automatic failover on network or HTTP error.
   *
   * @param body - JSON-serializable request payload dictionary
   * @param extraHeaders - Optional HTTP request headers
   * @returns Deserialized response payload
   * @throws {Error} If HTTP response status is not 2xx, or if node JSON payload contains an `error` property
   */
  public async postJson<T>(body: Record<string, unknown>, extraHeaders?: Record<string, string>): Promise<T> {
    return this.pool.execute(async (endpoint) => {
      const authApplication = applyHttpAuth(endpoint.auth, body, extraHeaders);

      const controller = this.timeoutMs !== null ? new AbortController() : null;
      const timer = controller && this.timeoutMs !== null
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

      let response: Response;
      try {
        response = await fetch(endpoint.url, {
          method: 'POST',
          headers: authApplication.headers,
          body: JSON.stringify(authApplication.payload),
          ...(controller ? { signal: controller.signal } : {}),
        });
      } finally {
        if (timer !== null) clearTimeout(timer);
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} ${response.statusText}`);
      }

      const json = await response.json() as { error?: string } & T;
      if (json.error) {
        throw new Error(json.error);
      }

      return json;
    });
  }
}
