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
`nano-core` handles endpoint selection, auth redaction, and precision-safe math so you can focus on the task at hand:

```typescript
import { NanoClient, NanoAddress, NanoAmount } from '@openrai/nano-core';

// Start with built-in public endpoints — no config required
const client = NanoClient.initialize();

// Validate a destination address (checksum-verified, throws on bad input)
const destination = NanoAddress.parse(
  'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4',
);

// Express value in human-readable NANO — stored as precision-safe raw internally
const amount = NanoAmount.fromNano('1.25');

// Hydrate a wallet from a seed (keep your seed in an env var, never hard-code it)
const wallet = await client.hydrateWallet(process.env.NANO_SEED!, { index: 0 });
const hash = await wallet.send(destination, amount);

console.log(`Sent ${amount} NANO → ${destination}`);
console.log(`Block hash: ${hash}`);
```

Under the hood, `nano-core` has already:
- Selected a live RPC from the built-in April 2026 public pool
- Validated the address checksum and derived the public key
- Stored `1.25 NANO` as `1250000000000000000000000000000` raw — no float drift
- Redacted any API keys from audit output

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

- comma-separated env vars also work: `NANO_RPC_URL`, `NANO_WS_URL`
- malformed or duplicate endpoints are dropped during construction
- API keys in query params or URL userinfo are extracted and redacted from audit output
- failover and endpoint-local backoff happen inside the pool, not in your app code

Current built-in defaults as of May 2026:

- RPC: `https://rpc.nano.to`, `https://node.somenano.com/proxy`, `https://rainstorm.city/api`, `https://nanoslo.0x.no/proxy`
- WS: `wss://rpc.nano.to`
- Work: local CPU/GPU via `nano-rspow-node` (recommended default; remote work via RPC is also possible — see §1.2)

### 1.2 Custom RPC Calls

`client.rpcPool.postJson()` exposes the pooled HTTP transport for any Nano RPC action — the same failover, backoff, and auth pipeline used internally:

```typescript
import { NanoClient } from '@openrai/nano-core';

const client = NanoClient.initialize();

// General RPC — any action
const balance = await client.rpcPool.postJson<{ balance: string }>({
  action: 'account_balance',
  account: 'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4',
});
console.log(balance.balance);

// Remote work generation — good as a fallback when the local engine
// is unavailable or too slow for your throughput requirements
const work = await client.rpcPool.postJson<{ work: string }>({
  action: 'work_generate',
  hash: '994ED8E50EBF19912F25A1358C2DBEF0C1E1D08610C958EAB6CD7369EE5A2D2F',
  difficulty: 'fffffff800000000',
});
console.log(`Remote work nonce: ${work.work}`);
```

Local PoW via `nano-rspow-node` is the recommended default for most deployments
— it avoids network latency and a dependency on the RPC endpoint for block
processing. Remote `work_generate` via the RPC pool is available when needed
(e.g., constrained devices, burst throughput), and the decision is entirely the
consumer's.

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
} from '@openrai/nano-core';

const client = NanoClient.initialize({
  network: 'mainnet', // [Optional] Defaults to 'mainnet'
  rpc: [
    'https://rpc.private.example.com?apiKey=secret-rpc',
    'https://rpc.nano.to',
  ], // [Optional] Defaults to the May 2026 public RPC set
  ws: [
    'wss://ws.private.example.com?api_key=secret-ws',
    'wss://rpc.nano.to',
  ], // [Optional] Defaults to public WebSocket endpoints
  workProvider: WorkProvider.auto({
    profiler: {
      mode: 'manual',
      preferLocalAboveMhs: 30,
      cacheStrategy: 'persistent',
    }, // [Optional] Calibration strategy overrides
    warn: (message) => console.warn(message), // [Optional] Defaults to console.warn with nano-core prefix
  }), // [Optional] Defaults to WorkProvider.auto() using local nano-rspow-node engine
  warn: (message) => console.warn(message), // [Optional] Defaults to console.warn with nano-core prefix
});
```

When the consumer has already selected local work, use `WorkProvider.local()`
to make that boundary explicit. It executes and validates local work without
running the optional route-selection probe:

```typescript
const localWork = WorkProvider.local({ localTimeoutMs: 60_000 });
const work = await localWork.generate(hash, 'Send');
```

### 4. Work Strategy & Audit

**Local PoW is the recommended default** — it avoids network round-trips and
external dependencies for block signing. The `rpcPool` (§1.2) is available for
remote `work_generate` when needed, but the decision belongs to the consumer.

`recommendLocalPow()` provides a cached local-performance recommendation for
consumers that need to choose between those routes. It does not perform route
selection and it does not replace `WorkProvider.local()`, which is the
local-work executor.

The profiler can probe local work capabilities asynchronously and build an
execution plan without doing any heavyweight work in constructors. When
`profiler.mode` is `auto`, call `probe()` or `calibrate()` during startup and
reuse the resulting plan for later work generation:

```typescript
const plan = await client.workProvider.probe();
console.log(plan.steps);

const profile = await client.workProvider.calibrate();
console.log(profile.activeStrategy);
```

Inspect the active work strategy at any time via `getAuditReport()`:

```typescript
const audit = client.getAuditReport();
console.log(audit.workProvider);
// { profiler: ..., localBackend: ..., lastGenerationTrace: ..., executionPlan: ... }
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

See `docs/architecture/transport-auth.md` for the transport/auth design.

## Release Flow

`@openrai/nano-core` is a single-package repo, so versioning is manual and publishing is automated.

Typical release steps:

1. Bump the package version:

```bash
pnpm version patch
```

or, without git side effects:

```bash
pnpm version patch --no-git-tag-version
```

2. Push the version commit and tag to `main`.

GitHub Actions then builds, tests, and publishes from `.github/workflows/release.yml` using npm Trusted Publisher.
