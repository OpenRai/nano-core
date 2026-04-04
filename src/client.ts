import { HttpEndpointPool, type HttpPoolOptions } from './transport/http.js';
import { WsEndpointPool, type WsPoolOptions } from './transport/ws.js';
import { WorkProvider, type WorkProviderOptions } from './work/WorkProvider.js';

export interface TransportFallback {
  urls: string[];
}

export const TransportFallback = {
  of: (urls: string[]): TransportFallback => ({ urls })
};

export interface NanoClientOptions {
  network?: 'mainnet' | 'testnet' | 'beta';
  transports?: TransportFallback;
  rpc?: string[];
  ws?: string[];
  work?: string[];
  workProvider?: WorkProvider;
  warn?: (message: string) => void;
}

export class NanoClient {
  public workProvider: WorkProvider;
  public rpcPool: HttpEndpointPool;
  public wsPool: WsEndpointPool;
  private options: NanoClientOptions;
  
  private constructor(options: NanoClientOptions) {
    this.options = options;
    const warn = options.warn ?? ((message: string) => console.warn(`[nano-core] ${message}`));
    const defaultRpc = [
      'https://rpc.nano.to',
      'https://node.somenano.com/proxy',
      'https://rainstorm.city/api',
      'https://nanoslo.0x.no/proxy',
    ];
    const defaultWs = ['wss://rpc.nano.to'];
    const defaultWork = ['https://rpc.nano.to'];
    const rpcUrls = options.rpc ?? options.transports?.urls;
    const rpcEnv = process.env['NANO_RPC_URL'];
    const wsEnv = process.env['NANO_WS_URL'];
    const workEnv = process.env['NANO_WORK_URL'];

    const rpcOptions: HttpPoolOptions = {
      kind: 'rpc',
      defaults: defaultRpc,
      warn,
    };
    if (rpcUrls && rpcUrls.length > 0) rpcOptions.urls = rpcUrls;
    if (rpcEnv) rpcOptions.env = rpcEnv;
    this.rpcPool = new HttpEndpointPool(rpcOptions);

    const wsOptions: WsPoolOptions = {
      defaults: defaultWs,
      warn,
    };
    if (options.ws && options.ws.length > 0) wsOptions.urls = options.ws;
    if (wsEnv) wsOptions.env = wsEnv;
    this.wsPool = new WsEndpointPool(wsOptions);

    const workOptions: WorkProviderOptions = {
      defaults: defaultWork,
      warn,
    };
    if (options.work && options.work.length > 0) workOptions.urls = options.work;
    if (workEnv) workOptions.env = workEnv;

    this.workProvider = options.workProvider ?? WorkProvider.auto(workOptions);
  }

  public static initialize(options: NanoClientOptions = {}): NanoClient {
    return new NanoClient(options);
  }

  /**
   * Generates a minimal JSON-serializable report of the active configuration.
   * Useful for deploy-time auditing and startup logs to detect misconfigurations.
   */
  public getAuditReport(): Record<string, any> {
    return {
      network: this.options.network ?? 'mainnet',
      rpc: this.rpcPool.getAuditReport(),
      ws: this.wsPool.getAuditReport(),
      workProvider: this.workProvider.getAuditReport()
    };
  }

  public async hydrateWallet(seed: string, options: { index?: number } = {}) {
    // Placeholder block-lattice interaction
    return {
      send: async (address: any, amount: any) => {
        return 'dummy_hash';
      }
    };
  }
}
