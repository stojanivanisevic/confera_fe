// `pnpm api:check`: the vendored API contract, its lock and the generated types agree (ADR-19).
// A step of `pnpm check`. With --sibling it also fails when the checkout of confera_be next to
// this repository has another contract than the vendored one (the cross-repository run uses it).
import { checkContract, DOCUMENTS } from './api-lib.mjs';

const strict = process.argv.includes('--sibling');
const { problems, notices, lock, compared } = checkContract({ strict });
for (const notice of notices) console.warn(`! ${notice}`);
if (problems.length > 0) {
  console.error(`✗ pnpm api:check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ API contract: ${DOCUMENTS.map(({ file }) => `${file} ${lock.files[file].version}`).join(', ')} from confera_be ${lock.source.commit.slice(0, 7)}; copies, lock and generated types agree`);
if (compared) {
  const same = notices.length === 0 ? 'the same contract' : 'another contract (see above)';
  console.log(`  compared with the checkout of confera_be in ${compared.dir}: commit ${String(compared.commit).slice(0, 7)} on ${compared.branch}, ${same}`);
} else if (!strict) {
  console.log('  no checkout of confera_be next to this repository: not compared with one');
}
