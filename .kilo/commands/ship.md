# Ship Changes to Production

This workflow ships changes from development to production via GitHub Actions.

## Workflow

### 1. Review uncommitted changes

```bash
git status
git diff
```

Review all staged and unstaged changes. Ensure nothing unintended is included.

### 2. Stage and commit changes in logical phases

Group related changes into commits with clear messages:

```bash
git add <files>
git commit -m "description of changes"
```

Split into multiple commits if changes are logically independent.

### 3. Run build + test after each commit phase

Before proceeding, verify the build compiles and tests pass:

```bash
pnpm build && pnpm test
```

If either fails, fix before continuing.

### 4. Create release (if changes affect published packages)

The published package is `@openrai/nano-core`. If changes affect the public package:

```bash
pnpm release
```

If changes are internal-only (tests, docs, config only), skip this step.

### 5. Push commits and tags

```bash
git push
git push --tags
```

### 6. Wait for CI to pass

Monitor the workflow in GitHub Actions:

- **CI workflow** (`ci.yml`): Runs on all pushes to `main` and PRs
- **Release workflow** (`release.yml`): Runs after CI passes, publishes to npm

Check status at: https://github.com/OpenRai/nano-core/actions

Or use the CLI:

```bash
gh run list
```

### 7. Confirm release is complete

Verify the Release workflow succeeded and the package is live on npm:

```
https://www.npmjs.com/package/@openrai/nano-core
```

All workflows should show green checkmarks in the GitHub Actions dashboard.
