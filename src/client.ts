import { HttpEndpointPool, type HttpPoolOptions } from './transport/http.js';
import { WsEndpointPool, type WsPoolOptions } from './transport/ws.js';
import { WorkProvider, type PowEngine, type RemotePowEngine, type WorkRoute } from './work/WorkProvider.js';
import type { EndpointActivityEvent, EndpointAuditRecord, EndpointKind } from './transport/types.js';
import { NanoWallet, type HydrateWalletOptions } from './wallet/NanoWallet.js';
import type { SeedString } from './primitives/types.js';

export interface TransportFallback {
  urls: string[];
}

export const TransportFallback = {
  of: (urls: string[]): TransportFallback => ({ urls }),
};

/**
 * Initialization configuration for `NanoClient`.
 */
export interface NanoClientOptions {
  /** Target network environment ('mainnet', 'testnet', or 'beta'). Defaults to 'mainnet'. */
  network?: 'mainnet' | 'testnet' | 'beta';
  /** Fallback endpoint configuration. */
  transports?: TransportFallback;
  /** Ordered list of RPC node endpoints. */
  rpc?: string[];
  /** Ordered list of WebSocket endpoints. */
  ws?: string[];
  /** Ordered list of dedicated Proof of Work generation server endpoints. */
  work?: string[];
  /** Custom `WorkProvider` instance. Cannot be combined with `work` or `workRouting`. */
  workProvider?: WorkProvider;
  /** Caller-supplied local PoW engine. Runtime facades (node / web) provide this automatically. */
  powEngine?: PowEngine;
  /** Routing and failure policies for Proof of Work computation. */
  workRouting?: {
    selectRoute?: () => WorkRoute;
    onRemoteFailure?: 'error' | 'local';
  };
  /** Custom warning log handler. */
  warn?: (message: string) => void;
}

/**
 * URIs of currently connected active endpoints across transport protocols.
 */
export interface NanoClientActiveEndpoints {
  rpc?: string;
  ws?: string;
  work?: string;
}

/**
 * Diagnostic audit report of transport and PoW engine configurations.
 */
export interface NanoClientAuditReport {
  network: 'mainnet' | 'testnet' | 'beta';
  rpc: EndpointAuditRecord[];
  ws: EndpointAuditRecord[];
  work?: EndpointAuditRecord[];
  workProvider: ReturnType<WorkProvider['getAuditReport']>;
}

/**
 * Primary integration client coordinating RPC communication, WebSocket subscriptions, PoW generation, and wallet hydration.
 */
export class NanoClient {
  /** Configured WorkProvider instance managing local and remote PoW calculation. */
  public workProvider: WorkProvider;
  /** Resilient HTTP connection pool for node RPC requests. */
  public rpcPool: HttpEndpointPool;
  /** Resilient WebSocket connection pool for real-time block and confirmation streams. */
  public wsPool: WsEndpointPool;
  /** Optional dedicated HTTP connection pool for remote PoW servers. */
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

    const remoteEngine: RemotePowEngine | undefined = this.workPool
      ? {
          name: 'rpc-work',
          generate: async (hash, threshold) => {
            const response = await this.workPool!.postJson<{ work: string }>({
              action: 'work_generate',
              hash,
              difficulty: threshold,
            });
            return response.work;
          },
        }
      : undefined;
    this.workProvider =
      options.workProvider ??
      WorkProvider.auto({
        ...(options.powEngine ? { localEngine: options.powEngine } : {}),
        ...(remoteEngine ? { remoteEngine } : {}),
        ...(options.workRouting?.selectRoute ? { selectRoute: options.workRouting.selectRoute } : {}),
        ...(options.workRouting?.onRemoteFailure ? { onRemoteFailure: options.workRouting.onRemoteFailure } : {}),
      });
  }

  /**
   * Initializes a new `NanoClient` with provided transport and PoW routing options.
   *
   * @param options - Transport, network, and PoW configuration options
   * @returns Configured `NanoClient` instance
   */
  public static initialize(options: NanoClientOptions = {}): NanoClient {
    return new NanoClient(options);
  }

  /**
   * Subscribes to endpoint status changes and failover events.
   *
   * @param listener - Callback invoked on connection or failover
   * @returns Unsubscribe cleanup function
   */
  public onEndpointChange(listener: (event: EndpointActivityEvent) => void): () => void {
    this.endpointListeners.add(listener);
    return () => this.endpointListeners.delete(listener);
  }

  /**
   * Returns active connected URLs for each configured transport protocol.
   */
  public getActiveEndpoints(): NanoClientActiveEndpoints {
    return {
      ...(this.activeEndpoints.rpc ? { rpc: this.activeEndpoints.rpc } : {}),
      ...(this.activeEndpoints.ws ? { ws: this.activeEndpoints.ws } : {}),
      ...(this.activeEndpoints.work ? { work: this.activeEndpoints.work } : {}),
    };
  }

  /**
   * Generates a minimal JSON-serializable report of active transport configurations and health states.
   * Useful for deploy-time auditing and startup logs.
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

  /**
   * Derives and hydrates a `NanoWallet` instance bound to this client's RPC and PoW pipeline.
   *
   * @param seed - 64-character hexadecimal master seed
   * @param options - Derivation index options
   * @returns Hydrated `NanoWallet` instance
   */
  public hydrateWallet(seed: string | SeedString, options: HydrateWalletOptions = {}): NanoWallet {
    return NanoWallet.hydrate(this, seed, options);
  }
}
