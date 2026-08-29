import { createPowEngine, recommendLocalPow as recommendBrowserLocalPow } from 'nano-rspow-web';
import { NanoClient as CoreNanoClient, type NanoClientOptions } from './client.js';

export const createWebPowEngine = createPowEngine;

/**
 * Return whether the browser's local WASM/WebGPU PoW path is recommended.
 *
 * The underlying recommendation is cached. Pass `true` to force a fresh
 * browser capability and performance probe.
 */
export const recommendLocalPow = recommendBrowserLocalPow;

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
