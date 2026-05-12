# Agent Instructions for @openrai/nano-core

## Package Manager

Use **pnpm** exclusively. Do not use npm, yarn, or bun.

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build | `pnpm build` (runs `tsc`) |
| Test | `pnpm test` (runs `vitest run`) |

## Build System

Pure `tsc` — no bundler, no vite/rollup/webpack. `dist/` is the published output. `tsconfig.json` uses `module: NodeNext`, so **all TypeScript imports must include `.js` extensions** even when importing `.ts` files.

Target is **Node 24+**. `globalThis.btoa` and native fetch are available.

## Release Workflow (CRITICAL)

**NEVER run `pnpm release`, `npm publish`, or any local publish command.**

The repo uses a GitHub OIDC Trusted Publisher workflow (`.github/workflows/release.yml`) that runs on every push to `main` and attempts to publish. It succeeds only when the package version is new.

Correct release steps:

1. Bump version: `npm version patch --no-git-tag-version`
2. Commit the version bump
3. Tag: `git tag v<X.Y.Z>`
4. Push: `git push && git push --tags`
5. **Stop.** The Release workflow on `main` will publish automatically.

Local publish attempts will fail with 404 because your token lacks OIDC Trusted Publisher permissions.

## Project Structure

Single-package TypeScript library. Key directories:

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
