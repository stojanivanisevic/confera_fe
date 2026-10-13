// `pnpm api:sync`: vendors the API contract of confera_be and generates the types (ADR-19).
//   pnpm api:sync                      from ../confera_be
//   pnpm api:sync --from <directory>   from another checkout (or set CONFERA_BE_DIR)
// The contract must be committed there: the lock names the commit.
import { resolve } from 'node:path';
import { fail } from './lib.mjs';
import { defaultBackendDir, DOCUMENTS, syncContract } from './api-lib.mjs';

const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
const from = resolve(fromIndex >= 0 ? (args[fromIndex + 1] ?? '') : (process.env.CONFERA_BE_DIR ?? defaultBackendDir));

try {
  const lock = syncContract({ from });
  console.log(`API contract vendored from ${from}`);
  console.log(`  commit ${lock.source.commit}${lock.source.tag ? ` (tag ${lock.source.tag})` : ''}, branch ${lock.source.branch}`);
  for (const { file, types } of DOCUMENTS) console.log(`  ${file}  version ${lock.files[file].version}  sha256 ${lock.files[file].sha256.slice(0, 16)}…  ->  src/generated/${types}`);
  console.log('Commit packages/api-client/openapi and packages/api-client/src/generated together.');
} catch (error) {
  fail(error.message);
}
