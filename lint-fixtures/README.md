# Planted violations

Each file here breaks exactly one rule on purpose. `tests/lint-fixtures.test.ts`
lints them and fails if a rule stops catching its violation (M1-FE-01). They are
ignored by the normal `pnpm lint` and by the type check, and never imported.
