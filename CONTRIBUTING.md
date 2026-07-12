# Contributing

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

## Dependencies

Prefer Node.js and existing project utilities. Before adding a package, verify that it is maintained, license-compatible, reasonably sized, and free of known high-severity vulnerabilities. Finish dependency changes with:

```sh
pnpm audit --audit-level high
```
