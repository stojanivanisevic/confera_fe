// Keeps the browser tests away from the operating-system account.
//
// What happened: the full Chromium build (`channel: 'chromium'`, chrome.exe)
// wants to know whether the device can re-authenticate its user before filling
// a saved password or card. On Windows it finds out by asking whether the
// signed-in account has a blank password, and it asks by *trying an interactive
// logon with an empty password*:
//   chrome/browser/password_manager/password_manager_util_win.cc
//   CheckBlankPasswordWithPrefs -> LogonUser(user, ".", "", LOGON32_LOGON_INTERACTIVE)
// On an account that has a password the attempt fails. Windows records event
// 4625 (logon type 2, process chrome.exe) and counts one bad password.
// Chromium remembers the answer in its "Local State", but the test runner gives
// every launch a new, empty profile, so every launch asked again. Ten launches
// inside the lockout window locked the developer's account (event 4740).
// A machine joined to a domain is not affected: Chromium skips the attempt there.
//
// Nothing in the application or in the tests asks the operating system to
// authenticate anyone: no WebAuthn, no Credential Management API, no HTTP
// authentication. The cause is the browser, not a page.
//
// Four measures. The first removes the cause; the others do not depend on it.
//   1. An isolated profile, made by us for every Chromium the tests start, whose
//      "Local State" already holds the answer, dated far in the future. Chromium
//      re-asks Windows only when the account's password is newer than that date
//      (same file: `pref_last_changed > 0 && last_changed <= pref_last_changed`).
//   2. The same profile has the password manager, sign-in before filling and
//      autofill switched off. Chromium has no command-line switch for these;
//      they are preferences, so they are set where preferences live.
//   3. A virtual authenticator on every page (Chrome DevTools Protocol, WebAuthn
//      domain), so a WebAuthn request can never reach Windows Hello.
//   4. A guard that reads the account's bad-password count (read-only) before
//      and after Chromium runs. If it ever rises, the run stops and no further
//      run starts until a person has looked: the tests can cost one bad
//      password, never a lockout.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BrowserContext, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// 1 and 2: the isolated profile

/**
 * Chromium's "Local State" for a new profile directory. 64-bit integers are
 * stored as strings; the unit is microseconds since 1601 (about the year 2200).
 */
export const CHROMIUM_LOCAL_STATE = {
  password_manager: {
    os_password_blank: false,
    os_password_last_changed: '18900000000000000',
  },
} as const;

/** Profile preferences: nothing is saved, offered, filled or re-authenticated. */
export const CHROMIUM_PREFERENCES = {
  credentials_enable_service: false,
  credentials_enable_autosignin: false,
  profile: { password_manager_leak_detection: false },
  password_manager: { biometric_authentication_filling: false },
  autofill: { profile_enabled: false, credit_card_enabled: false },
} as const;

/** A new, empty Chromium profile directory with the two files above. The caller removes it. */
export function createIsolatedChromiumProfile(parent: string = tmpdir()): string {
  const dir = mkdtempSync(join(parent, 'confera-e2e-chromium-'));
  writeFileSync(join(dir, 'Local State'), JSON.stringify(CHROMIUM_LOCAL_STATE));
  mkdirSync(join(dir, 'Default'));
  writeFileSync(join(dir, 'Default', 'Preferences'), JSON.stringify(CHROMIUM_PREFERENCES));
  return dir;
}

export function removeIsolatedChromiumProfile(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

// ---------------------------------------------------------------------------
// 3: WebAuthn never reaches the operating system

/**
 * Gives every page of the context a virtual authenticator and switches the
 * real ones off for it. Chromium only (the protocol is Chromium's); the other
 * engines never showed the problem. Returns the list of pages where this
 * failed, which must stay empty.
 */
export async function attachVirtualAuthenticator(context: BrowserContext): Promise<string[]> {
  const problems: string[] = [];
  if (context.browser()?.browserType().name() !== 'chromium') return problems;
  const attach = async (page: Page): Promise<void> => {
    try {
      const session = await context.newCDPSession(page);
      await session.send('WebAuthn.enable', { enableUI: false });
      await session.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
    } catch (error) {
      if (!page.isClosed()) problems.push(`${page.url()}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  context.on('page', (page) => void attach(page));
  await Promise.all(context.pages().map(attach));
  return problems;
}

// ---------------------------------------------------------------------------
// 4: the guard

const BASELINE_ENV = 'CONFERA_E2E_BAD_PASSWORD_BASELINE';
const MARKER_ENV = 'CONFERA_E2E_OS_GUARD_MARKER';

/** One file per machine user, outside any clone, so a fresh clone cannot start where another one stopped. */
export function guardMarkerPath(): string {
  return process.env[MARKER_ENV] ?? join(tmpdir(), 'confera-e2e-os-account-guard.tripped');
}

/**
 * How many failed logons Windows has counted for the signed-in account since
 * its last successful one. Read-only. null where it cannot be read (another
 * operating system, or the query failed).
 */
export function readBadPasswordAttempts(): number | null {
  if (process.platform !== 'win32') return null;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', '([ADSI]"WinNT://$env:COMPUTERNAME/$env:USERNAME,user").BadPasswordAttempts'],
    { encoding: 'utf8', timeout: 20_000, windowsHide: true },
  );
  const text = (result.stdout ?? '').trim();
  return result.status === 0 && /^\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

/** Stops a run before it starts if an earlier run tripped the guard. */
export function refuseIfGuardTripped(): void {
  const marker = guardMarkerPath();
  if (!existsSync(marker)) return;
  throw new Error(
    [
      'The browser tests are switched off on this machine.',
      `An earlier run saw the bad-password count of the Windows account rise while Chromium was running:`,
      readFileSync(marker, 'utf8').trim(),
      'Find out why before running them again (see README, "Browser tests", and e2e/support/os-isolation.ts).',
      `Then delete ${marker}`,
    ].join('\n'),
  );
}

/** Remembers the count at the start of a run. Workers inherit it through the environment. */
export function recordBadPasswordBaseline(read: () => number | null = readBadPasswordAttempts): number | null {
  const count = read();
  if (count === null) delete process.env[BASELINE_ENV];
  else process.env[BASELINE_ENV] = String(count);
  return count;
}

/**
 * Throws, and switches the browser tests off for later runs, if the count is
 * higher than at the start of the run. A count that fell (the developer
 * unlocked the screen) is fine. A developer who mistypes a password while the
 * tests run trips it too; the message says what to do.
 */
export function assertWindowsAccountUntouched(when: string, read: () => number | null = readBadPasswordAttempts): void {
  const baseline = process.env[BASELINE_ENV];
  if (baseline === undefined) return;
  const now = read();
  if (now === null || now <= Number(baseline)) return;
  const detail = `${new Date().toISOString()}  ${when}: bad-password count ${baseline} -> ${now}`;
  writeFileSync(guardMarkerPath(), `${detail}\n`);
  throw new Error(
    [
      `The Windows account's bad-password count rose from ${baseline} to ${now} (${when}).`,
      'A browser started by the tests has probably tried to log on to the account, which must never happen.',
      'The run is stopped and the browser tests are switched off on this machine.',
      `If you mistyped your own password while the tests ran, delete ${guardMarkerPath()} and run again.`,
    ].join('\n'),
  );
}
