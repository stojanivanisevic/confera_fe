// M4-QA-01 (Test engineer, 0.4.0) against a REAL confera_be (README, "Against the real API"): the
// "To show" flow of the plan without the staging address, through the screens, read back from the mail
// catcher, in English (Chromium) and in Serbian (Firefox):
//   1. a new submission arrives through the seeded hosted form `e2eprobnaforma01`;
//   2. the template "Submission accepted" gets a version of its own for the seeded conference, edited in the
//      visual editor: an image uploaded through the toolbar, a placeholder inserted from the catalogue, words
//      with Serbian letters; saved;
//   3. the admin opens the submission (taken into processing), returns it for revision (the email with the note
//      is shown first, in the sandboxed frame), and accepts it after the author's corrections;
//   4. the catcher holds, for that author, the email with the note and the acceptance with the placeholder
//      filled and the image as an inline part, never a remote address.
// Plus the edge cases the stub cannot answer: the search typed without diacritics as people type đ, a stored
// template with hostile strings through the real server's preview and mail log, pasted images and a very large
// paste, images built to hurt a decoder, and the staging banner that a developer instance never shows.
//
// Skipped without CONFERA_E2E_API_ORIGIN, and in WebKit (NO_SESSION_IN_WEBKIT: the __Host- session cookie is
// Secure and WebKit keeps none on http://localhost; the screens are proven in WebKit only over HTTPS, M2-ISS-04).
// Needs from that checkout: CONFERA_E2E_MAILPIT_ORIGIN and CONFERA_E2E_MAILPIT_SMTP_PORT, and a ClamAV at its
// CLAMAV_ADDRESS (a fake daemon in 'clean' mode is enough) so that an uploaded image becomes clean and is sent.
import type { Page } from '@playwright/test';
import { PNG as PNGJS } from 'pngjs';

import { ADMIN_ORIGIN, PUBLIC_ORIGIN } from './env';
import { AGAINST_REAL_API, holdsSession, NO_SESSION_IN_WEBKIT, signIn } from './support/admin';
import { expect, test } from './support/fixtures';
import { ensureMailServer } from './support/mail-server';
import { watchPage } from './support/page-problems';

const SLUG = 'e2eprobnaforma01';
const CONFERENCE = 'Probna konferencija (izmišljeno) (PK 2027)';
const MAILPIT = process.env.CONFERA_E2E_MAILPIT_ORIGIN ?? 'http://127.0.0.1:8025';
const SERBIAN = 'š č ć ž đ Š Č Ć Ž Đ';

test.skip(!AGAINST_REAL_API, 'only against a real confera_be with seed:e2e');
test.skip(({ browserName }) => !holdsSession(browserName), NO_SESSION_IN_WEBKIT);
test.use({ timezoneId: 'Europe/Belgrade' });
test.beforeAll(async () => {
  await ensureMailServer();
});
test.beforeEach(({ page }) => {
  // A script of a stored text would open a dialog of the browser.
  page.on('dialog', (dialog) => {
    throw new Error(`a dialog of the browser opened: ${dialog.message()}`);
  });
});

interface MailSummary { readonly ID: string; readonly Subject: string }
interface MailDetail { readonly Subject: string; readonly Text: string; readonly HTML: string; readonly Inline: ReadonlyArray<{ readonly ContentType: string; readonly ContentID: string }> }
async function mailsTo(address: string): Promise<MailSummary[]> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await response.json()) as { messages: MailSummary[] }).messages;
}
async function mailOf(id: string): Promise<MailDetail> {
  return (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as MailDetail;
}
/** The one mail to `address` whose subject matches, once it is there (the outbox worker runs every 5 s). */
async function waitForMail(address: string, subject: RegExp): Promise<MailDetail> {
  let found: MailSummary | undefined;
  await expect.poll(async () => {
    found = (await mailsTo(address)).find((mail) => subject.test(mail.Subject));
    return found !== undefined;
  }, { timeout: 120_000, intervals: [1_000] }).toBe(true);
  return mailOf(found!.ID);
}

const run = () => `${test.info().project.name}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const toast = (page: Page) => page.locator('.ud-toast').last();
const conferenceSwitch = (page: Page) => page.locator('select[data-confera-conference-switch]');
const rows = (page: Page) => page.getByRole('table', { name: 'Submissions' }).locator('tbody tr');
const pwned = (page: Page) => page.evaluate(() => document.body.dataset.pwned ?? null);
const changeStatus = async (page: Page, action: string) => {
  await page.getByRole('button', { name: 'Change the status' }).click();
  await page.getByRole('menuitem', { name: action }).click();
  return page.getByRole('dialog');
};
async function openTemplate(page: Page, type: string, language: 'English' | 'Serbian', conference = false): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/templates`);
  // With a conference chosen the list is read twice (the organisation's, then the conference's): wait for the second,
  // or a quick click opens the organisation's template (Q4: whose editor then says the conference uses it, even when
  // the conference has its own version, and "Make a version" ends in a 409 shown as "Something went wrong").
  if (conference) await expect(page.getByRole('columnheader', { name: 'From' })).toBeVisible();
  const matching = page.getByRole('table').locator('tbody tr').filter({ hasText: type }).filter({ hasText: language });
  if (conference) await page.waitForLoadState('networkidle');
  await matching.first().getByRole('button').click();
  await expect(page.getByRole('heading', { level: 1, name: type })).toBeVisible();
  await expect(page.locator('[data-confera-template-preview="ready"]')).toBeVisible({ timeout: 30_000 });
}

// A PNG of 3 x 2 pixels.
const PNG = (() => {
  const png = new PNGJS({ width: 3, height: 2 });
  png.data.fill(180);
  return PNGJS.sync.write(png);
})();

/** The hosted form of the seed, filled in English (and sent in Serbian when asked), as an author does. */
async function submitThroughTheForm(page: Page, email: string, title: string, language: 'en' | 'sr'): Promise<string> {
  await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
  const form = page.locator('[data-confera-form][data-hydrated="true"]');
  await form.waitFor({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'With an abstract and a paper' }).check({ force: true });
  await page.getByRole('textbox', { name: 'First name', exact: true }).first().fill('Živana');
  await page.getByRole('textbox', { name: 'Last name', exact: true }).first().fill('Đorđević');
  await page.getByRole('textbox', { name: 'Institution', exact: true }).first().fill('Ekonomski fakultet u Čačku');
  await page.getByLabel('Email address').first().fill(email);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Abstract', exact: true }).fill(`Apstrakt sa slovima ${SERBIAN}.`);
  await page.getByLabel('Keywords').fill('turizam, održivost');
  await page.getByRole('radio', { name: 'Proceedings or selected papers' }).check({ force: true });
  await page.getByRole('radiogroup', { name: /member of UdEkoM Balkans/ }).getByRole('radio', { name: 'No' }).check({ force: true });
  await page.getByRole('radio', { name: 'In person', exact: true }).check({ force: true });
  await page.getByRole('radiogroup', { name: /discount/ }).getByRole('radio', { name: 'No' }).check({ force: true });
  await page.getByRole('radio', { name: 'I do', exact: true }).check({ force: true });
  await page.getByLabel('Your address for the invoice').fill('Izmišljena 1, Beograd');
  await page.getByRole('radio', { name: 'Bank wire (EUR)' }).check({ force: true });
  await page.getByRole('checkbox').check({ force: true });
  if (language === 'sr') await page.getByRole('radio', { name: 'Srpski' }).check({ force: true });
  // Past the minimum fill time of the API (3 s from the token).
  await page.waitForTimeout(3_500);
  await page.getByRole('button', { name: language === 'sr' ? 'Pošalji' : 'Send' }).click();
  await expect(page.locator('[data-confera-thanks]')).toBeVisible({ timeout: 60_000 });
  return (await page.locator('[data-confera-reference]').innerText()).replace(/^.*: /, '').trim();
}

test.describe('M4-QA-01: the "To show" flow through the real API, read back from the mail catcher', () => {
  test('a new submission is taken into processing, returned with the email shown first, accepted; the edited template with an image and a placeholder arrives', async ({ page, browserName }) => {
    test.setTimeout(420_000);
    // One engine, one language: two workers never edit the same template at once.
    const language: 'en' | 'sr' = browserName === 'firefox' ? 'sr' : 'en';
    const languageName = language === 'sr' ? 'Serbian' : 'English';
    const id = run();
    const email = `qa4.${id}@autori.example.test`;
    // No dot in the title: "firefox.abc" reads as a bare domain, and the email leaves such a title out (SA-13).
    const title = `Održivi turizam ${id.replace(/\./g, ' ')}`;
    const marker = `QA4 ${id} ${SERBIAN}`;

    // 1. The author sends the form.
    const reference = await submitThroughTheForm(page, email, title, language);
    expect(reference).toMatch(/^PK27-\d{4}$/);

    // 2. The template "Submission accepted" of this language gets a version of its own for the conference.
    const problems = watchPage(page);
    await signIn(page, undefined, '/templates');
    await conferenceSwitch(page).selectOption({ label: CONFERENCE });
    await openTemplate(page, 'Submission accepted', languageName, true);
    if (await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).isVisible()) {
      await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).click();
      await expect(toast(page)).toContainText('has its own version now');
    }
    await expect(page.getByText(`Only ${CONFERENCE} sends this version.`)).toBeVisible();
    const body = page.locator('[data-confera-template-body] .ProseMirror');
    await body.locator('p').first().click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(`${marker}: `);
    await page.getByLabel('Insert a placeholder').selectOption({ label: 'Title of the submission' });
    await expect(body.locator('[data-confera-placeholder="title"], [data-placeholder="title"]').or(body.getByText('Title of the submission')).first()).toBeVisible();
    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Image' }).click();
    const imageDialog = page.getByRole('dialog', { name: 'Insert an image' });
    await imageDialog.locator('input[type="file"]').setInputFiles({ name: 'logo-čačak.png', mimeType: 'image/png', buffer: PNG });
    await imageDialog.getByLabel('What the image shows').fill('Logo konferencije');
    await imageDialog.getByRole('button', { name: 'Upload and insert' }).click();
    await expect(imageDialog).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Save the template' }).click();
    await expect(toast(page)).toContainText('Template saved');
    // The image is clean once the files worker has asked ClamAV (seconds); the preview then carries it inside,
    // as data. Q4: the open page's preview keeps "still being scanned" until something changes; a reload shows it.
    const frameSrc = () => page.locator('iframe[title="Preview of the message"]').getAttribute('srcdoc');
    await page.waitForTimeout(15_000);
    const stale = (await frameSrc()) ?? '';
    test.info().annotations.push({ type: 'Q4 preview after the scan', description: stale.includes('src="data:image/png;base64,') ? 'refreshed by itself' : 'still without the image 15 s after the scan' });
    await expect.poll(async () => {
      await page.reload();
      await expect(page.locator('[data-confera-template-preview="ready"]')).toBeVisible({ timeout: 30_000 });
      return (await frameSrc()) ?? '';
    }, { timeout: 120_000, intervals: [5_000] }).toContain('src="data:image/png;base64,');

    // 3. The submission: opened (transition 2), returned with the note, corrected, accepted.
    await page.goto(`${ADMIN_ORIGIN}/submissions`);
    await page.getByLabel('Search').first().fill(reference);
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByRole('button').first().click();
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    await expect(toast(page)).toContainText('Taken into processing');

    const note = `Molimo skratite apstrakt na 250 reči. ${SERBIAN}`;
    let dialog = await changeStatus(page, 'Return for revision');
    await dialog.getByLabel('Message for the author').fill(note);
    await dialog.getByRole('button', { name: 'Show the email' }).click();
    // The email is shown before anything changes, in a frame that may run nothing.
    await expect(dialog.locator('iframe[title="The email to the author"]')).toHaveAttribute('sandbox', '');
    await expect(dialog.frameLocator('iframe[title="The email to the author"]').getByText(note)).toBeVisible();
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    await dialog.getByRole('button', { name: 'Send the email and change the status' }).dblclick();
    await expect(page.locator('[data-confera-submission-status="returned_for_revision"]')).toBeVisible();

    dialog = await changeStatus(page, 'Accept');
    await dialog.getByRole('button', { name: 'Change the status' }).click();
    await expect(page.locator('[data-confera-submission-status="accepted"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Emails' }).locator('tbody tr').filter({ hasText: /Returned for revision/ })).toHaveCount(1);
    // Firefox's own notes about preloads and bounce trackers are the browser's, not the application's.
    expect(problems.messages.filter((message) => !/preloaded with link preload|bounce tracker/.test(message))).toEqual([]);

    // 4. The catcher: the note word for word, in the submission's language; the acceptance with the placeholder
    //    filled and the image inside the message.
    const returned = await waitForMail(email, language === 'sr' ? /vraćena na doradu/ : /needs changes/);
    expect(returned.Text).toContain(note);
    expect(returned.Subject).toContain(reference);
    const accepted = await waitForMail(email, language === 'sr' ? /prihvaćena/ : /accepted/);
    expect(accepted.Text).toContain(`${marker}: ${title}`);
    // Every image an inline part (a rerun's conference version may hold an image of an earlier run too).
    expect(accepted.Inline.length).toBeGreaterThanOrEqual(1);
    expect(accepted.Inline.every((part) => part.ContentType === 'image/png')).toBe(true);
    expect(accepted.HTML).toMatch(/src="cid:[^"]+"/);
    expect(accepted.HTML).not.toMatch(/src="(https?:)?\/\//);
    // A double click on "Send" was one change and one email.
    expect((await mailsTo(email)).filter((mail) => (language === 'sr' ? /vraćena na doradu/ : /needs changes/).test(mail.Subject))).toHaveLength(1);

    // The conference gives its own version up again (the fallback of ADR-12).
    await page.goto(`${ADMIN_ORIGIN}/templates`);
    await conferenceSwitch(page).selectOption({ label: CONFERENCE });
    await openTemplate(page, 'Submission accepted', languageName, true);
    await page.getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await expect(toast(page)).toContainText('uses the organisation’s template again');
  });
});

test.describe('M4-QA-01 edge cases through the real API', () => {
  test('the table finds Živana Đorđević as people type her name without diacritics', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough for a search');
    await signIn(page, undefined, '/submissions?status=new,open,returned_for_revision,accepted,rejected,withdrawn');
    const search = page.getByLabel('Search').first();
    const found: Record<string, number> = {};
    for (const query of ['djordjevic', 'Đorđević', 'zivana', 'zivana dordevic', 'dordevic']) {
      await search.fill(query);
      await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(query).replace(/%20/g, '\\+')}`));
      await page.waitForLoadState('networkidle');
      found[query] = await rows(page).filter({ hasText: 'Đorđević' }).count();
    }
    // The web application's own README promises the last two ("zivana dordevic" finds "Živana Đorđević").
    expect(Object.fromEntries(Object.entries(found).map(([query, n]) => [query, n > 0]))).toEqual({
      djordjevic: true,
      Đorđević: true,
      zivana: true,
      'zivana dordevic': true,
      dordevic: true,
    });
  });

  test('a template with hostile strings runs nothing in the editor, the server’s preview or the mail log (ST-59, ST-28)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the same pages as the To-show flow; once is enough');
    test.setTimeout(240_000);
    await signIn(page, undefined, '/templates');
    await conferenceSwitch(page).selectOption({ label: CONFERENCE });
    await openTemplate(page, 'Submission rejected', 'English', true);
    if (await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).isVisible()) {
      await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).click();
      await expect(toast(page)).toContainText('has its own version now');
    }
    const hostile = [
      '<script>parent.document.body.dataset.pwned="editor"</script>',
      '<img src=x onerror="parent.document.body.dataset.pwned=1">',
      '"><svg onload=alert(1)>',
      '{{constructor}} {{#each}} ${7*7} javascript:alert(1)',
    ].join(' ');
    const body = page.locator('[data-confera-template-body] .ProseMirror');
    await body.locator('p').first().click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(hostile);
    await page.getByRole('button', { name: 'Save the template' }).click();
    await expect(toast(page)).toContainText('Template saved');
    await page.reload();
    await expect(page.locator('[data-confera-template-preview="ready"]')).toBeVisible({ timeout: 30_000 });
    await expect(body).toContainText('<script>parent.document.body.dataset.pwned="editor"</script>');
    expect(await body.locator('script, img:not(.ProseMirror-separator), svg, iframe, [onerror], [onload]').count()).toBe(0);
    const srcdoc = (await page.locator('iframe[title="Preview of the message"]').getAttribute('srcdoc')) ?? '';
    expect(srcdoc).toContain('&lt;script&gt;');
    expect(srcdoc).not.toMatch(/<script|<img src=x|<svg onload/i);
    await expect(page.locator('iframe[title="Preview of the message"]')).toHaveAttribute('sandbox', '');
    expect(await pwned(page)).toBeNull();

    // Through a rejection to an author, then in the mail log.
    const id = run();
    const email = `qa4h.${id}@autori.example.test`;
    const reference = await submitThroughTheForm(page, email, `Hostile ${id}`, 'en');
    await page.goto(`${ADMIN_ORIGIN}/submissions?q=${encodeURIComponent(reference)}`);
    await rows(page).first().getByRole('button').first().click();
    await expect(page.locator('[data-confera-submission-status="open"]')).toBeVisible();
    const dialog = await changeStatus(page, 'Reject');
    await dialog.getByRole('button', { name: 'Change the status' }).click();
    await expect(page.locator('[data-confera-submission-status="rejected"]')).toBeVisible();
    const mail = await waitForMail(email, /^Decision on your submission/);
    expect(mail.HTML).not.toMatch(/<script|<img src=x|<svg/i);
    expect(mail.HTML).toContain('&lt;script&gt;');
    await page.goto(`${ADMIN_ORIGIN}/mail-log`);
    await page.getByRole('table', { name: 'Mail log' }).locator('tbody tr').filter({ hasText: email }).filter({ hasText: /rejected/i }).first().getByRole('button').click();
    await expect(page.locator('iframe[title="Email body"]')).toHaveAttribute('sandbox', '');
    await expect(page.locator('[data-confera-plain-body]')).toContainText('<script>');
    expect(await pwned(page)).toBeNull();

    await page.goto(`${ADMIN_ORIGIN}/templates`);
    await conferenceSwitch(page).selectOption({ label: CONFERENCE });
    await openTemplate(page, 'Submission rejected', 'English', true);
    await page.getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await expect(toast(page)).toContainText('uses the organisation’s template again');
  });

  test('pasted: a remote image and an embedded one are dropped, an image file is uploaded after its words, a very large paste leaves the page responsive', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the clipboard of the page is written through the permissions of Chromium');
    test.setTimeout(180_000);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ADMIN_ORIGIN });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(ADMIN_ORIGIN) && !request.url().startsWith('data:')) requests.push(request.url());
    });
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission back in processing', 'English');
    const body = page.locator('[data-confera-template-body] .ProseMirror');
    await body.locator('p').first().click();
    await page.evaluate(async () => {
      const html = '<p><b>Podebljano</b> <img src="https://tracker.example.test/pixel.gif"> <img src="data:image/png;base64,iVBORw0KGgo="> <a href="javascript:alert(1)">veza</a></p>';
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['Podebljano veza'], { type: 'text/plain' }) })]);
    });
    await page.keyboard.press('ControlOrMeta+V');
    await expect(toast(page)).toContainText('Images from a web page are not taken over');
    expect(await body.locator('img:not(.ProseMirror-separator)').count()).toBe(0);
    expect(await body.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(requests.filter((url) => url.includes('tracker.example.test'))).toEqual([]);

    // A very large paste: 3,000 paragraphs of Serbian text (about 400 KB of HTML).
    await page.evaluate(async (letters) => {
      const html = Array.from({ length: 3_000 }, (_, n) => `<p>Pasus ${n} ${letters} <b>podebljano</b> <i>kurziv</i> tekst tekst tekst tekst tekst tekst tekst tekst tekst tekst</p>`).join('');
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['x'], { type: 'text/plain' }) })]);
    }, SERBIAN);
    const started = Date.now();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(body).toContainText('Pasus 2999', { timeout: 30_000 });
    const pasteMs = Date.now() - started;
    // The page still answers, and the server's check says the email would be too large rather than failing silently.
    const ping = await page.evaluate(() => new Promise<number>((resolve) => { const t = performance.now(); requestAnimationFrame(() => resolve(performance.now() - t)); }));
    expect(ping).toBeLessThan(1_000);
    expect(pasteMs).toBeLessThan(30_000);
    await page.getByRole('button', { name: 'Save the template' }).click();
    await expect(page.getByText(/larger than (100|200) KB/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('images built to hurt a decoder: each is refused with words the office understands, an animated GIF is taken', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the server decides; once is enough');
    test.setTimeout(120_000);
    const gif = (frames: number): Buffer => {
      const parts = [Buffer.from('GIF89a', 'latin1'), Buffer.from([20, 0, 10, 0, 0x80, 0, 0]), Buffer.from([0, 0, 0, 255, 255, 255])];
      for (let n = 0; n < frames; n += 1) parts.push(Buffer.from([0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0]));
      parts.push(Buffer.from([0x3b]));
      return Buffer.concat(parts);
    };
    // A PNG header claiming 30,000 x 30,000 pixels: a pixel bomb.
    const bomb = Buffer.from(PNG);
    bomb.writeUInt32BE(30_000, 16);
    bomb.writeUInt32BE(30_000, 20);
    const broken = PNG.subarray(0, 40);
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission back in processing', 'English');
    await page.locator('[data-confera-template-body] .ProseMirror p').first().click();
    const cases: ReadonlyArray<readonly [string, Buffer, string, RegExp | null]> = [
      ['bomb.png', bomb, 'image/png', /too many pixels/],
      ['broken.png', broken, 'image/png', /cannot be read/],
      ['animated.gif', gif(3), 'image/gif', null],
    ];
    for (const [name, buffer, mimeType, refusal] of cases) {
      await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Image' }).click();
      const dialog = page.getByRole('dialog', { name: 'Insert an image' });
      await dialog.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
      await dialog.getByLabel('What the image shows').fill(name);
      const started = Date.now();
      await dialog.getByRole('button', { name: 'Upload and insert' }).click();
      if (refusal === null) await expect(dialog).toBeHidden({ timeout: 15_000 });
      else {
        await expect(dialog).toContainText(refusal, { timeout: 15_000 });
        await dialog.getByRole('button', { name: 'Cancel' }).click();
      }
      expect(Date.now() - started, name).toBeLessThan(15_000);
    }
  });

  test('the organisation’s template does not say the chosen conference uses it when the conference has its own version', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough');
    await signIn(page, undefined, '/templates');
    await conferenceSwitch(page).selectOption({ label: CONFERENCE });
    await openTemplate(page, 'Submission back in processing', 'English', true);
    if (await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).isVisible()) {
      await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).click();
      await expect(toast(page)).toContainText('has its own version now');
    }
    await expect(page.getByText(`Only ${CONFERENCE} sends this version.`)).toBeVisible();
    // The organisation's template of the same type and language, opened by its address with the conference still chosen.
    const listed = await page.request.get(`${ADMIN_ORIGIN}/api/v1/mail-templates?type=submission_resumed&language=en`, { headers: { Accept: 'application/json' } });
    const organisations = ((await listed.json()) as { items: { id: string; conferenceId: string | null }[] }).items.find((item) => item.conferenceId === null);
    await page.goto(`${ADMIN_ORIGIN}/templates/${organisations!.id}`);
    await expect(page.locator('[data-confera-template-preview="ready"]')).toBeVisible({ timeout: 30_000 });
    const claim = page.getByText(`${CONFERENCE} uses the organisation’s template`);
    const claimed = await claim.isVisible();
    let makeVersion = 'not offered';
    if (await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).isVisible()) {
      await page.getByRole('button', { name: `Make a version for ${CONFERENCE}` }).click();
      await expect(page.getByRole('alert').filter({ hasText: /Something went wrong|already|own version/ }).or(toast(page)).first()).toBeVisible();
      makeVersion = (await page.getByRole('alert').filter({ hasText: /Something went wrong/ }).count()) > 0 ? 'Something went wrong (409)' : 'answered';
    }
    // Clean up: the conference gives its version up again.
    await openTemplate(page, 'Submission back in processing', 'English', true);
    await page.getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Use the organisation’s template again' }).click();
    await expect(toast(page)).toContainText('uses the organisation’s template again');
    expect({ claimsTheConferenceUsesIt: claimed, makeVersion }).toEqual({ claimsTheConferenceUsesIt: false, makeVersion: 'not offered' });
  });

  test('a placeholder inserted from the catalogue is still in the document after an image is inserted next to it', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission back in processing', 'Serbian');
    const body = page.locator('[data-confera-template-body] .ProseMirror');
    const chips = body.locator('[data-placeholder="title"]');
    const before = await chips.count();
    await body.locator('p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Naslov: ');
    await page.getByLabel('Insert a placeholder').selectOption({ label: 'Title of the submission' });
    await expect(chips).toHaveCount(before + 1);
    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Image' }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert an image' });
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await dialog.getByLabel('What the image shows').fill('Logo');
    await dialog.getByRole('button', { name: 'Upload and insert' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(body.locator('figure[data-confera-image] img').last()).toBeVisible();
    // The image goes next to the placeholder; it does not take its place.
    await expect(chips).toHaveCount(before + 1);
  });

  test('the preview shows an uploaded image once it is clean, without a reload', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough');
    test.setTimeout(120_000);
    await signIn(page, undefined, '/templates');
    await openTemplate(page, 'Submission back in processing', 'English');
    await page.locator('[data-confera-template-body] .ProseMirror p').last().click();
    await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Image' }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert an image' });
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await dialog.getByLabel('What the image shows').fill('Logo');
    await dialog.getByRole('button', { name: 'Upload and insert' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    // The files worker of the API scans within seconds (JOBS_INTERVAL_SECONDS); the page is told nothing.
    await expect(page.getByText('An image is still being scanned', { exact: false })).toBeVisible();
    await expect.poll(async () => (await page.locator('iframe[title="Preview of the message"]').getAttribute('srcdoc')) ?? '', { timeout: 60_000, intervals: [2_000] }).toContain('src="data:image/png;base64,');
  });

  test('a developer instance shows no staging banner, on the sign-in page and behind it', async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}/sign-in`);
    expect(await page.locator('[data-confera-staging]').count()).toBe(0);
    await signIn(page, undefined, '/submissions');
    expect(await page.locator('[data-confera-staging]').count()).toBe(0);
    await page.goto(`${PUBLIC_ORIGIN}/f/${SLUG}`);
    expect(await page.locator('[data-confera-staging]').count()).toBe(0);
  });
});
