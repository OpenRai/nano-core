# Transport And Auth

This document defines the `@openrai/nano-core` transport and auth behavior for RPC, WebSocket, and remote work endpoints.

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
- `NANO_WORK_URL`

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

## Built-In Defaults

As of April 2026, `nano-core` should prefer this default ordered RPC/work endpoint set:

- `https://rpc.nano.to`
- `https://node.somenano.com/proxy`
- `https://rainstorm.city/api`
- `https://nanoslo.0x.no/proxy`

Rationale from current probing:

- `rpc.nano.to` is the primary default because it is currently the fastest option in the observed set and supports `work_generate`
- `node.somenano.com/proxy` is a strong read-oriented fallback
- `rainstorm.city/api` is a good secondary read fallback
- `nanoslo.0x.no/proxy` adds a useful EU option

Implication:

- default RPC pools should use all four in this order
- default remote work pools should currently use only `https://rpc.nano.to`
- `node.somenano.com/proxy`, `rainstorm.city/api`, and `nanoslo.0x.no/proxy` should be treated as read-only fallbacks for now, since current probing shows `work_generate` timing out on them
- defaults are operational policy, not protocol truth, and should be periodically re-evaluated

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

### Work endpoints

Allowed schemes:

- `http:`
- `https:`

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
- ignore empty password
- strip credentials from the canonical URL

Example:

```text
https://RPC-KEY:@rpc.nano.to/
```

becomes:

- canonical URL: `https://rpc.nano.to/`
- auth metadata: `api-key`

## Auth Application

### HTTP RPC / work

Default:

- `Authorization: Bearer <key>`

Provider compatibility policies may also mirror the key into the JSON body when needed.

### WebSocket

Preferred:

- auth through transport-supported headers

Fallback:

- provider-specific compatible mechanism handled inside `nano-core`

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
