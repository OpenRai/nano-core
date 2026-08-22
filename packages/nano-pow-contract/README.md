# @openrai/nano-pow-contract

Runtime-neutral TypeScript contract for a Nano Proof-of-Work engine. It has no runtime dependencies and does not choose a backend, route work remotely, or define wallet policy.

`nano-rspow-node` and `nano-rspow-web` can implement `PowEngine`; `@openrai/nano-core` consumes it.
