import { EndpointPool } from './EndpointPool.js';
import type { EndpointAuditRecord, EndpointPoolOptions, NormalizedEndpoint } from './types.js';
import { applyWebSocketAuth } from './auth.js';

export interface WsPoolOptions extends Omit<EndpointPoolOptions, 'kind'> {}

export class WsEndpointPool {
  private readonly pool: EndpointPool;

  constructor(options: WsPoolOptions) {
    this.pool = new EndpointPool({
      ...options,
      kind: 'ws',
    });
  }

  public getAuditReport(): EndpointAuditRecord[] {
    return this.pool.getAuditReport();
  }

  public async connect(): Promise<WebSocket> {
    return this.pool.execute(async (endpoint: NormalizedEndpoint) => {
      const connectUrl = applyWebSocketAuth(new URL(endpoint.url), endpoint.auth).toString();

      return await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(connectUrl);
        ws.onopen = () => resolve(ws);
        ws.onerror = () => reject(new Error(`WebSocket connect failed: ${endpoint.auditLabel}`));
      });
    });
  }
}
