<div align="center">
  <h1>@openrai/nano-core</h1>
  <p><b>Typed Nano primitives, transport pools, work routing, and a small self-custodial account sender.</b></p>
</div>

`@openrai/nano-core` provides the protocol-level pieces needed to integrate Nano without rebuilding address validation, exact amounts, endpoint normalization, authenticated RPC failover, or Proof-of-Work routing. It is for applications that own their own integration policy; it does not provide wallet storage, confirmation tracking, or a hosted custody system.

## Installation

```bash
pnpm add @openrai/nano-core
```

`nanocurrency` and `nano-rspow-node` are direct dependencies of this package.

## Quick Start

### 1. Minimal Client

`hydrateWallet()` creates an in-memory signer for one seed index. `send()` submits a real Nano send block. The returned hash means the RPC accepted the block; it does not mean the block is confirmed.

```typescript
import { NanoAddress, NanoAmount, NanoClient } from '@openrai/nano-core';

const client = NanoClient.initialize();
const wallet = client.hydrateWallet(process.env.NANO_SEED!, { index: 0 });

const destination = NanoAddress.parse(
  'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4',
);
const amount = NanoAmount.fromNano('1.25');

console.log(`Sending from ${wallet.address}`);
const hash = await wallet.send(destination, amount);
console.log(`Submitted block: ${hash}`);
```

Keep the seed outside source control. The source account must already be opened and have enough confirmed balance. The wallet does not store the seed, discover other indexes, receive pending funds, or wait for confirmation.

### 2. Endpoint Observation

The client constructs pools without network requests. After an RPC, WebSocket, or configured remote-work request succeeds, inspect the canonical secret-free endpoint URL:

```typescript
const unsubscribe = client.onEndpointChange((event) => {
  console.log(event.kind, event.status, event.activeUrl);
});

console.log(client.getActiveEndpoints());
// { rpc?: string, ws?: string, work?: string }

unsubscribe();
```

### 3. Generic RPC Calls

`rpcPool.postJson()` exposes the same normalized endpoint, auth, backoff, and failover behavior used by the wallet sender:

```typescript
const balance = await client.rpcPool.postJson<{ balance: string; pending: string }>({
  action: 'account_balance',
  account: wallet.address.toString(),
});

console.log({ confirmedRaw: balance.balance, receivableRaw: balance.pending });
```

### 4. Work Routing

By default, `WorkProvider.auto()` follows `nano-rspow-node`'s persisted local-work recommendation. If it selects local work, `nano-core` generates and validates work locally. If it selects remote work, configure explicit `work` endpoints or `NANO_WORK_URL`; the work pool uses the same auth and failover behavior as RPC.

```typescript
const client = NanoClient.initialize({
  rpc: ['https://rpc.example.com'],
  work: [
    'https://work-primary.example.com?api_key=replace-me',
    'https://work-secondary.example.com?api_key=replace-me',
  ],
  workRouting: {
    selectRoute: () => 'remote',
    onRemoteFailure: 'error',
  },
});
```

Remote selection without a configured work endpoint fails instead of silently using a machine that was not recommended for local work. Use `WorkProvider.local()` only when the caller intentionally chooses local execution:

```typescript
import { NanoClient, WorkProvider } from '@openrai/nano-core';

const client = NanoClient.initialize({
  workProvider: WorkProvider.local({ localTimeoutMs: 60_000 }),
});
```

Applications such as xno-skills can supply their own route override and work URLs, then retain their own approval, custody, signing, and submission policy.

### 5. Precision-Safe Primitives

`NanoAddress.parse()` verifies address checksums. `NanoAmount` accepts exact decimal strings and stores Nano values as raw integers without floating-point conversion.

```typescript
const destination = NanoAddress.parse('nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4');
const amount = NanoAmount.fromNano('0.000000000000000000000000000001');

console.log(amount.raw); // 1
```

See [transport/auth design](docs/architecture/transport-auth.md) for endpoint credential handling and audit behavior.

## Release Flow

This is a single-package repository. Versioning is manual; GitHub Actions publishes pushes to `main` when the package version is new.

1. Run `pnpm version patch` (or the appropriate semver increment). This commits the version and creates the tag.
2. Run `git push && git push --tags`.
3. Stop. The release workflow builds, tests, and publishes through npm Trusted Publisher.
