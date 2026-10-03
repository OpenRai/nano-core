# @openrai/nano-pow-contract

Runtime-neutral TypeScript contract for a Nano Proof-of-Work engine. It has no runtime dependencies and does not choose a backend, route work remotely, or define wallet policy.

`nano-rspow-node` and `nano-rspow-web` can implement `PowEngine`; `@openrai/nano-core` consumes it.

## Work difficulty vocabulary

Proof-of-work engines, providers, and RPC callers all have to agree on what a difficulty *is*. This package owns that agreement, so it is defined once here rather than re-declared by each consumer.

```ts
import { WorkDifficulty, SmokeTestDifficulty, workDifficultyToThreshold } from '@openrai/nano-pow-contract';
```

Two namespaces, deliberately kept apart because they answer different questions.

### `WorkDifficulty` — the levels the network uses

```ts
WorkDifficulty.Send;    // 'send'     -> 0xfffffff800000000  (send, change)
WorkDifficulty.Receive; // 'receive'  -> 0xfffffe0000000000  (receive, open, epoch)
```

This is the complete set of answers to "what difficulty must a publishable block meet".

### `SmokeTestDifficulty` — trivially cheap levels

```ts
SmokeTestDifficulty.Dev; // 'dev' -> 0xfe00000000000000
```

For exercising a proof-of-work pipeline — smoke tests, benchmarks, dashboards — without paying for a real 2^64 search. **Not a network level, and never valid for publishing a block.**

These live in separate objects rather than one flat table so that reaching for a trivial level cannot land you next to a network level by accident, and neither namespace has to grow to accommodate the other.

### `workDifficultyToThreshold` — the seam

```ts
workDifficultyToThreshold(WorkDifficulty.Send); // 'fffffff800000000'
workDifficultyToThreshold('fffffff800000000'); // 'fffffff800000000'
workDifficultyToThreshold('  send  ');         // 'fffffff800000000'
workDifficultyToThreshold('FFFFFFF800000000'); // 'fffffff800000000'
workDifficultyToThreshold('epoch1');           // throws
```

Names are case-insensitive, surrounding whitespace is tolerated, and hex passes through canonicalized to lowercase. Anything a caller can express as hex can be expressed **without inventing a name for it**.

### Why there are no historical levels

You might expect `Epoch1`, `BetaEpoch1`, and similar here. They are deliberately absent.

A node serves a block by hash, and the block carries its own work. So observing an old block's difficulty needs only the hexadecimal threshold already sitting on the block — naming a retired level buys nothing that raw hex does not already give you. Pass hex at the seam instead.

Engines that need to generate or validate against a non-network threshold (benchmarks, block-archiving tooling) should expose their own presets for that; they are engine concerns, not protocol vocabulary.

## Engines take hex, providers take names

The two layers answer different questions, so they accept different things:

```ts
interface PowEngine {
  generate(root: string, threshold: string): Promise<string>; // canonical hex
  validate(root: string, work: string, threshold: string): boolean;
}
```

`PowEngine` is deliberately runtime-neutral and stays in hex. The named vocabulary lives one layer up, in `WorkProvider` / this package, so that an engine never needs to know the network's vocabulary and this contract never needs to know about any particular backend.

```ts
// A provider accepts a name or hex and resolves it for you.
await provider.generate(root, WorkDifficulty.Receive);
await provider.generate(root, 'fffffe0000000000'); // same thing
```

## License

MIT