import { createPowEngine } from 'nano-rspow-web';
import { NanoClient as CoreNanoClient, type NanoClientOptions } from './client.js';

export const createWebPowEngine = createPowEngine;

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
