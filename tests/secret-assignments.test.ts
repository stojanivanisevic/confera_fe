// The scan for literal values bound to secret-like names (scripts/secret-assignments/,
// README section 11, "Secret scan").
//
// The rule is set by the lead and written at the top of the scanner. What holds it in
// place are its two corpora, which lie beside it and are run here:
//
// - shapes that must be reported: every syntax in which a name gets a value;
// - ordinary lines that must not be: labels, messages, policies, types, references,
//   placeholders.
//
// The scanner and the corpora are the files of confera_be, copied unchanged
// (tests/secret-assignments-lock.test.ts holds that). So they are run as the program they
// are (`--self-test`), the way confera_be runs them in test/tooling/secret-assignments.spec.ts,
// and nothing of them is imported.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { SECRET_SCAN_EXCLUDE } from '../scripts/secret-scan.config.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCANNER = join('scripts', 'secret-assignments', 'secret-assignments.mjs');
const exclude = SECRET_SCAN_EXCLUDE as string[];

function runNode(args: string[]) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { exitCode: result.status, stdout: result.stdout, output: `${result.stdout}${result.stderr}` };
}

interface SelfTest {
  readonly ok: boolean;
  readonly reported: { readonly total: number; readonly syntaxes: readonly string[]; readonly missed: readonly unknown[] };
  readonly ordinary: { readonly total: number; readonly wrong: readonly unknown[] };
}

/** Every way of binding a value to a name that the rule lists. */
const SYNTAXES_OF_THE_RULE = [
  'NAME=value',
  'export NAME=value',
  'NAME="value" in quotes',
  '- NAME=value after a list dash',
  'ENV and ARG of a Dockerfile',
  'name: value in YAML',
  '"name": value in JSON',
  'assignment in JavaScript',
  'declaration in JavaScript',
  'typed declaration in TypeScript',
  'object property in JavaScript',
  'default parameter in JavaScript',
  'fallback with ?? in JavaScript',
  'fallback with || in JavaScript',
  'branch of a ternary in JavaScript',
];

describe('scan for literal values bound to secret-like names', () => {
  describe('the two corpora', () => {
    let result: SelfTest;

    beforeAll(() => {
      const run = runNode([SCANNER, '--self-test', '--json']);
      if (run.stdout.trim() === '') throw new Error(`the self-test printed nothing:\n${run.output}`);
      result = JSON.parse(run.stdout) as SelfTest;
    });

    it('every shape that must be reported is reported, by its name and nothing else', () => {
      expect(result.reported.missed).toEqual([]);
    });

    it('no ordinary line is reported', () => {
      expect(result.ordinary.wrong).toEqual([]);
    });

    it('the corpus of shapes covers every syntax of the rule', () => {
      for (const syntax of SYNTAXES_OF_THE_RULE) expect(result.reported.syntaxes).toContain(syntax);
      // The planted cases of `pnpm test:supply-chain` that are bindings, and more.
      expect(result.reported.total).toBeGreaterThanOrEqual(40);
    });

    it('the corpus of ordinary lines holds at least twenty files of them', () => {
      expect(result.ordinary.total).toBeGreaterThanOrEqual(20);
    });

    it('the program says so with its exit code', () => {
      const run = runNode([SCANNER, '--self-test']);
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toMatch(/shapes that must be reported: (\d+) of \1; ordinary lines left alone: (\d+) of \2/);
    });
  });

  describe('which names are secret-like', () => {
    const SECRET_LIKE = [
      'password',
      'Password',
      'smtpPassword',
      'SMTP_PASSWORD',
      'smtp-password',
      'spring.datasource.password',
      'MYSQL_PASSWD',
      'secret',
      'clientSecret',
      'SESSION_SECRET',
      'token',
      'accessToken',
      'csrf-token',
      'x-csrf-token',
      'apiKey',
      'API_KEY',
      'apikey',
      'x-api-key',
      'APIKey',
      'privateKey',
      'credential',
      'AWS_CREDENTIALS',
      'DATA_KEY',
      'api key',
      'API_KEY_2',
      'password2',
      // The last word ends with a secret word.
      'PGPASSWORD',
      'DBPASSWD',
      'MYSQL_PWD',
      'csrfToken',
      'csrftoken',
      // `key` after a word that makes it a secret.
      'AWS_SECRET_ACCESS_KEY',
      'accessKey',
      'SECRET_KEY',
      'signingKey',
      'ENCRYPTION_KEY',
      'masterKey',
      'CLIENT_KEY',
      'sessionKey',
      'secretkey',
      // Names this repository had and changed to follow the rule.
      'showPassword',
      'hidePassword',
      'unknown-token',
    ];
    const ORDINARY = [
      'passwordPolicy',
      'tokenType',
      'secretName',
      'PASSWORD_MIN_LENGTH',
      'passwordHash',
      'passwordLabel',
      'tokens',
      'secrets',
      'passwords',
      'key',
      'publicKey',
      'primaryKey',
      'cacheKey',
      'sortKey',
      'foreignKey',
      'idempotencyKey',
      'keyboard',
      'tokenizer',
      'secretary',
      'TOKEN_TTL_SECONDS',
      'SESSION_SECRET_FILE',
      'credentialsPath',
      'apiKeyHeader',
      'monkey',
      '',
      // What those names are now.
      'showPasswordText',
      'hidePasswordText',
      'unknown-custom-property',
    ];

    let verdicts: Record<string, boolean>;

    beforeAll(() => {
      const program = `
        import { isSecretLikeName } from './scripts/secret-assignments/secret-assignments.mjs';
        const names = JSON.parse(process.argv[1]);
        process.stdout.write(JSON.stringify(Object.fromEntries(names.map((n) => [n, isSecretLikeName(n)]))));
      `;
      const run = runNode(['--input-type=module', '--eval', program, JSON.stringify([...SECRET_LIKE, ...ORDINARY])]);
      if (run.exitCode !== 0) throw new Error(run.output);
      verdicts = JSON.parse(run.stdout) as Record<string, boolean>;
    });

    it.each(SECRET_LIKE)('"%s" is, or ends with, a secret word', (name) => {
      expect(verdicts[name]).toBe(true);
    });

    it.each(ORDINARY)('"%s" is not: it only contains one, or none', (name) => {
      expect(verdicts[name]).toBe(false);
    });
  });

  describe('a directory', () => {
    // Under .artifacts/ of the repository (ignored by git), not under the temporary folder of
    // the system, where an antivirus may take files away.
    const scratch = join(root, '.artifacts');
    let directory: string;

    function scan(files: Record<string, string>, ...args: string[]) {
      for (const [file, text] of Object.entries(files)) {
        mkdirSync(dirname(join(directory, file)), { recursive: true });
        writeFileSync(join(directory, file), text);
      }
      const run = runNode([SCANNER, directory, ...args]);
      const findings = [...run.stdout.matchAll(/^(.+)\n {2}(\d+) {2}error .*bound to "([^"]+)"/gm)].map(
        ([, file = '', line = '', name = '']) => `${file.replaceAll('\\', '/').slice(directory.replaceAll('\\', '/').length + 1)}:${line} ${name}`,
      );
      return { exitCode: run.exitCode, output: run.output, findings };
    }

    beforeEach(() => {
      mkdirSync(scratch, { recursive: true });
      directory = mkdtempSync(join(scratch, 'secret-scan-'));
    });
    afterEach(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    // The values a real file would hold, put together here so that this file holds none.
    const value = ['Zk3vN8qL', 'm2Xw5Rt9', 'Yb4Hc7Dg'].join('');
    const short = ['hun', 'ter', '2'].join('');

    it('names the file, the line and the name, never the value, and fails', () => {
      const { exitCode, output, findings } = scan({
        'deploy/server.env': `STAGE=prod\nSMTP_PASSWORD=${value}\n`,
        'src/session.ts': `export const sessionSecret: string = '${value}';\n`,
        'config/app.yml': `smtp:\n  host: mail.example.test\n  password: ${value}\n`,
      });
      expect(exitCode).toBe(1);
      expect(findings.sort()).toEqual(['config/app.yml:3 password', 'deploy/server.env:2 SMTP_PASSWORD', 'src/session.ts:1 sessionSecret']);
      expect(output).not.toContain(value);
      expect(output).toContain('3 literal value(s) bound to a name like a secret.');
      expect(output).toContain('invented- or local-only-');
    });

    it('passes, and prints nothing, when every value follows the rule', () => {
      const { exitCode, output } = scan({
        '.env.example': ['SMTP_PASSWORD=invented-mail-password', 'API_TOKEN=', 'DATA_KEY=${DATA_KEY}', ''].join('\n'),
        'src/config.ts': 'export const password = process.env.SMTP_PASSWORD;\n',
        'src/fetch.ts': "export const options = { credentials: 'same-origin' };\n",
        'compose.yaml': 'services:\n  db:\n    environment:\n      POSTGRES_PASSWORD: local-only-owner\n',
      });
      expect({ exitCode, output }).toEqual({ exitCode: 0, output: '' });
    });

    it('reads what git tracks or would take: an ignored file is not read', () => {
      const { findings } = scan({
        '.gitignore': '.env\nnode_modules/\n',
        '.env': `SMTP_PASSWORD=${short}\n`,
        'node_modules/x/index.js': `exports.token = '${short}';\n`,
        'kept.env': `SMTP_PASSWORD=${short}\n`,
      });
      expect(findings).toEqual(['kept.env:1 SMTP_PASSWORD']);
    });

    it('never reads a lockfile, and leaves out what the caller excludes', () => {
      const files = {
        'pnpm-lock.yaml': `packages:\n  token: ${short}\n`,
        'package-lock.json': `{ "token": "${short}" }\n`,
        'openapi/openapi.json': `{ "example": { "password": "${short}" } }\n`,
        'vendor/lib/config.js': `module.exports = { apiKey: '${short}' };\n`,
        'src/config.js': `module.exports = { apiKey: '${short}' };\n`,
      };
      expect(scan(files).findings.sort()).toEqual(['openapi/openapi.json:1 password', 'src/config.js:1 apiKey', 'vendor/lib/config.js:1 apiKey']);
      expect(scan(files, '--exclude', 'openapi/', '--exclude', 'vendor/**/*.js').findings).toEqual(['src/config.js:1 apiKey']);
    });

    it('steps over a file that is not a text', () => {
      const { exitCode } = scan({ 'image.bin': `\u0000\u0001\u0002SMTP_PASSWORD=${short}\n` });
      expect(exitCode).toBe(0);
    });
  });

  describe('this repository', () => {
    const excludeArgs = exclude.flatMap((entry) => ['--exclude', entry]);

    it('follows the rule: nothing is reported in what git tracks or would take', () => {
      const run = runNode([SCANNER, '.', ...excludeArgs]);
      expect(run.output.replaceAll('\\', '/').replaceAll(`${root.replaceAll('\\', '/')}/`, '')).toBe('');
      expect(run.exitCode).toBe(0);
    });

    it('leaves out only what is generated or vendored: three folders, each named in the README', () => {
      expect(exclude).toEqual(['packages/api-client/openapi/', 'packages/api-client/src/generated/', 'packages/ui/src/generated/']);
      const readme = readFileSync(join(root, 'README.md'), 'utf8');
      for (const entry of exclude) {
        expect(existsSync(join(root, entry)), entry).toBe(true);
        expect(readme, `the README names ${entry}`).toContain(`\`${entry}\``);
      }
    });

    it('the design system is written here and is read: its script is among the files the scan takes, and no exclusion covers it', () => {
      const listed = runNode(['--input-type=module', '--eval', "import { listFiles } from './scripts/secret-assignments/secret-assignments.mjs'; process.stdout.write(listFiles('.').join('\\n'));"]);
      const files = listed.stdout.split('\n');
      expect(files).toContain('design-system/components/bundle.js');
      expect(exclude.some((entry) => 'design-system/components/bundle.js'.startsWith(entry))).toBe(false);
    });

    it('`pnpm secrets` runs this scanner with this configuration, beside secretlint', () => {
      const tasks = readFileSync(join(root, 'scripts', 'run.mjs'), 'utf8');
      expect(tasks).toContain("import { formatFindings, scanDirectory } from './secret-assignments/secret-assignments.mjs';");
      expect(tasks).toContain("import { SECRET_SCAN_EXCLUDE } from './secret-scan.config.mjs';");
      expect(tasks).toContain('scanDirectory(root, { exclude: SECRET_SCAN_EXCLUDE })');
      expect(tasks).toMatch(/return formats !== 0 \|\| assignments\.length > 0 \? 1 : 0;/);
    });
  });
});
