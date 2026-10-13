// The second half of the secret scan (scripts/secret-assignments.mjs): a secret
// that has no format is given away by the name it is assigned to. A session
// secret or a PayPal client secret in an environment file must be reported;
// the placeholders and settings of .env.example must not.
// Every value here is made of parts, so that no line of this file is itself
// "a literal value assigned to a name like a secret".
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { formatFindings, scanDirectory, scanText } from '../scripts/secret-assignments.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
type Finding = { line: number; name: string; file?: string };
const scan = (file: string, text: string) => scanText(file, text) as Finding[];
const names = (file: string, text: string) => scan(file, text).map((f) => f.name);

/** Letters and digits that look random and are not: nothing here is a real credential. */
const filler = (length: number) => Array.from({ length }, (_, i) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(i * 11 + 5) % 62]).join('');
const line = (name: string, value: string, quote = '') => `${name}=${quote}${value}${quote}`;

describe('a value assigned to a name like a secret, in an environment file', () => {
  it.each(['SESSION_SECRET', 'PAYPAL_CLIENT_SECRET', 'DATA_KEY', 'SMTP_PASSWORD', 'API_TOKEN', 'KEY', 'DB_PASSWD', 'SERVICE_CREDENTIAL'])('%s with a real-looking value is reported', (name) => {
    expect(names('apps/web/server.env', `STAGE=prod\n${line(name, filler(48))}\n`)).toEqual([name]);
  });

  it('is reported with its line and its name, never with its value', () => {
    const value = filler(40);
    const findings = scan('deploy/prod.env', `# settings\nSTAGE=prod\n\n${line('SESSION_SECRET', value)}\n`);
    expect(findings).toEqual([{ line: 4, name: 'SESSION_SECRET' }]);
    const printed = formatFindings('/repo', findings.map((f) => ({ file: 'deploy/prod.env', ...f }))) as string;
    expect(printed).toContain('/repo/deploy/prod.env');
    expect(printed).toContain('"SESSION_SECRET"');
    expect(printed).not.toContain(value);
  });

  it.each([
    ['quoted', line('SESSION_SECRET', filler(32), '"')],
    ['single-quoted', line('SESSION_SECRET', filler(32), "'")],
    ['exported', `export ${line('SESSION_SECRET', filler(32))}`],
    ['with a colon (YAML)', `SESSION_SECRET: ${filler(32)}`],
    ['indented, with a comment after it', `  ${line('SESSION_SECRET', filler(32))}  # rotate monthly`],
    ['a weak word', line('SESSION_SECRET', 'change' + 'me')],
  ])('also when it is %s', (_how, text) => {
    expect(names('compose.yml', text)).toEqual(['SESSION_SECRET']);
  });

  it.each([
    ['empty', line('SESSION_SECRET', '')],
    ['a documented placeholder (invented-)', line('SESSION_SECRET', 'invented-' + filler(20))],
    ['a documented placeholder (local-only-)', line('DATA_KEY', 'local-only-' + filler(20))],
    ['a reference to another variable', line('SESSION_SECRET', '$' + '{SESSION_SECRET}')],
    ['an instruction', line('SESSION_SECRET', '<set-on-the-server>')],
    ['a number', line('TOKEN_LIFETIME_SECONDS', '86400')],
    ['shorter than a secret can be', line('SESSION_SECRET', 'short')],
  ])('a value that is %s is not reported', (_what, text) => {
    expect(scan('apps/web/.env.example', text)).toEqual([]);
  });

  it.each(['SECRET_FILE', 'TOKEN_URL', 'PRIVATE_KEY_PATH', 'PASSWORD_HEADER', 'API_KEY_NAME', 'KEYBOARD_LAYOUT', 'MONKEY_BUSINESS', 'STAGE', 'CONFERA_API_ORIGIN'])(
    '%s says where a secret is or is no secret name at all, and is not reported',
    (name) => {
      expect(scan('server.env', line(name, filler(32)))).toEqual([]);
    },
  );

  it('the .env.example of this repository has nothing to report', () => {
    expect(scan('.env.example', readFileSync(join(root, '.env.example'), 'utf8'))).toEqual([]);
  });
});

describe('a quoted value assigned to a name like a secret, anywhere', () => {
  it.each([
    ['an object property', `const options = { clientSecret: '${filler(40)}' };`, 'clientSecret'],
    ['a constant', `const apiKey = "${filler(40)}";`, 'apiKey'],
    ['a JSON member', `  "password": "${filler(16)}",`, 'password'],
    ['a snake_case name', `auth_token = '${filler(24)}'`, 'auth_token'],
    ['a kebab-case header', `'x-api-key': '${filler(24)}'`, 'x-api-key'],
  ])('%s is reported', (_what, text, name) => {
    expect(names('apps/web/src/planted.ts', text)).toEqual([name]);
  });

  it('an unquoted value in source code is an expression, not a literal', () => {
    expect(scan('apps/web/src/config/env.ts', 'const clientSecret = process.env.PAYPAL_CLIENT_SECRET;')).toEqual([]);
    expect(scan('apps/web/src/a.ts', 'const SESSION_SECRET = readSecret();')).toEqual([]);
  });

  it('one branch of a choice between two labels is not an assignment', () => {
    expect(scan('design-system/components/bundle.js', 'label: t(shown ? "hidePassword" : "showPassword")')).toEqual([]);
  });

  it("the credentials option of fetch holds one of three fixed words, not a credential", () => {
    for (const mode of ['omit', 'same-origin', 'include']) expect(scan('packages/api-client/src/index.ts', `fetch(url, { credentials: '${mode}' })`)).toEqual([]);
    expect(names('packages/api-client/src/index.ts', `fetch(url, { credentials: '${filler(24)}' })`)).toEqual(['credentials']);
  });

  it('a file reports each name once per line, and every line that has one', () => {
    const text = [`const a = { token: '${filler(20)}', token: '${filler(20)}' };`, '', `const b = { secret: '${filler(20)}' };`].join('\n');
    expect(scan('x.ts', text)).toEqual([{ line: 1, name: 'token' }, { line: 3, name: 'secret' }]);
  });
});

describe('the scan of a directory', () => {
  let work: string;
  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'confera-secret-assignments-'));
    mkdirSync(join(work, 'apps', 'web'), { recursive: true });
    mkdirSync(join(work, 'node_modules', 'some-package'), { recursive: true });
    writeFileSync(join(work, '.gitignore'), 'node_modules/\n.env\n');
    writeFileSync(join(work, 'apps', 'web', 'planted-server.env'), `STAGE=prod\n${line('SESSION_SECRET', filler(48))}\n`);
    writeFileSync(join(work, 'apps', 'web', 'planted-payments.env'), `${line('PAYPAL_CLIENT_SECRET', filler(80))}\n${line('DATA_KEY', filler(64))}\n`);
    writeFileSync(join(work, '.env.example'), 'STAGE=local\nCONFERA_API_ORIGIN=http://127.0.0.1:3001\n');
    // What git would not take is not read: installed packages, and the developer's own .env.
    writeFileSync(join(work, 'node_modules', 'some-package', 'index.js'), `module.exports = { secret: '${filler(30)}' };\n`);
    writeFileSync(join(work, '.env'), `${line('SESSION_SECRET', filler(48))}\n`);
    writeFileSync(join(work, 'picture.bin'), Buffer.from([0, 1, 2, 3, 0, 0]));
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it('reports the planted files, and only them', () => {
    const findings = (scanDirectory(work) as Required<Finding>[]).map((f) => `${f.file}:${f.line} ${f.name}`).sort();
    expect(findings).toEqual(['apps/web/planted-payments.env:1 PAYPAL_CLIENT_SECRET', 'apps/web/planted-payments.env:2 DATA_KEY', 'apps/web/planted-server.env:2 SESSION_SECRET']);
  });

  it('this repository has nothing to report', () => {
    expect(scanDirectory(root)).toEqual([]);
  });
});
