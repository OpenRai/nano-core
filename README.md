<div align="center">
  <h1>@openrai/nano-core</h1>
  <p><b>The unopinionated, statically-typed, isomorphic protocol engine for the Nano (XNO) ecosystem.</b></p>

  [![npm version](https://img.shields.io/npm/v/@openrai/nano-core.svg?style=flat-square)](https://www.npmjs.com/package/@openrai/nano-core)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg)](https://www.typescriptlang.org/)
</div>

---

Historically, Nano developers have faced a fragmented integration landscape: ranging from "heavy, enterprise:y" backends to lightweight "frontend-only" implementation, suffering either from rigid vendor lock-in or fragile PoW architecture.

**`@openrai/nano-core`** extracts the most robust cryptographic, domain-driven design, and network-fallback primitives into a single, highly extensible foundation. It solves the hardest protocol challenges - such as block synchronization and different constraint between browser & backend environments - allowing developers to focus on application logic.

---

## 🚀 Key Features

* **Bypassing the "Frontier Dilemma":** Nano is a state-based block-lattice where each block depends strictly on the exact final state of the previous frontier. This strong design choise is one of the main reasons why Nano can be feeless and energy efficient, but it often becomes a stumbling block for integrations. `@openrai/nano-core` provides internal concurrent Mutex queuing to perfectly sequentialize blocks even under heavy asynchronous loads, eliminating "Fork" or "Gap" errors.
* **Isomorphic Proof-of-Work (JIT Profiling):** Wraps `nano-pow-with-fallback` in a Just-In-Time (JIT) environment profiler via `WorkProvider.auto()`. What it means is that whether running on an Apple Silicon Node.js server (jumping straight to local WebGPU) or on an aging mobile browser (delegating safely to remote servers by default), which generation method to use can be decided dynamically, without UI blocking or interfering with the current user flow. 
* **No Primitive-Obsession:** Heavily-typed, precision-safe wrappers for `NanoAmount` and `NanoAddress` entirely eliminate the "Stringly-Typed Money" programming anti-pattern.
* **Resilient RPC Fallbacks:** Configure a progressive `TransportFallback` pool to gracefully route RPC requests across independent block validators without manual catch-blocks.
* **Cross-Language FFI Preparation**: The TypeScript architecture strictly follows Domain-Driven Design (DDD) to promote close API compatibility across different eventual programming language ports of the library.

## 📦 Installation

```bash
npm install @openrai/nano-core
```
*(Peer dependency `nanocurrency` is handled internally as the cryptographic base layer for ECDSA/ed25519 hashing and signing.)*

## 🛠 Quick Start

### 1. Progressive Client Initialization
The `NanoClient` uses a "Convention over Configuration" approach. 

#### Easy Mode (All Defaults)
Out of the box, `NanoClient.initialize()` falls back to a public node pool and auto-configures the JIT Proof-of-Work environment profiler:

```typescript
import { NanoClient } from '@openrai/nano-core';

// Zero configuration required for prototyping
const protocolClient = NanoClient.initialize();
```

#### Enterprise Mode (Explicit Overrides)
For production environments, every single layer of the stack is fully overridable:

```typescript
import { 
  NanoClient, 
  TransportFallback,
  WorkProvider,
  RemoteWorkServer,
  LocalCompute
} from '@openrai/nano-core';

const protocolClient = NanoClient.initialize({
  network: 'mainnet', // [Optional] Default is 'mainnet'
  
  // [Optional] Resilient public/private node pooling
  transports: TransportFallback.of([
    'https://rpc.my-private-node.com',
    'https://rpc.nano.org'
  ]),
  
  // [Optional] JIT Environment Profiling overrides
  workProvider: WorkProvider.auto({
    remotes: [
      RemoteWorkServer.of('https://api.openrai.com/work', { timeoutMs: 5000, circuitBreakerMs: 30000 })
    ],
    localChain: [
      LocalCompute.WEBGPU, 
      LocalCompute.WASM_THREADS, 
      LocalCompute.CPU
    ],
    profiler: {
      mode: 'manual', // Explicit calibration to protect TTI
      preferLocalAboveMhs: 30, // Override threshold for server hardware 
      cacheStrategy: 'persistent'
    }
  })
});
```

### 2. Isomorphic Work Calibration
It's critical not to freeze the browser threads. On boot, evaluate the environment. `nano-core` remembers the hardware constraints across sessions.

```typescript
// Auto-detects whether local WebGPU/WASM is faster than network latency to remotes
const profile = await protocolClient.workProvider.calibrate();
console.log(`Determined active PoW strategy: ${profile.activeStrategy} at ${profile.measuredMhs} MH/s.`);
```

### 3. Precision-Safe Mutex Execution
`NanoAmount` enforces standard 30-decimal limits at compile time, rejecting invalid floats. Sending is automatically queued per-account.

```typescript
import { NanoAddress, NanoAmount } from '@openrai/nano-core';

// 1. Hydrate the Frontier
const wallet = await protocolClient.hydrateWallet(process.env.NANO_SEED, { index: 0 });

// 2. Transact
// The engine auto-queues the lock, generates PoW in the background, and broadcasts to the RPC pool.
const receipt = await wallet.send(
  NanoAddress.parse('nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4'), 
  NanoAmount.fromNano('1.25') 
);

console.log(`Transaction finalized. Hash: ${receipt}`);
```

## 📐 Architecture Comparison

If you are migrating from existing libraries:
| Feature | `@openrai/nano-core` | `nano-wallet-js` | `libnemo` | `@nano/wallet` |
| --- | --- | --- | --- | --- |
| **Concurrency Map** | High (Mutex Queues) | High | Medium | Low |
| **PoW Abstraction** | Adaptive JIT Profiler | Dedicated Server | Optional Ledger | Public Rest |
| **Type Safety** | High (`NanoAmount`) | String / BigInt | String | String |
| **Target Audience** | Enterprise & Framework Authors | Legacy Node.js | Lightweight Web Apps | Tip-Bots |

## 🤝 Contributing & Tier-1 Roadmap
`@openrai/nano-core` acts as Phase 1 of the Dual-SDK architecture (coupled alongside the higher-level `@openrai/raiflow-sdk` Business API).

Future phases will port the exact class structures above to:
1. **Rust:** Embedded systems, high-performance PoW nodes.
2. **Go:** Microservice ecosystems.
3. **Zig:** Low-latency game engine integrations.

For collaboration, please refer to the `github.com/OpenRai/nano-core` issues board.
