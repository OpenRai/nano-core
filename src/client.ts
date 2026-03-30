import { WorkProvider } from './work/WorkProvider.js';

export interface TransportFallback {
  urls: string[];
}

export const TransportFallback = {
  of: (urls: string[]): TransportFallback => ({ urls })
};

export interface NanoClientOptions {
  network?: 'mainnet' | 'testnet' | 'beta';
  transports?: TransportFallback;
  workProvider?: WorkProvider;
}

export class NanoClient {
  public workProvider: WorkProvider;
  private options: NanoClientOptions;
  
  private constructor(options: NanoClientOptions) {
    this.options = options;
    this.workProvider = options.workProvider ?? WorkProvider.auto({});
  }

  public static initialize(options: NanoClientOptions = {}): NanoClient {
    return new NanoClient(options);
  }

  /**
   * Generates a minimal JSON-serializable report of the active configuration.
   * Useful for deploy-time auditing and startup logs to detect misconfigurations.
   */
  public getAuditReport(): Record<string, any> {
    const defaultTransports = ['https://rpc.nano.org'];
    return {
      network: this.options.network ?? 'mainnet',
      transports: this.options.transports?.urls ?? defaultTransports,
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
