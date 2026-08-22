import { HttpEndpointPool, type HttpPoolOptions } from './transport/http.js';
import { WsEndpointPool, type WsPoolOptions } from './transport/ws.js';
import { WorkProvider, type PowEngine, type RemotePowEngine, type WorkRoute } from './work/WorkProvider.js';
import type { EndpointActivityEvent, EndpointAuditRecord, EndpointKind } from './transport/types.js';
import { NanoWallet, type HydrateWalletOptions } from './wallet/NanoWallet.js';

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
  /** A caller-supplied local engine. Runtime facades provide this automatically. */
  powEngine?: PowEngine;
  workRouting?: {
    selectRoute?: () => WorkRoute;
    onRemoteFailure?: 'error' | 'local';
  };
  warn?: (message: string) => void;
}

export interface NanoClientActiveEndpoints {
  rpc?: string;
  ws?: string;
  work?: string;
}

export interface NanoClientAuditReport {
  network: 'mainnet' | 'testnet' | 'beta';
  rpc: EndpointAuditRecord[];
  ws: EndpointAuditRecord[];
  work?: EndpointAuditRecord[];
  workProvider: ReturnType<WorkProvider['getAuditReport']>;
}

export class NanoClient {
  public workProvider: WorkProvider;
  public rpcPool: HttpEndpointPool;
  public wsPool: WsEndpointPool;
  public workPool?: HttpEndpointPool;
  private options: NanoClientOptions;
  private readonly endpointListeners: Set<(event: EndpointActivityEvent) => void>;
  private readonly activeEndpoints: Partial<Record<EndpointKind, string>>;
  
  private constructor(options: NanoClientOptions) {
    this.options = options;
    this.endpointListeners = new Set();
    this.activeEndpoints = {};
    const warn = options.warn ?? ((message: string) => console.warn(`[nano-core] ${message}`));
    const forwardEndpointChange = (event: EndpointActivityEvent): void => {
      this.activeEndpoints[event.kind] = event.activeUrl;
      for (const listener of this.endpointListeners) {
        listener(event);
      }
    };
    const defaultRpc = [
      'https://rpc.nano.to',
      'https://node.somenano.com/proxy',
      'https://rainstorm.city/api',
      'https://nanoslo.0x.no/proxy',
    ];
    const defaultWs = ['wss://rpc.nano.to'];
    const rpcUrls = options.rpc ?? options.transports?.urls;
    const environment = typeof process === 'undefined' ? undefined : process.env;
    const rpcEnv = environment?.['NANO_RPC_URL'];
    const wsEnv = environment?.['NANO_WS_URL'];

    const rpcOptions: HttpPoolOptions = {
      kind: 'rpc',
      defaults: defaultRpc,
      warn,
      onActiveEndpointChange: forwardEndpointChange,
    };
    if (rpcUrls && rpcUrls.length > 0) rpcOptions.urls = rpcUrls;
    if (rpcEnv) rpcOptions.env = rpcEnv;
    this.rpcPool = new HttpEndpointPool(rpcOptions);

    const wsOptions: WsPoolOptions = {
      defaults: defaultWs,
      warn,
      onActiveEndpointChange: forwardEndpointChange,
    };
    if (options.ws && options.ws.length > 0) wsOptions.urls = options.ws;
    if (wsEnv) wsOptions.env = wsEnv;
    this.wsPool = new WsEndpointPool(wsOptions);

    const workEnv = environment?.['NANO_WORK_URL'];
    const hasConfiguredWork = (options.work?.length ?? 0) > 0 || Boolean(workEnv);
    if (options.workProvider && ((options.work?.length ?? 0) > 0 || options.workRouting)) {
      throw new Error('workProvider cannot be combined with work or workRouting options');
    }

    if (!options.workProvider && hasConfiguredWork) {
      this.workPool = new HttpEndpointPool({
        kind: 'work',
        defaults: [],
        warn,
        onActiveEndpointChange: forwardEndpointChange,
        ...(options.work && options.work.length > 0 ? { urls: options.work } : {}),
        ...(workEnv ? { env: workEnv } : {}),
      });
    }

    const remoteEngine: RemotePowEngine | undefined = this.workPool ? {
      name: 'rpc-work',
      generate: async (hash, threshold) => {
        const response = await this.workPool!.postJson<{ work: string }>({
          action: 'work_generate',
          hash,
          difficulty: threshold,
        });
        return response.work;
      },
    } : undefined;
    this.workProvider = options.workProvider ?? WorkProvider.auto({
      ...(options.powEngine ? { localEngine: options.powEngine } : {}),
      ...(remoteEngine ? { remoteEngine } : {}),
      ...(options.workRouting?.selectRoute ? { selectRoute: options.workRouting.selectRoute } : {}),
      ...(options.workRouting?.onRemoteFailure ? { onRemoteFailure: options.workRouting.onRemoteFailure } : {}),
    });
  }

  public static initialize(options: NanoClientOptions = {}): NanoClient {
    return new NanoClient(options);
  }

  public onEndpointChange(listener: (event: EndpointActivityEvent) => void): () => void {
    this.endpointListeners.add(listener);
    return () => this.endpointListeners.delete(listener);
  }

  public getActiveEndpoints(): NanoClientActiveEndpoints {
    return {
      ...(this.activeEndpoints.rpc ? { rpc: this.activeEndpoints.rpc } : {}),
      ...(this.activeEndpoints.ws ? { ws: this.activeEndpoints.ws } : {}),
      ...(this.activeEndpoints.work ? { work: this.activeEndpoints.work } : {}),
    };
  }

  /**
   * Generates a minimal JSON-serializable report of the active configuration.
   * Useful for deploy-time auditing and startup logs to detect misconfigurations.
   */
  public getAuditReport(): NanoClientAuditReport {
    return {
      network: this.options.network ?? 'mainnet',
      rpc: this.rpcPool.getAuditReport(),
      ws: this.wsPool.getAuditReport(),
      ...(this.workPool ? { work: this.workPool.getAuditReport() } : {}),
      workProvider: this.workProvider.getAuditReport(),
    };
  }

  public hydrateWallet(seed: string, options: HydrateWalletOptions = {}): NanoWallet {
    return NanoWallet.hydrate(this, seed, options);
  }
}
