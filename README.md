# @openrai/nano-core

The Gold Standard for generic, statically-typed, isomorphic Nano (XNO) developer primitives.

This package separates the core protocol concerns (block handling, RPC fallback, PoW generation) from business logic, serving as the lowest-level foundation for modern Nano applications. It is built strictly with Domain-Driven Design (DDD) to serve as a 1:1 reference for upcoming native bindings in Rust, Go, and Zig.

## Features

- **The Frontier Dilemma Solved**: Mutex queue handling to prevent invalid intermediate account states.
- **Isomorphic PoW Generation**: JIT Environment Profiling that dynamically picks the fastest Proof-of-Work hardware constraint available (WebGPU -> WebGL -> WASM Threads -> CPU).
- **Strongly Typed Primitives**: Complete eradication of stringly-typed money representations via standard `NanoAmount` and `NanoAddress` utilities.
- **Failover Architectures**: Built-in support for multiple RPC Nodes and Circuit-Breaking Remote Work Providers.

## Installation

```bash
npm install @openrai/nano-core
```
