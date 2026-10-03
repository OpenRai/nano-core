/**
 * Canonical Nano work difficulty vocabulary.
 *
 * Two namespaces, deliberately kept apart because they answer different questions:
 *
 * - {@link WorkDifficulty} — the levels the Nano network actually uses. This is the
 *   complete set of answers to "what difficulty must a publishable block meet".
 * - {@link SmokeTestDifficulty} — trivially cheap levels for exercising a pipeline
 *   (smoke tests, benchmarks, dashboards) without paying for a real 2^64 search.
 *
 * Historical levels are intentionally absent. A node serves a block by hash, and a
 * block carries its own work, so observing an old block's difficulty needs only the
 * hexadecimal threshold already present on the block. Naming a retired level buys
 * nothing that raw hex does not already give you, so pass hex at the seam instead.
 *
 * @see https://docs.nano.org/integration-guides/work-generation/#difficulty-thresholds
 */

/**
 * Work difficulty levels used by the Nano network.
 *
 * - `Send` — send and change blocks (0xfffffff800000000)
 * - `Receive` — receive, open, and epoch blocks (0xfffffe0000000000)
 */
export const WorkDifficulty = {
  Send: 'send',
  Receive: 'receive',
} as const;

export type WorkDifficulty = (typeof WorkDifficulty)[keyof typeof WorkDifficulty];

/**
 * Named difficulty levels for smoke testing, benchmarking, and development.
 *
 * These are not network levels and must never be used to publish a block. They exist
 * so that code exercising a proof-of-work pipeline can ask for real, valid work in
 * negligible time.
 *
 * - `Dev` — trivial development threshold (0xfe00000000000000)
 */
export const SmokeTestDifficulty = {
  Dev: 'dev',
} as const;

export type SmokeTestDifficulty = (typeof SmokeTestDifficulty)[keyof typeof SmokeTestDifficulty];

/** Any named difficulty level defined by this package. */
export type NamedWorkDifficulty = WorkDifficulty | SmokeTestDifficulty;

const THRESHOLDS: Record<NamedWorkDifficulty, string> = {
  [WorkDifficulty.Send]: 'fffffff800000000',
  [WorkDifficulty.Receive]: 'fffffe0000000000',
  [SmokeTestDifficulty.Dev]: 'fe00000000000000',
};

const CANONICAL_HEX = /^[0-9a-f]{16}$/;

/**
 * Resolves a difficulty to its canonical 16-character lowercase hexadecimal threshold.
 *
 * This is the seam between the typed vocabulary and raw hexadecimal. Callers may pass
 * a named level, a differently-cased name, or a threshold they already hold as hex;
 * all three produce the same canonical result. Anything a caller can express as hex
 * can therefore be expressed without inventing a name for it.
 *
 * @param difficulty - A named level (case-insensitive) or a 16-character hex threshold
 * @returns The canonical lowercase hexadecimal threshold
 * @throws {Error} If `difficulty` is neither a known name nor a 16-character hex string
 */
export function workDifficultyToThreshold(difficulty: string): string {
  const normalized = difficulty.trim().toLowerCase();

  const named = THRESHOLDS[normalized as NamedWorkDifficulty];
  if (named !== undefined) return named;

  if (CANONICAL_HEX.test(normalized)) return normalized;

  throw new Error(`Unsupported Nano work difficulty: ${difficulty}`);
}