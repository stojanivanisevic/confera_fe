// The browser tests must never touch the operating-system account
// (e2e/support/os-isolation.ts). These checks need no browser.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertWindowsAccountUntouched,
  CHROMIUM_LOCAL_STATE,
  createIsolatedChromiumProfile,
  guardMarkerPath,
  recordBadPasswordBaseline,
  refuseIfGuardTripped,
  removeIsolatedChromiumProfile,
} from '../e2e/support/os-isolation';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('the isolated Chromium profile', () => {
  let scratch: string;
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'confera-os-isolation-test-'));
  });
  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('already holds the answer Chromium would otherwise get by trying to log on', () => {
    const profile = createIsolatedChromiumProfile(scratch);
    const localState = JSON.parse(readFileSync(join(profile, 'Local State'), 'utf8')) as typeof CHROMIUM_LOCAL_STATE;
    expect(localState).toEqual(CHROMIUM_LOCAL_STATE);
    expect(localState.password_manager.os_password_blank).toBe(false);
    // Chromium stores 64-bit integers as strings and reads anything else as 0, which would make it ask Windows again.
    expect(localState.password_manager.os_password_last_changed).toMatch(/^\d+$/);
    // Microseconds since 1601. It must lie after any moment the account's password can have been changed.
    const microsecondsFrom1601To1970 = 11_644_473_600_000_000n;
    const in50Years = microsecondsFrom1601To1970 + BigInt(Date.now() + 50 * 365 * 86_400_000) * 1000n;
    expect(BigInt(localState.password_manager.os_password_last_changed)).toBeGreaterThan(in50Years);
    expect(BigInt(localState.password_manager.os_password_last_changed)).toBeLessThan(2n ** 63n);
  });

  it('has the password manager, sign-in before filling and autofill switched off', () => {
    const profile = createIsolatedChromiumProfile(scratch);
    const preferences = JSON.parse(readFileSync(join(profile, 'Default', 'Preferences'), 'utf8')) as Record<string, unknown>;
    expect(preferences).toMatchObject({
      credentials_enable_service: false,
      credentials_enable_autosignin: false,
      password_manager: { biometric_authentication_filling: false },
      autofill: { profile_enabled: false, credit_card_enabled: false },
    });
  });

  it('is a new directory each time and is removed completely', () => {
    const first = createIsolatedChromiumProfile(scratch);
    const second = createIsolatedChromiumProfile(scratch);
    expect(first).not.toBe(second);
    removeIsolatedChromiumProfile(first);
    removeIsolatedChromiumProfile(second);
    expect(readdirSync(scratch)).toEqual([]);
  });
});

describe('the guard on the bad-password count', () => {
  const saved = { ...process.env };
  let scratch: string;
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'confera-os-guard-test-'));
    process.env.CONFERA_E2E_OS_GUARD_MARKER = join(scratch, 'tripped');
    delete process.env.CONFERA_E2E_BAD_PASSWORD_BASELINE;
  });
  afterEach(() => {
    process.env = { ...saved };
    rmSync(scratch, { recursive: true, force: true });
  });

  it('does nothing where the count cannot be read', () => {
    expect(recordBadPasswordBaseline(() => null)).toBeNull();
    expect(() => assertWindowsAccountUntouched('test', () => 7)).not.toThrow();
    expect(existsSync(guardMarkerPath())).toBe(false);
  });

  it('accepts an unchanged count and a count that fell', () => {
    recordBadPasswordBaseline(() => 2);
    expect(() => assertWindowsAccountUntouched('test', () => 2)).not.toThrow();
    expect(() => assertWindowsAccountUntouched('test', () => 0)).not.toThrow();
    expect(() => refuseIfGuardTripped()).not.toThrow();
  });

  it('stops the run on the first bad password and keeps later runs from starting', () => {
    recordBadPasswordBaseline(() => 0);
    expect(() => assertWindowsAccountUntouched('after a Chromium worker finished', () => 1)).toThrow(/rose from 0 to 1/);
    expect(readFileSync(guardMarkerPath(), 'utf8')).toMatch(/after a Chromium worker finished: bad-password count 0 -> 1/);
    expect(() => refuseIfGuardTripped()).toThrow(/switched off on this machine/);
  });
});

describe('how the browser tests get a browser', () => {
  const e2e = join(root, 'e2e');
  const sources = filesUnder(e2e).filter((path) => /\.ts$/.test(path));

  it('only through e2e/support/fixtures.ts: no spec takes `test` or a browser type from the runner itself', () => {
    const allowed = new Set(['support/fixtures.ts', 'global-setup.ts']);
    const offenders = sources
      .filter((path) => !allowed.has(relative(e2e, path).replaceAll('\\', '/')))
      .filter((path) => {
        const text = readFileSync(path, 'utf8');
        const valueImports = [...text.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+'(?:@playwright\/test|playwright(?:-core)?)'/g)];
        return valueImports.some(([, names]) =>
          (names ?? '')
            .replace(/[{}]/g, ' ')
            .split(',')
            .map((name) => name.trim())
            .some((name) => name !== '' && !name.startsWith('type ')),
        );
      })
      .map((path) => relative(root, path).replaceAll('\\', '/'));
    expect(offenders).toEqual([]);
  });

  it('never by a launch call or a profile argument of its own', () => {
    const offenders = sources
      .filter((path) => !/support[\\/](fixtures|os-isolation)\.ts$|global-setup\.ts$/.test(path))
      .filter((path) => /\.launch\(|launchPersistentContext\(|connectOverCDP\(|--user-data-dir/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path).replaceAll('\\', '/'));
    expect(offenders).toEqual([]);
  });

  it('with the account guard wired into every Playwright configuration', () => {
    const configs = readdirSync(root).filter((name) => /^playwright\..*config\.ts$|^playwright\.config\.ts$/.test(name));
    expect(configs.length).toBeGreaterThanOrEqual(2);
    for (const name of configs) {
      const text = readFileSync(join(root, name), 'utf8');
      expect(text, name).toContain("globalSetup: './e2e/global-setup.ts'");
      expect(text, name).toContain("globalTeardown: './e2e/global-teardown.ts'");
    }
  });
});
