// `pnpm ds:fonts`: copies the self-hosted fonts of the design system from the
// pinned @fontsource-variable packages into design-system/fonts and writes
// fonts.css. With --check it writes nothing and fails on any difference.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './lib.mjs';
import { fontRelease, paths } from './ds-lib.mjs';

const files = fontRelease();
const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const normal = (name, data) => (/\.(css|txt)$/.test(name) ? Buffer.from(Buffer.from(data).toString('utf8').replace(/\r\n/g, '\n')) : Buffer.from(data));

if (process.argv.includes('--check')) {
  const problems = [];
  for (const [name, data] of files) {
    const file = join(paths.fontsDir, name);
    if (!existsSync(file)) problems.push(`missing: fonts/${name}`);
    else if (!same(normal(name, readFileSync(file)), normal(name, data))) problems.push(`differs from the pinned package: fonts/${name}`);
  }
  if (existsSync(paths.fontsDir)) {
    for (const name of readdirSync(paths.fontsDir)) if (!files.has(name)) problems.push(`unexpected file: fonts/${name}`);
  }
  if (problems.length > 0) fail(`The design-system fonts are not the pinned ones:\n  - ${problems.join('\n  - ')}\nRun \`pnpm ds:fonts\`.`);
  console.log(`✓ fonts: ${files.size} files equal the pinned @fontsource-variable packages`);
} else {
  mkdirSync(paths.fontsDir, { recursive: true });
  for (const [name, data] of files) writeFileSync(join(paths.fontsDir, name), normal(name, data));
  console.log(`design-system/fonts written (${[...files.keys()].join(', ')})`);
}
