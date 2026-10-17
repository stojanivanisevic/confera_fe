// M3-QA-01 and M3-QA-02 (timing) against a REAL confera_be (README, "Against the real API"): the
// form that seed:e2e publishes under `e2eprobnaforma01`, whose conference lists the harness site
// http://localhost:4000, embedded with the snippet of README section 10 on the hostile page, in
// three engines with third-party cookies blocked, at 1440 px and at 375 px:
//  - filled in, the language switched in the frame (everything kept), a file with Serbian letters,
//    Send pressed twice: one thank-you, one submission, ONE confirmation in the mail catcher;
//  - the frame inserted late by a consent manager, on a site that zooms its content;
//  - the API's Origin and Sec-Fetch-Site checks reached through this web application's forward;
//  - NFR-PERF-01: the form usable within 2 s, a submit without files answered within 2 s.
//
// Skipped without CONFERA_E2E_API_ORIGIN (the stub has no such form). Needs, from that checkout:
//   CONFERA_E2E_MAILPIT_ORIGIN  the web address of its mail catcher
// and a default mail server of organisation A that sends to it (qa-real-api-flows.spec.ts adds one).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import type { Frame, Page } from '@playwright/test';

import { buildEmbedSnippet, frameId } from '../packages/embed-loader/src/index';
import { HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { AGAINST_REAL_API } from './support/admin';
import { expect, test } from './support/fixtures';
import { watchPage } from './support/page-problems';

const SLUG = 'e2eprobnaforma01';
const FRAME = `#${frameId(SLUG)}`;
const MAILPIT = process.env.CONFERA_E2E_MAILPIT_ORIGIN ?? 'http://127.0.0.1:8025';
/** The PostgreSQL container of that checkout's stack, for the one probe that has to age a token (optional). */
const PG_CONTAINER = process.env.CONFERA_E2E_PG_CONTAINER ?? '';
const sql = (statement: string): string => {
  const result = spawnSync('docker', ['exec', PG_CONTAINER, 'psql', '-U', 'postgres', '-d', 'confera', '-tAc', statement], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`psql: ${result.stderr}`);
  return result.stdout.trim();
};
const SNIPPET = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: SLUG, title: 'Abstract submission', linkText: 'Form not showing? Open it on its own page.' });

test.skip(!AGAINST_REAL_API, 'only against a real confera_be with seed:e2e');

const siteUrl = (paste: string) => `${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(paste, 'utf8').toString('base64url')}`;

async function formFrame(page: Page): Promise<Frame> {
  const locator = page.locator(FRAME);
  await locator.scrollIntoViewIfNeeded();
  const frame = await (await locator.elementHandle())?.contentFrame();
  if (!frame) throw new Error('The frame of the form has no document');
  await frame.locator('[data-confera-form][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  return frame;
}

interface MailSummary { readonly ID: string; readonly Created: string }
async function mailsTo(address: string): Promise<MailSummary[]> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await response.json()) as { messages: MailSummary[] }).messages;
}

/** The whole form in English, as an author with a paper who pays herself. */
async function fillInEnglish(target: Page | Frame, email: string, title: string): Promise<void> {
  await target.getByRole('radio', { name: 'With an abstract and a paper' }).evaluate((el: HTMLElement) => el.click());
  await target.getByRole('textbox', { name: 'First name', exact: true }).first().fill('Živana');
  await target.getByRole('textbox', { name: 'Last name', exact: true }).first().fill('Đorđević');
  await target.getByRole('textbox', { name: 'Institution', exact: true }).first().fill('Ekonomski fakultet, Univerzitet Primer');
  await target.getByLabel('Email address').first().fill(email);
  await target.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await target.getByRole('textbox', { name: 'Abstract', exact: true }).fill('Kratak apstrakt o održivom turizmu na Balkanu: šđčćž ŠĐČĆŽ.');
  await target.getByLabel('Keywords').fill('turizam, održivost');
  await target.getByRole('radio', { name: 'Proceedings or selected papers' }).evaluate((el: HTMLElement) => el.click());
  await target.getByRole('radiogroup', { name: /member of UdEkoM Balkans/ }).getByRole('radio', { name: 'No' }).evaluate((el: HTMLElement) => el.click());
  await target.getByRole('radio', { name: 'In person', exact: true }).evaluate((el: HTMLElement) => el.click());
  await target.getByRole('radiogroup', { name: /discount/ }).getByRole('radio', { name: 'No' }).evaluate((el: HTMLElement) => el.click());
  await target.getByRole('radio', { name: 'I do', exact: true }).evaluate((el: HTMLElement) => el.click());
  await target.getByLabel('Your address for the invoice').fill('Izmišljena 1, Beograd');
  await target.getByRole('radio', { name: 'Bank wire (EUR)' }).evaluate((el: HTMLElement) => el.click());
  await target.getByRole('checkbox').evaluate((el: HTMLElement) => el.click());
}

/**
 * A real press, after the control is brought to the middle of the window: the hostile site's sticky
 * header covers the top. In WebKit Playwright's pointer still lands on that header for a control in a
 * cross-site frame, so there the control is pressed from the keyboard (Enter, twice for a double press).
 */
async function press(locator: ReturnType<Frame['locator']>, browserName: string, twice = false): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
  if (browserName === 'webkit') {
    await locator.focus();
    // The keys go to whatever has the focus then, as a person's do: no second look for the control.
    const keyboard = locator.page().keyboard;
    await keyboard.press('Enter');
    if (twice) await keyboard.press('Enter');
  } else if (twice) await locator.dblclick();
  else await locator.click();
}

// Unique per test: two workers of one engine start in the same millisecond.
const run = () => `${test.info().project.name}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

for (const width of [1440, 375]) {
  test.describe(`the seeded form in the snippet on the hostile site, ${width} px (M3-QA-01)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('filled in, the language switched, a Serbian file name, Send pressed twice: one submission and one email', async ({ page, browserName }) => {
        test.setTimeout(150_000);
      const problems = watchPage(page);
      const id = run();
      const email = `qa3.${id}@autori.example.test`;
      const title = `Održivi turizam ${id}`;
      await page.goto(siteUrl(SNIPPET));
      const frame = await formFrame(page);
      // No cookie is needed or kept: the frame is third-party and its cookies are blocked.
      expect(await frame.evaluate(() => document.cookie)).toBe('');
      await fillInEnglish(frame, email, title);
      await frame.locator('[data-confera-file="biographies"] input[type="file"]').setInputFiles({ name: 'Biografije – Šćepanović Đurđa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% QA\n%%EOF\n') });
      await expect(frame.locator('[data-confera-file="biographies"]')).toHaveAttribute('data-confera-file-state', 'uploaded', { timeout: 30_000 });
      await expect(frame.locator('[data-confera-file="biographies"]')).toContainText('Biografije – Šćepanović Đurđa.pdf');

      // The language switch keeps every value (FR-FORM-09).
      await press(frame.getByRole('radio', { name: 'Srpski' }), browserName);
      await expect(frame.getByRole('textbox', { name: 'Ime', exact: true }).first()).toHaveValue('Živana');
      await expect(frame.getByRole('textbox', { name: 'Naslov', exact: true })).toHaveValue(title);
      await expect(frame.getByRole('radio', { name: 'Bankovni transfer (EUR)' })).toBeChecked();
      await expect(frame.getByRole('checkbox')).toBeChecked();

      const submits: number[] = [];
      frame.page().on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith(`/public/v1/forms/${SLUG}/submissions`)) submits.push(Date.now());
      });
      // Past the minimum fill time of the API (3 s from the token): a person takes longer anyway.
      await page.waitForTimeout(3_500);
      await press(frame.getByRole('button', { name: 'Pošalji' }), browserName, true);
      await expect(frame.locator('[data-confera-thanks]')).toBeFocused({ timeout: 60_000 });
      await expect(frame.locator('[data-confera-thanks]')).toContainText(`Potvrda stiže na ${email}.`);
      const reference = (await frame.locator('[data-confera-reference]').innerText()).replace(/^.*: /, '');
      expect(reference).toMatch(/^PK27-\d{4}$/);

      // One confirmation, with the reference, however many presses (FR-FORM-14, FR-FORM-15).
      await expect.poll(async () => (await mailsTo(email)).length, { timeout: 45_000, intervals: [1_000] }).toBe(1);
      const [mail] = await mailsTo(email);
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${mail!.ID}`)).json()) as { Text: string; Subject: string };
      expect(`${message.Subject}\n${message.Text}`).toContain(reference);
      await page.waitForTimeout(5_000);
      expect((await mailsTo(email)).length, 'still one email').toBe(1);
      expect(problems.messages, browserName).toEqual([]);
      // The form in the frame never scrolls sideways (NFR-RESP-01); the hostile site itself is not ours to judge.
      expect(await frame.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  });
}

test.describe('the seeded form on sites that do things to it (M3-QA-01, edge cases)', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  for (const [what, zoom, late] of [
    ['a consent manager inserts the frame later', '1', true],
    ['a site that zooms its content (CSS zoom 1.25)', '1.25', false],
  ] as const) {
    test(`${what}: the frame follows its height`, async ({ page }) => {
      const paste = late ? SNIPPET.replace(/(<iframe[\s\S]*?<\/iframe>)/, '<template id="held-frame">$1</template><div id="consent-placeholder">Accept cookies to see this content</div>') : SNIPPET;
      await page.goto(siteUrl(paste));
      await page.evaluate((factor) => {
        document.body.style.setProperty('zoom', factor);
      }, zoom);
      if (late) {
        await page.waitForTimeout(1_000);
        await page.evaluate(() => {
          const template = document.getElementById('held-frame') as HTMLTemplateElement;
          document.getElementById('consent-placeholder')!.replaceWith(template.content.cloneNode(true));
        });
      }
      const frame = await formFrame(page);
      // A pointer under a zoomed ancestor lands elsewhere in Playwright's arithmetic: the buttons are pressed by the DOM.
      for (let i = 0; i < 3; i += 1) await frame.getByRole('button', { name: 'Add an author' }).evaluate((el: HTMLElement) => el.click());
      await expect(frame.getByRole('textbox', { name: 'First name', exact: true })).toHaveCount(4);
      // The frame's document never scrolls inside: the frame is as tall as what it shows.
      await expect
        .poll(() => frame.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), { message: 'no scrolling inside the frame' })
        .toBeLessThanOrEqual(1);
    });
  }

  test("the API's checks of Origin, Sec-Fetch-Site and the content type hold through the web application's forward (ADR-08, ST-31)", async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'requests, no browser: once is enough');
    const tokens = `${PUBLIC_ORIGIN}/public/v1/forms/${SLUG}/tokens`;
    const post = (headers: Record<string, string>, data = '{}') => page.request.post(tokens, { headers: { 'Content-Type': 'application/json', ...headers }, data, failOnStatusCode: false });
    expect((await post({ Origin: PUBLIC_ORIGIN, 'Sec-Fetch-Site': 'same-origin' })).status()).toBe(201);
    const crossSite = await post({ Origin: HARNESS_ORIGIN, 'Sec-Fetch-Site': 'cross-site' });
    expect(crossSite.status()).toBe(403);
    // The page's own Origin, but the browser says the request came from another site of the same registrable domain.
    const sameSite = await post({ Origin: PUBLIC_ORIGIN, 'Sec-Fetch-Site': 'same-site' });
    expect(sameSite.status()).toBe(403);
    expect(await sameSite.json()).toEqual(expect.objectContaining({ code: 'fetch_site_refused' }));
    const plain = await post({ Origin: PUBLIC_ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'text/plain' });
    expect(plain.status()).toBe(415);
    // A call from the harness site in a real browser: the custom header forces a preflight, which gets no grant.
    await page.goto(`${HARNESS_ORIGIN}/hostile.html`);
    const fromSite = await page.evaluate(async (url) => {
      try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Form-Token': 'x'.repeat(43) }, body: '{}' });
        return 'answered';
      } catch {
        return 'blocked';
      }
    }, tokens.replace(/tokens$/, 'submissions'));
    expect(fromSite).toBe('blocked');
  });

  test('NFR-PERF-01: on a typical mobile connection the form is usable within 2 s, and a submit without files is answered within 2 s', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'network emulation is a Chromium feature');
    test.setTimeout(90_000);
    // "Regular 4G" of the Chrome developer tools: 4 Mbit/s down, 3 Mbit/s up, 20 ms latency.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 });
    const started = Date.now();
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    const usable = Date.now() - started;
    const id = run();
    await fillInEnglish(page, `qa3.perf.${id}@autori.example.test`, `Brzina ${id}`);
    await page.waitForTimeout(3_500);
    const answered = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/submissions'));
    const sent = Date.now();
    await page.getByRole('button', { name: 'Send' }).click();
    const response = await answered;
    const submit = Date.now() - sent;
    await expect(page.locator('[data-confera-thanks]')).toBeVisible();
    test.info().annotations.push({ type: 'NFR-PERF-01', description: `usable after ${String(usable)} ms; submit answered after ${String(submit)} ms (${String(response.status())})` });
    console.log(`NFR-PERF-01 ${browserName}: usable after ${String(usable)} ms; submit answered after ${String(submit)} ms`);
    expect(usable).toBeLessThan(2_000);
    expect(submit).toBeLessThan(2_000);
  });

  test('Q3-01: a token that expired while the author typed: the thank-you stands for a stored submission and its email', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium' || PG_CONTAINER === '', 'needs CONFERA_E2E_PG_CONTAINER to age the token; once is enough');
    test.setTimeout(90_000);
    const tokenAnswer = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/tokens'));
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    const { formToken } = (await (await tokenAnswer).json()) as { formToken: string };
    const id = run();
    const email = `qa3.expired.${id}@autori.example.test`;
    const title = `Istekao token ${id}`;
    await fillInEnglish(page, email, title);
    // The afternoon passes: the token of this page expires (6 hours, M3-ISS-04).
    const hash = createHash('sha256').update(formToken, 'utf8').digest('hex');
    expect(sql(`UPDATE form_tokens SET issued_at = issued_at - interval '7 hours', expires_at = now() - interval '1 minute' WHERE token_hash = '${hash}' RETURNING 1`).split(/\r?\n/)[0]).toBe('1');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('[data-confera-thanks]')).toBeVisible({ timeout: 20_000 });
    const reference = (await page.locator('[data-confera-reference]').innerText()).replace(/^.*: /, '');
    expect(sql(`SELECT count(*) FROM submissions WHERE reference = '${reference}' AND title = '${title}'`), `submission ${reference}`).toBe('1');
    await expect.poll(async () => (await mailsTo(email)).length, { timeout: 30_000, intervals: [1_000] }).toBe(1);
  });

  test('the proof-of-work a busy address is asked for (difficulty 16) is solved in reasonable time in this engine', async ({ page, browserName }) => {
    test.setTimeout(150_000);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    await page.locator('[data-confera-form][data-hydrated="true"]').waitFor();
    // The loop of solveProofOfWork (packages/form-renderer/src/public-api.ts): its rate, for 20 s at most.
    const { hashes, ms } = await page.evaluate(async () => {
      const challenge = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      const started = performance.now();
      let counter = 0;
      for (; performance.now() - started < 20_000 && counter < 200_000; counter += 1) {
        if (counter % 2000 === 0 && counter > 0) await new Promise((resolve) => setTimeout(resolve, 0));
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}:${String(counter)}`));
      }
      return { hashes: counter, ms: performance.now() - started };
    });
    // 16 zero bits: 65 536 tries on average; one author in twenty needs three times as many.
    const average = Math.round((65_536 * ms) / hashes);
    console.log(`proof-of-work 16 bits, ${browserName}: ${String(hashes)} hashes in ${String(Math.round(ms))} ms, about ${String(average)} ms on average`);
    test.info().annotations.push({ type: 'proof-of-work', description: `${browserName}: about ${String(average)} ms on average` });
    expect(average).toBeLessThan(10_000);
  });
});
