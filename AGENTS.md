# Agent Instructions for @openrai/nano-core

## Package Manager

Use **pnpm** exclusively. Do not use npm, yarn, or bun.

**CRITICAL NOTE:** If you encounter errors like `EBADDEVENGINES` or if a script/prompt suggests running `npm install`, it is because in this project we **always use pnpm**.

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build | `pnpm build` (runs `tsc`) |
| Test | `pnpm test` (runs `vitest run`) |

## Build System

Pure `tsc` — no bundler, no vite/rollup/webpack. `dist/` is the published output. `tsconfig.json` uses `module: NodeNext`, so **all TypeScript imports must include `.js` extensions** even when importing `.ts` files.

Target is **Node 24+**. `globalThis.btoa` and native fetch are available.

## Release Workflow (CRITICAL)

**NEVER run `pnpm publish`, `npm publish`, or any local publish command.**

The repo uses GitHub OIDC Trusted Publisher workflows that publish only from package-scoped tags. Ordinary pushes to `main` run CI and never publish.

Correct release steps:

1. Bump exactly one package: `pnpm version:core patch` creates `nano-core-v<version>`; `pnpm version:pow-contract patch` creates `nano-pow-contract-v<version>`. Each commits the version bump and creates its tag atomically.
2. Push: `git push && git push --tags`
3. **Stop.** The matching tag workflow builds, tests, and publishes automatically.

The tag version must match that package's manifest, and the tagged commit must be reachable from `main`.

## Project Structure

pnpm workspace with `@openrai/nano-core` at the root and `@openrai/nano-pow-contract` under `packages/`. Key directories:

- `src/index.ts` — public API exports
- `src/client.ts` — `NanoClient`, the main entrypoint
- `src/transport/` — HTTP/WS pools, endpoint normalization, auth handling
- `src/primitives/` — `NanoAddress`, `NanoAmount`
- `src/signing/` — `NOMS` signing utilities
- `src/work/` — `WorkProvider`, local and remote PoW
- `docs/architecture/transport-auth.md` — transport/auth design reference

## Testing

Uses **vitest** with zero config file. Tests live next to source files (e.g., `src/transport/normalize.test.ts`).

Common patterns in this repo:
- Mock `fetch` with `vi.stubGlobal('fetch', vi.fn())`
- Mock `WebSocket` with `vi.stubGlobal('WebSocket', FakeWebSocket)`
- Use `vi.unstubAllGlobals()` in `afterEach`

Run a single test file: `pnpm vitest run src/transport/normalize.test.ts`

## Auth & Transport Conventions

`normalizeEndpoints` extracts credentials from three ENV-var URL formats:
- `https://KEY:@rpc.example.com` (userinfo)
- `https://rpc.example.com/?key=KEY`
- `https://rpc.example.com/?api_key=KEY`

All sources default to `TransportPolicy: 'bearer-header'`. `basic-header` is available as an explicit opt-in only.

Canonical URLs are always secret-free after normalization. Never log `endpoint.auth.value`.
