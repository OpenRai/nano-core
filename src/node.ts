import {
  clearPowTuningCache,
  createPowEngine,
  recommendLocalPow,
  workTypeToHex,
} from 'nano-rspow-node';
import { NanoClient as CoreNanoClient, type NanoClientOptions } from './client.js';

export const createNodePowEngine = createPowEngine;

/**
 * Node.js runtime convenience facade for `NanoClient`.
 * Automatically injects native multi-threaded CPU/GPU PoW engine bindings from `nano-rspow-node`.
 */
export const NanoClient = {
  /**
   * Initializes a `NanoClient` configured with Node.js native PoW hardware acceleration.
   *
   * @param options - Client initialization options
   * @returns Configured `NanoClient` instance
   */
  initialize(options: NanoClientOptions = {}): CoreNanoClient {
    if (options.workProvider) return CoreNanoClient.initialize(options);
    return CoreNanoClient.initialize({
      ...options,
      powEngine: options.powEngine ?? createPowEngine(),
      workRouting: {
        ...options.workRouting,
        selectRoute: options.workRouting?.selectRoute ?? (() => (recommendLocalPow() ? 'local' : 'remote')),
      },
    });
  },
};

export { clearPowTuningCache, recommendLocalPow, workTypeToHex };
export * from './index.js';
