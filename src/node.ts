import {
  clearPowTuningCache,
  createPowEngine,
  recommendLocalPow,
  workTypeToHex,
} from 'nano-rspow-node';
import { NanoClient as CoreNanoClient, type NanoClientOptions } from './client.js';

export const createNodePowEngine = createPowEngine;

/**
 * Node convenience facade. It supplies the native PoW engine and retains the
 * synchronous Golden Path while the protocol client remains runtime-neutral.
 */
export const NanoClient = {
  initialize(options: NanoClientOptions = {}): CoreNanoClient {
    if (options.workProvider) return CoreNanoClient.initialize(options);
    return CoreNanoClient.initialize({
      ...options,
      powEngine: options.powEngine ?? createPowEngine(),
      workRouting: {
        ...options.workRouting,
        selectRoute: options.workRouting?.selectRoute ?? (() => recommendLocalPow() ? 'local' : 'remote'),
      },
    });
  },
};

export { clearPowTuningCache, recommendLocalPow, workTypeToHex };
export * from './index.js';
