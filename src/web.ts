import { createPowEngine } from 'nano-rspow-web';
import { NanoClient as CoreNanoClient, type NanoClientOptions } from './client.js';

export const createWebPowEngine = createPowEngine;

/**
 * Web browser convenience facade for `NanoClient`.
 * Automatically injects WebAssembly / WebGL hardware-accelerated PoW engine bindings from `nano-rspow-web`.
 */
export const NanoClient = {
  /**
   * Initializes a `NanoClient` configured for web browser environments.
   *
   * @param options - Client initialization options
   * @returns Configured `NanoClient` instance
   */
  initialize(options: NanoClientOptions = {}): CoreNanoClient {
    if (options.workProvider) return CoreNanoClient.initialize(options);
    return CoreNanoClient.initialize({
      ...options,
      powEngine: options.powEngine ?? createWebPowEngine(),
    });
  },
};

export * from './index.js';
