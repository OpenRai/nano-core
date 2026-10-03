import {
  clearPowTuningCache,
  createPowEngine,
  recommendLocalPow,
  workTypeToHex as rspowWorkTypeToHex,
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

/**
 * Maps a `nano-rspow-node` work type to its canonical 16-hex threshold.
 *
 * @deprecated The vocabulary belongs to the package that defines it, not to whichever
 * engine happens to be bound. `workTypeToHex` takes `nano-rspow-node`'s `WorkType`,
 * while `@openrai/nano-pow-contract` owns the canonical vocabulary — so importing this
 * from `@openrai/nano-core/node` invites consumers to bind their difficulty types to an
 * engine implementation.
 *
 * Use {@link workDifficultyToThreshold} instead. It accepts a name *or* a threshold
 * already held as hex, so callers are not forced to import an engine's enum:
 *
 * ```ts
 * import { workDifficultyToThreshold } from '@openrai/nano-core';
 * workDifficultyToThreshold(WorkDifficulty.Receive); // 'fffffe0000000000'
 * workDifficultyToThreshold('fffffe0000000000');    // same
 * ```
 *
 * Still exported, and still supported, for engines that need the engine-specific
 * `LegacyWorkType` / `TestingWorkType` presets.
 *
 * @see https://github.com/OpenRai/nano-core/blob/main/packages/nano-pow-contract/README.md
 */
export const workTypeToHex = rspowWorkTypeToHex;

export { clearPowTuningCache, recommendLocalPow };
export * from './index.js';
