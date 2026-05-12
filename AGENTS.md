# Agent Instructions for @openrai/nano-core

## Package Manager: pnpm

This project uses **pnpm** exclusively. Do not use npm, yarn, or bun unless explicitly requested.

| Task | Command |
|------|---------|
| Install dependencies | `pnpm install` |
| Build | `pnpm build` |
| Test | `pnpm test` |

### Versioning Rule (CRITICAL)

When bumping versions for release, **always use `npm version <patch|minor|major> --no-git-tag-version` followed by `git tag` and `git push --tags`**.

This creates the commit AND the annotated tag together.

**WRONG:** Manually editing package.json and running `git commit`
**RIGHT:** `npm version patch --no-git-tag-version` → `git push --tags`

## Release Rule (CRITICAL — NEVER VIOLATE)

**NEVER run `pnpm release`, `npm publish`, or any local publish command.**

This repository uses a **GitHub OIDC Trusted Publisher** workflow (`.github/workflows/release.yml`) that publishes to npm automatically when a version tag is pushed.

The only correct release workflow is:

1. Bump version: `npm version <patch|minor|major> --no-git-tag-version`
2. Commit the version bump
3. Create the tag: `git tag v<X.Y.Z>`
4. Push commits + tags: `git push && git push --tags`
5. **Stop.** GitHub Actions will publish the package.

Running `pnpm release` or `npm publish` locally will:
- Fail with 404 (local token lacks OIDC Trusted Publisher permissions)
- Potentially race with the CI workflow
- Create confusion and duplicate publish attempts

### Tool Auto-Detection

If a prompt mentions a different package manager (npm/yarn/bun) but this project uses pnpm, always:
1. Call out the discrepancy
2. Use the project's actual package manager (pnpm) instead

For example: if asked to "run `npm install`", respond that this project uses pnpm and use `pnpm install` instead.
