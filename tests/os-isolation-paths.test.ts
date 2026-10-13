// Every way a browser could be started from this repository, checked without starting one
// (the review of commit 2262603; e2e/support/os-isolation.ts tells why it matters).
//
// tests/os-isolation.test.ts holds the rule for the TypeScript files under e2e/. A browser
// can also be started from elsewhere and in other spellings, and by Playwright itself:
//   - a script, a server of the harness or a unit test (any folder, .mjs and .js included);
//   - `require`, a dynamic `import()`, a re-export, a module name in double quotes;
//   - `launchServer`, `connect`, an executable path, a remote-debugging port;
//   - a window of Playwright's own: UI mode, the inspector (`--debug`, PWDEBUG,
//     `page.pause()`), the trace viewer, the recorder. Each is a Chromium on a new, empty
//     profile that no fixture starts (playwright-core, `launchApp`).
// None of this is run here: the checks read source text only.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { refusedBrowserWindow } from '../scripts/browser-windows.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** The two files that state the rule: they hold the forbidden spellings as text. */
const RULE_FILES = new Set(['tests/os-isolation-paths.test.ts', 'tests/os-isolation.test.ts']);

/** Every source file git knows or would take, in any folder: scripts, tests, the application, the harness. */
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter((file) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file))
  // The design-system script and its generated wrapper are checked by `pnpm ds:check` (no import, no network call at all).
  .filter((file) => !file.startsWith('design-system/') && !file.startsWith('packages/ui/src/generated/') && !RULE_FILES.has(file))
  .map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }));

/** Libraries that can start or drive a browser. */
const BROWSER_LIBRARIES = /^(?:@playwright\/test|playwright(?:-core)?(?:\/.*)?|playwright-(?:chromium|firefox|webkit)|puppeteer(?:-core)?|selenium-webdriver|webdriverio|chrome-launcher|chromedriver|electron|open)$/;

interface Use {
  file: string;
  module: string;
  /** False when the statement can only bring types (`import type`, or every name marked `type`). */
  value: boolean;
}

/** Every use of a module, in any spelling: import, export-from, require, dynamic import; single, double or back quotes. */
function moduleUses(file: string, text: string): Use[] {
  const uses: Use[] = [];
  const quoted = String.raw`(?:'([^']+)'|"([^"]+)"|` + '`([^`$]+)`)';
  const statement = new RegExp(String.raw`\b(import|export)\s+(type\s+)?([^;'"` + '`' + String.raw`]*?)\s*from\s*` + quoted, 'g');
  for (const match of text.matchAll(statement)) {
    const names = (match[3] ?? '').replace(/[{}]/g, ' ').split(',').map((name) => name.trim()).filter(Boolean);
    const typesOnly = match[2] !== undefined || (names.length > 0 && names.every((name) => name.startsWith('type ')));
    uses.push({ file, module: (match[4] ?? match[5] ?? match[6])!, value: !typesOnly });
  }
  for (const match of text.matchAll(new RegExp(String.raw`\bimport\s*` + quoted, 'g'))) uses.push({ file, module: (match[1] ?? match[2] ?? match[3])!, value: true });
  for (const match of text.matchAll(new RegExp(String.raw`\b(?:require|import)\s*\(\s*` + quoted, 'g'))) uses.push({ file, module: (match[1] ?? match[2] ?? match[3])!, value: true });
  return uses;
}

const LAUNCH = /\.\s*launch\s*\(|\blaunchPersistentContext\s*\(|\blaunchServer\s*\(|\bconnectOverCDP\s*\(|\b(?:chromium|firefox|webkit|browserType|_electron|_android)\s*\.\s*connect\s*\(|--user-data-dir|--remote-debugging|\bexecutablePath\b|\[\s*['"`]launch/;
const PAUSE = /\.\s*pause\s*\(/;

describe('the checks themselves see every spelling', () => {
  it.each([
    ["import { chromium } from '@playwright/test';", true],
    ['import { chromium } from "@playwright/test";', true],
    ["import { type Page, chromium } from '@playwright/test';", true],
    ["import * as pw from 'playwright';", true],
    ["import pw from 'playwright-core';", true],
    ["export { test } from '@playwright/test';", true],
    ["export * from '@playwright/test';", true],
    ["const { chromium } = require('playwright');", true],
    ["const pw = await import('@playwright/test');", true],
    ['const pw = await import(`playwright-core`);', true],
    ["import puppeteer from 'puppeteer';", true],
    ["import open from 'open';", true],
    ["import type { Page } from '@playwright/test';", false],
    ["import { type Page, type Frame } from '@playwright/test';", false],
  ])('%s', (code, value) => {
    const found = moduleUses('sample.ts', code).filter((use) => BROWSER_LIBRARIES.test(use.module));
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((use) => use.value)).toBe(value);
  });

  it.each([
    'await chromium.launch();',
    'await playwright.chromium . launch ( { headless: true } );',
    "await playwright[browserName]['launch']();",
    "await chromium.launchPersistentContext('', {});",
    'await chromium.launchServer();',
    "await chromium.connectOverCDP('http://127.0.0.1:9222');",
    "await firefox.connect('ws://127.0.0.1:1/');",
    "spawn(chrome, ['--user-data-dir=' + dir]);",
    "spawn(chrome, ['--remote-debugging-port=9222']);",
    'const options = { executablePath: chrome };',
  ])('a launch: %s', (code) => {
    expect(LAUNCH.test(code)).toBe(true);
  });

  it('a pause, which opens the inspector', () => {
    expect(PAUSE.test('await page.pause();')).toBe(true);
    expect(PAUSE.test('await page . pause ( );')).toBe(true);
  });
});

describe('how a browser can be started from this repository', () => {
  it('the scan reads the whole repository', () => {
    const names = sources.map((source) => source.file);
    expect(names.length).toBeGreaterThan(80);
    for (const expected of ['scripts/run.mjs', 'e2e/servers/web.mjs', 'e2e/support/fixtures.ts', 'tests/embed-listener.test.ts', 'apps/web/src/proxy.ts', 'playwright.config.ts']) {
      expect(names).toContain(expected);
    }
  });

  it('a library that drives a browser is used, as more than a type, in four reviewed files only', () => {
    const users = [...new Set(sources.flatMap(({ file, text }) => moduleUses(file, text)).filter((use) => use.value && BROWSER_LIBRARIES.test(use.module)).map((use) => `${use.file}: ${use.module}`))].sort();
    expect(users).toEqual([
      // The accessibility scans hand a page they were given to axe; they start nothing.
      // (@axe-core/playwright is not a browser library and is not listed here.)
      'e2e/global-setup.ts: @playwright/test', // the canary: one Chromium on an isolated profile
      'e2e/support/fixtures.ts: @playwright/test', // the only `test` the specs use
      'playwright.config.ts: @playwright/test', // defineConfig and devices: they start nothing
      'playwright.ds-visual.config.ts: @playwright/test',
    ]);
  });

  it('a browser is launched in two reviewed files only, each time on the isolated profile', () => {
    const launching = sources.filter(({ text }) => LAUNCH.test(text)).map(({ file }) => file).sort();
    expect(launching).toEqual(['e2e/global-setup.ts', 'e2e/support/fixtures.ts']);
    for (const file of ['e2e/global-setup.ts', 'e2e/support/fixtures.ts']) {
      const text = sources.find((source) => source.file === file)!.text;
      // Chromium only ever through launchPersistentContext, with a profile made by createIsolatedChromiumProfile.
      expect(text, file).toContain('createIsolatedChromiumProfile()');
      const chromiumLaunches = [...text.matchAll(/chromium\s*\.\s*(launch\w*)\s*\(\s*(\w+)/g)].map((match) => `${match[1]}(${match[2]})`);
      expect(chromiumLaunches, file).toEqual(['launchPersistentContext(profile)']);
    }
    // The one plain launch is for the engines that are not Chromium.
    const fixtures = sources.find((source) => source.file === 'e2e/support/fixtures.ts')!.text;
    expect(fixtures).toMatch(/if \(browserName !== 'chromium'\) \{\s*const other = await playwright\[browserName\]\.launch\(\);/);
    expect(fixtures.match(/\.launch\(/g)).toHaveLength(1);
  });

  it('no spec pauses: a pause opens the inspector, a Chromium of Playwright\'s own', () => {
    const pausing = sources.filter(({ text }) => PAUSE.test(text)).map(({ file }) => file);
    expect(pausing).toEqual([]);
  });

  it('the command line of Playwright is started by scripts/run.mjs only, to run tests or to download the browsers', () => {
    const starting = sources.filter(({ text }) => /['"`]playwright['"`]/.test(text) && /runBin\s*\(|spawn|exec/.test(text)).map(({ file }) => file).sort();
    expect(starting).toEqual(['scripts/run.mjs']);
    const run = sources.find((source) => source.file === 'scripts/run.mjs')!.text;
    const commands = [...run.matchAll(/runBin\(\s*'@playwright\/test'\s*,\s*'playwright'\s*,\s*\[\s*'([a-z-]+)'/g)].map((match) => match[1]);
    // Never codegen, open, show-trace, show-report, run-server or cr/ff/wk: each starts a browser of its own.
    expect(commands.sort()).toEqual(['install', 'test']);
    // Both ways of running tests go through the one function that refuses Playwright's own windows.
    expect(run).toMatch(/function browserTests\(args\) \{\s*const refused = refusedBrowserWindow\(extra, process\.env\);\s*if \(refused\) fail\(refused\);/);
    expect(run.match(/browserTests\(/g)).toHaveLength(3); // the function, `e2e` and `ds-visual`
    expect(run.match(/'test'/g)).toHaveLength(1); // nothing else builds a `playwright test` call
  });

  it('no package script and no configuration opens a report or a trace by itself', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    for (const [name, command] of Object.entries(manifest.scripts)) {
      expect(command, `script "${name}"`).not.toMatch(/playwright|show-trace|show-report|codegen|--ui|--debug|PWDEBUG/);
    }
    for (const file of ['playwright.config.ts', 'playwright.ds-visual.config.ts']) {
      const text = readFileSync(join(root, file), 'utf8');
      expect(text, file).not.toMatch(/open:\s*'(?:always|on-failure)'/);
      expect(text, file).not.toMatch(/\bheadless:\s*false|\bslowMo\b|connectOptions|\bexecutablePath\b/);
    }
  });
});

describe("Playwright's own windows are refused before anything starts", () => {
  it.each([['--ui'], ['--ui-port=0'], ['--ui-host', '127.0.0.1'], ['--debug'], ['e2e/embed.spec.ts', '--project=chromium', '--debug'], ['--ui', '--project=firefox']])(
    'pnpm e2e %s',
    (...args) => {
      expect(refusedBrowserWindow(args, {})).toMatch(/starts outside the isolated profile/);
    },
  );

  it.each(['1', 'console', 'true'])('PWDEBUG=%s', (value) => {
    expect(refusedBrowserWindow([], { PWDEBUG: value })).toMatch(/PWDEBUG is set/);
  });

  it.each([[], ['--project=webkit', '--workers=1', 'e2e/pages.spec.ts'], ['-g', 'the --ui of the application'], ['--headed'], ['--update-snapshots'], ['--debugger-is-not-a-switch']])(
    'an ordinary run is not refused: %j',
    (...args) => {
      expect(refusedBrowserWindow(args, {})).toBeNull();
      expect(refusedBrowserWindow(args, { PWDEBUG: '0' })).toBeNull();
      expect(refusedBrowserWindow(args, { PWDEBUG: '' })).toBeNull();
    },
  );

  it('the README tells how to look at a failed test without the trace viewer', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toMatch(/show-trace/);
    expect(readme).toMatch(/playwright-report\/index\.html/);
  });
});
