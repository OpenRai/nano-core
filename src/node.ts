import {
  clearPowTuningCache,
  generateWork,
  recommendLocalPow,
  validateWork,
  workTypeToHex,
} from 'nano-rspow-node';
import type { WorkType } from 'nano-rspow-node';
import type { PowEngine } from '@openrai/nano-pow-contract';
import { NanoClient as CoreNanoClient, type NanoClientOptions } from './client.js';

/** Local PoW adapter backed by the native nano-rspow binding. */
export class NanoRspowNodeEngine implements PowEngine {
  public readonly name = 'nano-rspow-node';

  public async generate(root: string, threshold: string): Promise<string> {
    return await generateWork(root, thresholdToWorkType(threshold));
  }

  public validate(root: string, work: string, threshold: string): boolean {
    return validateWork(root, work, thresholdToWorkType(threshold));
  }
}

function thresholdToWorkType(threshold: string): WorkType {
  const normalized = threshold.toLowerCase();
  for (const workType of ['Send', 'Receive', 'LegacyEpoch1', 'Dev'] as const) {
    if (workTypeToHex(workType as WorkType).toLowerCase() === normalized) return workType as WorkType;
  }
  throw new Error(`Unsupported Nano work threshold: ${threshold}`);
}

export function createNodePowEngine(): PowEngine {
  return new NanoRspowNodeEngine();
}

/**
 * Node convenience facade. It supplies the native PoW engine and retains the
 * synchronous Golden Path while the protocol client remains runtime-neutral.
 */
export const NanoClient = {
  initialize(options: NanoClientOptions = {}): CoreNanoClient {
    if (options.workProvider) return CoreNanoClient.initialize(options);
    return CoreNanoClient.initialize({
      ...options,
      powEngine: options.powEngine ?? createNodePowEngine(),
      workRouting: {
        ...options.workRouting,
        selectRoute: options.workRouting?.selectRoute ?? (() => recommendLocalPow() ? 'local' : 'remote'),
      },
    });
  },
};

export { clearPowTuningCache, recommendLocalPow, workTypeToHex };
export * from './index.js';
