// The admin screen of the seeded form against a REAL confera_be (README, "Against the real API"),
// and steps 4 and 5 of README section 10, "Try the embedded form": the admin of organisation A of
// seed:e2e opens the screen of the form `e2eprobnaforma01`, takes its snippet in Serbian and copies
// it; pasted into the harness site (`hostile.html?paste=<base64url>`), it is the form in a frame.
// Nothing is sent, so the API's limit of 10 submits an hour per client is not touched.
//
// Skipped without CONFERA_E2E_API_ORIGIN (the stub has its own forms: admin-intake.spec.ts), and in
// WebKit (NO_SESSION_IN_WEBKIT). The clipboard is read back in Chromium, the one engine that lets a
// test grant the permission; elsewhere the snippet is taken from its field.
import { frameId } from '../packages/embed-loader/src/index';
import { ADMIN_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { ADMIN, AGAINST_REAL_API, holdsSession, NO_SESSION_IN_WEBKIT, signIn } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const SLUG = 'e2eprobnaforma01';

test.skip(!AGAINST_REAL_API, 'only against a real confera_be with seed:e2e');
test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);

test("the seeded form's screen shows its snippet; copied and pasted into the harness site, it is the form in a frame", async ({ page, context, browserName }) => {
  test.setTimeout(120_000);
  const problems = watchPage(page);
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ADMIN_ORIGIN });

  // Step 4: Forms, the form, "On a conference website".
  await signIn(page, ADMIN, '/forms');
  await page.getByRole('table', { name: 'Forms' }).locator('tbody tr').filter({ hasText: `/f/${SLUG}` }).click();
  await expect(page).toHaveURL(new RegExp(`^${ADMIN_ORIGIN}/forms/[0-9a-f-]{36}$`));
  const card = page.locator('[data-confera-embed-card]');
  // The screen, not the error page ("This page couldn’t load") of a record it cannot draw.
  await expect(card, 'the screen of the form').toBeVisible();
  await expect(card.getByRole('heading', { name: 'On a conference website' })).toBeVisible();
  await card.getByLabel('Language of the site').selectOption('sr');
  const field = card.getByLabel('Snippet');
  await expect(field).toHaveValue(new RegExp(`^<p lang="sr"><a href="${PUBLIC_ORIGIN}/f/${SLUG}\\?lang=sr">Obrazac se ne prikazuje\\? Otvorite ga na posebnoj stranici\\.</a></p>\\n<iframe id="${frameId(SLUG)}" src="${PUBLIC_ORIGIN}/embed/${SLUG}\\?lang=sr"`));
  let snippet = await field.inputValue();
  await card.getByRole('button', { name: 'Copy the snippet' }).click();
  if (browserName === 'chromium') {
    await expect(page.locator('.ud-toast').last()).toContainText('Snippet copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(snippet);
    snippet = copied;
  }
  expect(problems.messages, 'the admin screen').toEqual([]);

  // Step 5: the harness site with the snippet pasted.
  await page.goto(`${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(snippet, 'utf8').toString('base64url')}`);
  const frameElement = page.locator(`#${frameId(SLUG)}`);
  await frameElement.scrollIntoViewIfNeeded();
  const frame = await (await frameElement.elementHandle())?.contentFrame();
  if (!frame) throw new Error('The frame of the form has no document');
  await frame.locator('[data-confera-form][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await expect(frame.getByRole('radio', { name: 'Srpski' })).toBeChecked();
  await expect(frame.getByRole('button', { name: 'Pošalji' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Obrazac se ne prikazuje? Otvorite ga na posebnoj stranici.' })).toHaveAttribute('href', `${PUBLIC_ORIGIN}/f/${SLUG}?lang=sr`);
});
