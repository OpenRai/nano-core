<div align="center">
  <h1>@openrai/nano-core</h1>
  <p><b>Typed Nano primitives plus practical client utilities for RPC, WebSocket, and work generation.</b></p>

  [![npm version](https://img.shields.io/npm/v/@openrai/nano-core.svg?style=flat-square)](https://www.npmjs.com/package/@openrai/nano-core)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg)](https://www.typescriptlang.org/)
</div>

---

`@openrai/nano-core` provides typed Nano primitives and a small transport layer for applications that need reliable RPC, WebSocket, and work generation behavior without rebuilding endpoint parsing, auth handling, failover, or audit visibility. It is designed for direct use in services, scripts, and browser-capable clients, with explicit defaults and observable transport state.

## 📦 Installation

```bash
npm install @openrai/nano-core
```
*(Peer dependency `nanocurrency` is handled internally as the cryptographic base layer for ECDSA/ed25519 hashing and signing.)*

## 🛠 Quick Start

### 1. Minimal Client
The default surface should feel obvious on first read:

```typescript
import { NanoClient } from '@openrai/nano-core';

const client = NanoClient.initialize({
  rpc: [
    'https://rpc.primary.example.com?apiKey=secret-rpc',
    'https://rpc.nano.to',
  ], // [Optional] Defaults to the April 2026 public RPC set
  ws: [
    'wss://ws.primary.example.com?api_key=secret-ws',
    'wss://rpc.nano.to',
  ], // [Optional] Defaults to public WebSocket endpoints
  work: [
    'https://work.primary.example.com?key=secret-work',
    'https://rpc.nano.to',
  ], // [Optional] Defaults to `https://rpc.nano.to` as the current public work endpoint
  warn: (message) => console.warn(message), // [Optional] Defaults to console.warn with nano-core prefix
});

console.log(client.getAuditReport());
```

### 1.1 Observe Endpoint Selection

Long-running services can observe which upstream endpoint became active without
mutating transport configuration at runtime:

```typescript
import { NanoClient } from '@openrai/nano-core';

const client = NanoClient.initialize();

const unsubscribe = client.onEndpointChange((event) => {
  console.log(event.kind, event.status, event.activeUrl, event.previousUrl);
});

console.log(client.getActiveEndpoints());
// { rpc?: string, ws?: string, work?: string }

// Later:
unsubscribe();
```

This is an observe-only API. It does not reconfigure pools or alter failover
policy; it simply exposes which endpoint was selected after a successful RPC,
WS, or work operation.

What this buys you immediately:

- comma-separated env vars also work: `NANO_RPC_URL`, `NANO_WS_URL`, `NANO_WORK_URL`
- malformed or duplicate endpoints are dropped during construction
- API keys in query params or URL userinfo are extracted and redacted from audit output
- failover and endpoint-local backoff happen inside the pool, not in your app code

Current built-in defaults as of April 2026:

- RPC: `https://rpc.nano.to`, `https://node.somenano.com/proxy`, `https://rainstorm.city/api`, `https://nanoslo.0x.no/proxy`
- WS: `wss://rpc.nano.to`
- Work: `https://rpc.nano.to`

### 2. Zero-Config Prototype Mode
Out of the box, `NanoClient.initialize()` falls back to default public RPC / WS / work pools and auto-configures the work provider:

```typescript
import { NanoClient } from '@openrai/nano-core';

const client = NanoClient.initialize();
```

### 3. Explicit Override Mode
For production environments, you can override only the pieces you care about while keeping the same normalized pool behavior:

```typescript
import {
  NanoClient,
  WorkProvider,
  RemoteWorkServer,
  LocalCompute,
} from '@openrai/nano-core';

const client = NanoClient.initialize({
  network: 'mainnet', // [Optional] Defaults to 'mainnet'
  rpc: [
    'https://rpc.private.example.com?apiKey=secret-rpc',
    'https://rpc.nano.to',
  ], // [Optional] Defaults to the April 2026 public RPC set
  ws: [
    'wss://ws.private.example.com?api_key=secret-ws',
    'wss://rpc.nano.to',
  ], // [Optional] Defaults to public WebSocket endpoints
  workProvider: WorkProvider.auto({
    urls: [
      'https://work.private.example.com?key=secret-work',
    ], // [Optional] Defaults to `https://rpc.nano.to` when omitted
    remotes: [
      RemoteWorkServer.of(
        'https://work-backup.example.com',
        {
          timeoutMs: 5000, // [Optional] Defaults to 5000
          circuitBreakerMs: 30000, // [Optional] Reserved for future tuning
        },
      ),
    ], // [Optional] Additional remote work backends
    localChain: [
      LocalCompute.WEBGPU,
      LocalCompute.WASM_THREADS,
      LocalCompute.CPU,
    ], // [Optional] Local fallback order
    profiler: {
      mode: 'manual',
      preferLocalAboveMhs: 30,
      cacheStrategy: 'persistent',
    }, // [Optional] Calibration strategy overrides
    warn: (message) => console.warn(message), // [Optional] Defaults to console.warn with nano-core prefix
  }), // [Optional] Defaults to WorkProvider.auto(...) using normalized work endpoints
  warn: (message) => console.warn(message), // [Optional] Defaults to console.warn with nano-core prefix
});
```

### 4. Isomorphic Work Calibration
It's critical not to freeze the browser threads. On boot, evaluate the environment. `nano-core` remembers the hardware constraints across sessions.

```typescript
// Auto-detects whether local WebGPU/WASM is faster than network latency to remotes
const profile = await client.workProvider.calibrate();
console.log(`Determined active PoW strategy: ${profile.activeStrategy} at ${profile.measuredMhs} MH/s.`);
```

### 5. Precision-Safe Execution
`NanoAmount` and `NanoAddress` give you typed protocol primitives immediately, even while the higher-level wallet surface is still being filled out.

```typescript
import { NanoAddress, NanoAmount } from '@openrai/nano-core';

const destination = NanoAddress.parse(
  'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4',
);

const amount = NanoAmount.fromNano('1.25');

const wallet = await client.hydrateWallet(
  process.env.NANO_SEED,
  { index: 0 }, // [Optional] Defaults to account index 0
);

console.log({ destination, amount, wallet });
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

---

## Addendum II: Browser Hostility & The Isomorphic Sandbox

### 1. The Browser Execution Reality

While Node.js provides unthrottled access to host silicon (delivering ~104 MH/s on Apple M1 architectures), browsers operate under strict security and power-management sandboxes. Empirical testing across modern Chromium (Brave) and WebKit (Safari) engines reveals that relying on static hardware fallbacks in a web environment is a critical architectural risk.

Browser engines dynamically throttle compute APIs based on task duration and thread count, leading to three distinct phenomena that the SDK must navigate:

#### A. The WebGPU "Throttle Cliff" (Sprint vs. Marathon)
WebGPU is highly unpredictable in the browser. 
* **The Burst:** On low-difficulty thresholds (e.g., `Open/Receive`), browsers allow WebGPU to run at maximum voltage, completing the task in milliseconds (bursting up to ~2,000 MH/s in Safari). 
* **The Throttle:** [Inference] On high-difficulty thresholds (e.g., `Send/Change`), the task takes longer. Once the compute shader runs past a specific time budget (often 1-2 seconds), browser watchdogs classify it as a runaway script or a crypto-miner. The engine violently throttles the GPU context to protect the UI thread, causing HashRates to collapse by up to 98% (e.g., dropping from 336 MH/s to 7.5 MH/s in Chromium).

#### B. The WASM "Death Spiral" (Thread Starvation)
Counter-intuitively, spawning multiple Web Workers for WASM computation degrades performance in aggressive sandboxes like Safari. 
* [Inference] When the SDK requests 8 parallel WASM threads for a sustained `Send/Change` calculation, the browser's resource scheduler intervenes to prevent thermal throttling and battery drain. It starves the workers of CPU cycles, resulting in multi-threaded executions taking significantly *longer* than single-threaded executions (e.g., spanning upwards of 4.5 minutes for a single block).

#### C. WebGL: The Predictable Baseline
Across all tested engines, WebGL is the most consistently paced API. Because it taps into the legacy rendering pipeline, browsers are less likely to violently throttle it mid-task. It maintains a slow but predictable ~15 MH/s regardless of the threshold difficulty.

### 2. Conclusion: The Necessity of JIT Profiling

These findings conclusively validate the `WorkProvider.auto()` architecture. The SDK cannot assume local hardware is safe just because `navigator.gpu` exists. 

The JIT Environment Profiler must execute a sub-50ms micro-probe on load. If the probe detects a sandboxed environment where a `Send` block will trigger the "Throttle Cliff" (taking >5 seconds), the SDK must intelligently route the work to a remote BPoW server, ensuring the application remains responsive and the user's battery is preserved.
See `docs/architecture/transport-auth.md` for the full transport/auth design.
