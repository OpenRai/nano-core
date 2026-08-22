import init, { generate_work, validate_work } from 'nano-rspow-web';
import type { PowEngine } from '@openrai/nano-pow-contract';
import { NanoClient as CoreNanoClient, type NanoClientOptions } from './client.js';

/** Local PoW adapter backed by nano-rspow's WebAssembly/WebGPU package. */
export class NanoRspowWebEngine implements PowEngine {
  public readonly name = 'nano-rspow-web';
  private readonly initialization: Promise<void>;
  private initialized = false;

  public constructor() {
    this.initialization = init().then(() => { this.initialized = true; });
  }

  public static create(): NanoRspowWebEngine {
    return new NanoRspowWebEngine();
  }

  public async ready(): Promise<void> {
    await this.initialization;
  }

  public async generate(root: string, threshold: string): Promise<string> {
    await this.ready();
    return (await generate_work(root, threshold)).nonce;
  }

  public validate(root: string, work: string, threshold: string): boolean {
    if (!this.initialized) throw new Error('nano-rspow-web is not initialized');
    return validate_work(root, work, threshold);
  }
}

export function createWebPowEngine(): PowEngine {
  return NanoRspowWebEngine.create();
}

/**
 * Browser convenience facade. Its PoW engine initializes WASM before first use.
 */
export const NanoClient = {
  initialize(options: NanoClientOptions = {}): CoreNanoClient {
    if (options.workProvider) return CoreNanoClient.initialize(options);
    return CoreNanoClient.initialize({
      ...options,
      powEngine: options.powEngine ?? createWebPowEngine(),
    });
  },
};

export * from './index.js';
