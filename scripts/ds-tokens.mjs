// `pnpm ds:tokens`: writes design-system/tokens.css from tokens.json.
// With --check it writes nothing and fails when the file is out of date.
import { existsSync, writeFileSync } from 'node:fs';
import { fail } from './lib.mjs';
import { paths, readText, readTokens, tokensCss } from './ds-lib.mjs';

const expected = tokensCss(readTokens());
if (process.argv.includes('--check')) {
  if (!existsSync(paths.tokensCss) || readText(paths.tokensCss).replace(/\r\n/g, '\n') !== expected) {
    fail('design-system/tokens.css is not what tokens.json generates. Run `pnpm ds:tokens`.');
  }
  console.log('✓ tokens.css is generated from tokens.json');
} else {
  writeFileSync(paths.tokensCss, expected);
  console.log('design-system/tokens.css written');
}
