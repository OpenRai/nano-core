# Agent Instructions for @openrai/nano-core

## Package Manager: pnpm

This project uses **pnpm** exclusively. Do not use npm, yarn, or bun unless explicitly requested.

| Task | Command |
|------|---------|
| Install dependencies | `pnpm install` |
| Build | `pnpm build` |
| Test | `pnpm test` |
| Publish | `pnpm release` (calls `pnpm publish --access public --no-git-checks`) |

### Versioning Rule (CRITICAL)

When bumping versions for release, **always use `npm version <patch|minor|major> --no-git-tag-version` followed by `git tag` and `git push --tags`**.

This creates the commit AND the annotated tag together.

**WRONG:** Manually editing package.json and running `git commit`
**RIGHT:** `npm version patch --no-git-tag-version` → `git push --tags`

### Tool Auto-Detection

If a prompt mentions a different package manager (npm/yarn/bun) but this project uses pnpm, always:
1. Call out the discrepancy
2. Use the project's actual package manager (pnpm) instead

For example: if asked to "run `npm install`", respond that this project uses pnpm and use `pnpm install` instead.
