import { EndpointPool } from './EndpointPool.js';
import type { EndpointAuditRecord, EndpointPoolOptions, NormalizedEndpoint } from './types.js';

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
      let connectUrl = endpoint.url.toString();

      if (endpoint.auth.type === 'api-key') {
        const url = new URL(connectUrl);
        url.searchParams.set('api_key', endpoint.auth.value);
        connectUrl = url.toString();
      }

      return await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(connectUrl);
        ws.onopen = () => resolve(ws);
        ws.onerror = () => reject(new Error(`WebSocket connect failed: ${endpoint.auditLabel}`));
      });
    });
  }
}
