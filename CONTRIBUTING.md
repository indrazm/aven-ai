# Contributing

## Git workflow

All changes go through a pull request into `main`. Create a branch, make the change, and add a Changeset before pushing:

```sh
git switch -c <type>/<short-description>
pnpm changeset
pnpm check
git push -u origin HEAD
```

Choose `patch`, `minor`, or `major` based on the public impact and write the Changeset summary for users. The PR check requires a Changeset; the automated Changesets release PR is the only exception.

## Quality gate

Install dependencies with `pnpm install`. The `prepare` script configures the tracked pre-push hook, which runs:

```sh
pnpm check
```

The gate verifies formatting, strict TypeScript, ESLint, tests with coverage thresholds, and the production build. Run `pnpm test` for the faster non-coverage suite during development.

## Change design

- Keep behavior changes and structural refactors in separate commits when practical.
- Prefer changes near 100–300 reviewed lines. Split larger work by contract, adapter, or vertical behavior.
- Add unit tests for pure decisions and adapter edge cases. Reserve integration tests for behavior crossing multiple features.
- Put reusable test runtimes and render helpers under `test/support`; do not redefine them in unrelated suites.
- Preserve configuration and SQLite compatibility unless a migration is explicitly part of the change.

See [ARCHITECTURE.md](./ARCHITECTURE.md) before adding a new top-level module or dependency direction.

## Releases

Merging a regular PR into `main` automatically creates or updates a Changesets release PR. That PR applies the accumulated version bump, updates `CHANGELOG.md`, and removes the consumed Changesets.

To publish:

1. Merge the Changesets release PR.
2. Open **Actions → Publish npm → Run workflow**.
3. Select the `main` branch and dispatch the workflow.

Publishing uses npm trusted publishing and does not require an npm token in GitHub. Configure the `aven-ai` package on npm with this trusted publisher:

- Provider: GitHub Actions
- Organization or user: `indrazm`
- Repository: `aven-ai`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Allowed action: `npm publish`

The manual workflow refuses to publish from another branch or while unconsumed Changesets remain.

## Dependencies

Prefer Node.js and existing project utilities. Before adding a package, verify that it is maintained, license-compatible, reasonably sized, and free of known high-severity vulnerabilities. Finish dependency changes with:

```sh
pnpm audit --audit-level high
```
