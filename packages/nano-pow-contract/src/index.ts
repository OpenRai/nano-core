/**
 * A runtime-neutral Nano Proof-of-Work engine.
 *
 * Implementations may use native code, WebAssembly, a GPU, or another local
 * execution strategy. Callers provide canonical hexadecimal strings.
 */
export interface PowEngine {
  /** Human-readable identifier for audit output. */
  readonly name: string;

  /** Generate a valid 16-character hexadecimal work nonce for a block root. */
  generate(root: string, threshold: string): Promise<string>;

  /** Validate a work nonce against a block root and threshold. */
  validate(root: string, work: string, threshold: string): boolean;
}
