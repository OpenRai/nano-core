# Transport And Auth

This document defines the `@openrai/nano-core` transport and auth behavior for RPC and WebSocket endpoints.

## Goals

- zero-config operation by default
- comma-separated env lists with ordered preference
- eager validation and permanent rejection of invalid endpoints
- endpoint-local failover and exponential backoff
- secret-free canonical URLs
- automatic auth extraction from common Nano ecosystem endpoint conventions
- redacted audit output that still tells operators whether an API key is in use

## Environment Variables

These inputs are optional:

- `NANO_RPC_URL`
- `NANO_WS_URL`

When set, each is parsed as a comma-separated ordered list.

Rules:

- trim whitespace
- ignore empty entries
- validate each endpoint immediately
- normalize valid endpoints
- deduplicate while preserving first valid occurrence order
- permanently drop invalid entries with a warning
- throw if no valid endpoints remain

When unset, built-in defaults are used.

## Work Generation

All Proof-of-Work is computed locally using the `nano-rspow-node` native engine. There is no remote work pool, no `NANO_WORK_URL`, and no external work server dependency.

## Built-In Defaults

As of May 2026, `nano-core` uses this default ordered RPC/WS endpoint set:

- RPC: `https://rpc.nano.to`, `https://node.somenano.com/proxy`, `https://rainstorm.city/api`, `https://nanoslo.0x.no/proxy`
- WS: `wss://rpc.nano.to`

Rationale:

- `rpc.nano.to` is the primary default — fastest observed and most reliable
- `node.somenano.com/proxy` is a strong read-oriented fallback
- `rainstorm.city/api` is a good secondary read fallback
- `nanoslo.0x.no/proxy` adds a useful EU option

Defaults are operational policy, not protocol truth, and should be periodically re-evaluated.

## Validation

### RPC endpoints

Allowed schemes:

- `http:`
- `https:`

Must have:

- non-empty hostname

### WebSocket endpoints

Allowed schemes:

- `ws:`
- `wss:`

Must have:

- non-empty hostname

## Auth Extraction

The following URL forms are treated as convenience input and normalized into structured auth metadata.

### Query params

Recognized names:

- `key`
- `apiKey`
- `api_key`

Behavior:

- extract the value
- remove the query param from the canonical URL
- store auth as `api-key`

### URL userinfo

If credentials are present in the URL:

- use `username` as the API key
- accept an explicitly empty password only
- reject a non-empty password
- strip credentials from the canonical URL

Example:

```text
https://RPC-KEY:@rpc.nano.to/
```

becomes:

- canonical URL: `https://rpc.nano.to/`
- auth metadata: `api-key`

## Auth Application

### HTTP RPC

Default for query params:

- `Authorization: Bearer <key>`

Default for URL userinfo:

- `Authorization: Bearer <key>`

ORIS-010 clients use the Bearer header. Legacy provider compatibility policies
are outside ORIS-010 and require an explicit `allowLegacyAuth: true` opt-in.

The explicit policies are applied as follows:

- `basic-header`: `Authorization: Basic ...`
- `bearer-header`: `Authorization: Bearer ...`
- `json-body-key`: `key` in the JSON body
- `bearer-and-json-body-key`: both the Bearer header and the JSON body key

The JSON-body policies MUST NOT be used by an ORIS-010 client.

### WebSocket

Native WebSocket construction does not expose a portable custom-header
constructor. `nano-core` therefore applies authenticated WebSocket endpoints
through the provider-compatible `api_key` query parameter at connection time.
The stored canonical URL remains secret-free.

Canonical stored URLs remain secret-free in all cases.

## Audit / Logging

`nano-core` never logs secret values.

Audit output must still indicate whether auth is in use.

Examples:

- `https://rpc.nano.to/ (api-key used)`
- `wss://rpc.nano.to/ws (api-key used)`
- `https://rpc.nano.org/ (no auth)`

## Pooling And Failover

Each transport kind has its own endpoint pool.

Tracked per endpoint:

- consecutive failures
- last success time
- last failure time
- cooldown expiry
- rolling latency

On failure:

- degrade only the failed endpoint
- apply exponential backoff with jitter
- try the next eligible endpoint
- fail only when all eligible endpoints are exhausted

Invalid endpoints never enter a live pool.

## Design Principle

`nano-core` accepts convenient input forms, but it never keeps or exposes raw secret-bearing endpoint URLs after normalization.

That means:

- developers get a forgiving DX
- operators get good audit visibility
- logs and dashboards stay secret-safe
