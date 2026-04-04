import { EndpointPool } from './EndpointPool.js';
import type { EndpointAuditRecord, EndpointPoolOptions, NormalizedEndpoint } from './types.js';

export interface HttpPoolOptions extends Omit<EndpointPoolOptions, 'kind'> {
  kind?: 'rpc' | 'work';
  timeoutMs?: number;
}

function buildHeaders(endpoint: NormalizedEndpoint, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders ?? {}),
  };

  if (endpoint.auth.type === 'api-key') {
    headers['Authorization'] = `Bearer ${endpoint.auth.value}`;
  }

  return headers;
}

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

  public getAuditReport(): EndpointAuditRecord[] {
    return this.pool.getAuditReport();
  }

  public async postJson<T>(body: Record<string, unknown>, extraHeaders?: Record<string, string>): Promise<T> {
    return this.pool.execute(async (endpoint) => {
      const payload = endpoint.auth.type === 'api-key' && endpoint.auth.policy === 'json-body-key'
        ? { ...body, key: endpoint.auth.value }
        : endpoint.auth.type === 'api-key' && endpoint.auth.policy === 'bearer-and-json-body-key'
          ? { ...body, key: endpoint.auth.value }
          : body;

      const controller = this.timeoutMs !== null ? new AbortController() : null;
      const timer = controller && this.timeoutMs !== null
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

      let response: Response;
      try {
        response = await fetch(endpoint.url, {
          method: 'POST',
          headers: buildHeaders(endpoint, extraHeaders),
          body: JSON.stringify(payload),
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
