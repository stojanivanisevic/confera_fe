// `pnpm check`: everything that must be green before a commit is pushed and
// before a tag (ADR-01, ADR-27). Each step is a separate command you can run
// alone; the first failing step stops the run.
import { join } from 'node:path';
import { heading, root, runNode, runPnpm } from './lib.mjs';

const script = (name, ...args) => () => runNode(join(root, 'scripts', name), args);

const steps = [
  ['Design system: release, tokens, adapter (pnpm ds:check)', script('ds-check.mjs')],
  ['API contract: vendored copies, lock, generated types (pnpm api:check)', script('api-check.mjs')],
  ['Lint (pnpm lint)', script('run.mjs', 'lint')],
  ['Type check (pnpm typecheck)', script('run.mjs', 'typecheck')],
  ['Unit tests (pnpm test)', script('run.mjs', 'test')],
  ['Production build (pnpm build)', script('next.mjs', 'build')],
  ['Production build contents (pnpm verify:build)', script('verify-build.mjs')],
  ['Secret scan (pnpm secrets)', script('run.mjs', 'secrets')],
  // Supply chain (ADR-01, SEC-A-29): fails on a known vulnerability rated high or critical.
  ['Dependency audit (pnpm audit --audit-level high)', () => runPnpm(['audit', '--audit-level', 'high'])],
  // Do the secret scan, the audit and the install settings catch what they are there for? Plants a fake secret,
  // a vulnerable package and an unlisted build script in a copy under .artifacts/ and expects each to be caught (ST-11).
  ['Supply chain: planted cases are caught (pnpm test:supply-chain)', script('supply-chain-planted.mjs')],
];

const started = Date.now();
for (const [title, run] of steps) {
  heading(title);
  const status = run();
  if (status !== 0) {
    console.error(`\n✗ pnpm check failed at: ${title}`);
    process.exit(status || 1);
  }
}
console.log(`\n✓ pnpm check passed (${Math.round((Date.now() - started) / 1000)} s)`);
