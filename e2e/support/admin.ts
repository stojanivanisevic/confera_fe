// What the specs of the admin screens share: the fixture of the API stub, a reset of its
// universe (one per worker, keyed by the User-Agent), and signing in through the page.
//
// Two modes. Against the stub (the default) the people are the stub's fixture. Against a real
// confera_be (CONFERA_E2E_API_ORIGIN; README, "Against the real API") they are the people of its
// `seed:e2e` (test/e2e/seed/e2e-seed.json there): the same names and addresses, their own
// password. `signIn` is the one way a spec signs in; against a real API it refuses, before
// anything is typed, a person `seed:e2e` does not have, so that no spec causes a failed
// sign-in there (the API's brake would then slow the seed admin down for every other spec).
import type { Page } from '@playwright/test';

import { ADMIN_ORIGIN, API_STUB_ORIGIN, REAL_API_ORIGIN } from '../env';
// @ts-expect-error -- plain Node module of the stub, typed here as far as the specs use it
import { PART_C as FIXTURE_PART_C } from '../servers/api-stub-part-c.mjs';
// @ts-expect-error -- plain Node module of the stub, typed here as far as the specs use it
import { STUB as FIXTURE, STUB_PART_B as FIXTURE_PART_B } from '../servers/stub-fixture.mjs';
import { expect } from './fixtures';

export interface Person {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}
export interface Fixture {
  readonly organisation: { readonly name: string; readonly contactEmail: string };
  readonly admin: Person;
  readonly otherAdmin: Person;
  readonly reviewer: Person;
  readonly invited: { readonly id: string; readonly email: string; readonly name: string };
  readonly deactivated: { readonly id: string; readonly name: string };
  readonly links: ReadonlyArray<{ readonly token: string; readonly purpose: string }>;
  readonly emailChangeToken: string;
  readonly newInvitationTokenPrefix: string;
}
export const STUB = FIXTURE as Fixture;

/** The run is in front of a real confera_be, not the stub. */
export const AGAINST_REAL_API = REAL_API_ORIGIN !== null;
/** Why a spec, or a test, does not run against a real API: it needs the stub's fixture (its records, tokens and reset). */
export const STUB_ONLY = 'needs the records, link tokens and reset of the API stub, which a real confera_be does not have';
/** A test on a form of the stub (e2e/servers/public-forms.json); the seeded form of a real API: qa-m3-real-api.spec.ts. */
export const STUB_FORMS = 'opens a form of the API stub, which a real confera_be does not have (its seeded form: qa-m3-real-api.spec.ts)';
/** The password of every person of confera_be's seed:e2e. */
const SEED_E2E_PASSWORD = 'invented-Jasen-Kula-Reka-42';
/** Who the specs sign in as, in this mode: the admin and the reviewer of organisation A. */
export const ADMIN: Person = AGAINST_REAL_API ? { ...STUB.admin, password: SEED_E2E_PASSWORD } : STUB.admin;
export const REVIEWER: Person = AGAINST_REAL_API ? { ...STUB.reviewer, password: SEED_E2E_PASSWORD } : STUB.reviewer;

/** The part B fixture, as far as the specs use it: the ids of the records they open. */
export interface FixturePartB {
  readonly ids: { readonly conference: string; readonly draftConference: string; readonly server: string; readonly spareServer: string; readonly hostileEntry: string };
  readonly templates: ReadonlyArray<{ readonly id: string; readonly type: string; readonly language: string }>;
}
export const PART_B = FIXTURE_PART_B as FixturePartB;
/** The id of a seeded template of the organisation. */
export const templateId = (type: string, language: string): string => PART_B.templates.find((t) => t.type === type && t.language === language)!.id;

/**
 * Why the screens behind sign-in do not run in WebKit: the session of ADR-03 is a `__Host-`
 * cookie, which must be Secure, and WebKit keeps no Secure cookie for http://localhost (Chromium
 * and Firefox treat localhost as a secure origin). The pages outside the shell run in all three.
 */
export const NO_SESSION_IN_WEBKIT = 'WebKit keeps no Secure cookie on http://localhost, and the __Host- session cookie of ADR-03 must be Secure';
/** The engine can hold a session against the local stack. */
export const holdsSession = (browserName: string): boolean => browserName !== 'webkit';
export const linkToken = (purpose: 'invitation' | 'password_reset'): string => STUB.links.find((link) => link.purpose === purpose)!.token;

/** Puts the stub's universe of this browser back to the fixture. Through the page's own request context, so it carries the worker's User-Agent. Against a real API there is no stub: nothing happens. */
export async function resetStub(page: Page): Promise<void> {
  if (AGAINST_REAL_API) return;
  const response = await page.request.post(`${API_STUB_ORIGIN}/__stub/reset`, { headers: { Origin: ADMIN_ORIGIN } });
  expect(response.status()).toBe(204);
}

/** Signs in through the page and lands on `next` (the home page by default), as the admin of this mode unless told otherwise. */
export async function signIn(page: Page, person: Person = ADMIN, next = '/'): Promise<void> {
  if (AGAINST_REAL_API && person !== ADMIN && person !== REVIEWER) {
    throw new Error(`signIn: ${person.email} with this password is a person of the stub; against a real API only the people of seed:e2e sign in (no failed sign-in may reach its brake)`);
  }
  const address = `${ADMIN_ORIGIN}/sign-in${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`;
  // Already there (a link led to it): no second load, which would cut off the scripts still loading.
  if (page.url() !== address) await page.goto(address);
  await expect(page.locator('[data-confera-sign-in]')).toBeVisible();
  await page.getByLabel('Email address').fill(person.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${ADMIN_ORIGIN}${next}`);
  await expect(page.locator('[data-confera-user]')).toHaveText(person.name);
}

/** The password asked again: the dialog of the design system, answered with the person's password. */
export async function answerPasswordAgain(page: Page, password: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Your password, once more' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).toBeHidden();
}

/** No sideways scroll at a phone's width (NFR-RESP-02). */
export const fitsTheWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Signs out through the person's menu of the top bar (UXUI-M2-24: the name and its two entries). */
export async function signOutFromMenu(page: Page): Promise<void> {
  await page.locator('[data-confera-user]').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

/** The records of the stub's part C (forms, submissions, held emails; e2e/servers/api-stub-part-c.mjs). */
export const PART_C = FIXTURE_PART_C as { form: string; submissions: [string, string]; files: { clean: string; pending: string }; held: [string, string] };
