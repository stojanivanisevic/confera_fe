// The secret scan (ADR-01) catches a planted credential. The planted text is
// put together from parts in a temporary directory, so that no file of the
// repository ever looks like a secret.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const cli = join(dirname(require.resolve('secretlint/package.json')), 'bin', 'secretlint.js');
const scan = (file: string) => spawnSync(process.execPath, [cli, '--secretlintrc', join(root, '.secretlintrc.json'), file], { cwd: dirname(file), encoding: 'utf8' });

/** Letters and digits that look random and are not: nothing here is a real credential. */
const filler = (length: number) => Array.from({ length }, (_, i) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(i * 7 + 3) % 62]).join('');

let work: string;
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'confera-secret-scan-'));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('secret scan', () => {
  it.each([
    ['a code-host token', () => `token=${'gh'}${'p_'}${filler(36)}`],
    ['a chat token', () => `CHAT=${'xo'}${'xb-'}123456789012-1234567890123-${filler(24)}`],
  ])('fails on a planted credential: %s', (name, plant) => {
    const file = join(work, `${name.replace(/W+/g, '-')}.txt`);
    writeFileSync(file, `${plant()}
`);
    const result = scan(file);
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/found|token/i);
  });

  it('passes on a file without a secret', () => {
    const file = join(work, 'clean.txt');
    writeFileSync(file, 'STAGE=local\nCONFERA_API_ORIGIN=http://127.0.0.1:3001\n');
    expect(scan(file).status).toBe(0);
  });
});
