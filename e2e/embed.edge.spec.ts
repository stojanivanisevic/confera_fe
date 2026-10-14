// Edge cases of the embed found by the edge-case hunter (M1-REV-01), on the same hostile
// harness site as e2e/embed.spec.ts (M1-FE-04: "the height follows the content").
//
// Conference sites are mostly WordPress. Two things such sites do to pasted code, every
// day, and that the hostile page of embed.spec.ts does not do:
//  1. They DELAY inline scripts: speed plugins (WP Rocket's "delay JavaScript execution",
//     and the like) turn every <script> into an inert one and run it at the first
//     interaction of the visitor. The frame has long loaded and reported its height by
//     then; it reports again only when its content changes size, so the height of a frame
//     whose listener came late does not follow its content.
//  2. They HOLD BACK third-party frames until consent (consent managers block unknown
//     frames by default) and insert them later, as a new element. The inline lines looked
//     for the frame once, found nothing, and never listen.
// In both cases the frame keeps the fixed height of the snippet for the life of the page:
// on a phone the form scrolls inside a frame inside a page. The snippet cannot be
// repaired afterwards without every site pasting it again (G2-17).
//
// 3. An iframe inside an iframe: the snippet on a page of a listed site that is itself
//    framed by a page of that site. frame-ancestors checks every ancestor; all are listed.
import type { Frame, Page } from '@playwright/test';

import { buildEmbedSnippet, frameId } from '../packages/embed-loader/src/index';
import { HARNESS_ORIGIN, PUBLIC_ORIGIN } from './env';
import { expect, test } from './support/fixtures';

const SLUG = 'spike-abstract';
const FRAME = `#${frameId(SLUG)}`;
const SNIPPET = buildEmbedSnippet({ publicOrigin: PUBLIC_ORIGIN, slug: SLUG, title: 'Abstract submission', linkText: 'Open the form in a new page' });
const FIXED_HEIGHT = 900;

const siteUrl = (paste: string) => `${HARNESS_ORIGIN}/hostile.html?paste=${Buffer.from(paste, 'utf8').toString('base64url')}`;

async function formFrame(page: Page | Frame): Promise<Frame> {
  const locator = page.locator(FRAME);
  await locator.scrollIntoViewIfNeeded();
  const frame = await (await locator.elementHandle())?.contentFrame();
  if (!frame) throw new Error('The frame of the form has no document');
  await frame.locator('[data-confera-form][data-hydrated="true"]').waitFor();
  await frame.evaluate(() => document.fonts.ready);
  return frame;
}

const contentHeight = (frame: Frame) => frame.locator('[data-confera-embed-root]').evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
const elementHeight = (page: Page | Frame) => page.locator(FRAME).evaluate((el) => el.getBoundingClientRect().height);

/** The frame has told its parent its height at least once. */
async function frameHasReported(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __received: Array<{ fromFrame: boolean }> }).__received.filter((m) => m.fromFrame).length))
    .toBeGreaterThan(0);
}

/** Three more authors: the form grows well past the fixed height of the snippet, so a frame that does not follow is plain to see. */
async function addAuthors(frame: Frame): Promise<void> {
  for (let i = 0; i < 3; i += 1) await frame.getByRole('button', { name: 'Add author' }).click();
  await expect.poll(() => contentHeight(frame), { message: 'the form grew well past the fixed height' }).toBeGreaterThan(FIXED_HEIGHT + 100);
}

async function expectHeightFollows(page: Page | Frame, frame: Frame): Promise<void> {
  await expect
    .poll(async () => Math.abs((await elementHeight(page)) - (await contentHeight(frame))), { message: 'the frame is as tall as its content' })
    .toBeLessThanOrEqual(1);
}

test.describe('edge cases of the embed (M1-REV-01)', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('a site that delays inline scripts: the height follows once the inline lines run', async ({ page }) => {
    // What a speed plugin makes of the pasted script: inert until the visitor first interacts.
    const delayed = SNIPPET.replace('<script>', '<script type="text/x-delayed" data-delayed>');
    await page.goto(siteUrl(delayed));
    const frame = await formFrame(page);
    await frameHasReported(page);
    // The visitor adds authors inside the frame. That is no interaction with the site's own
    // page, so the plugin still holds the script; the frame reports the new height to nobody.
    await addAuthors(frame);
    await page.waitForTimeout(500);

    // The first interaction: the plugin runs the held script, as it does, from its text.
    await page.evaluate(() => {
      const held = document.querySelector('script[data-delayed]')!;
      const script = document.createElement('script');
      script.textContent = held.textContent;
      document.body.appendChild(script);
    });

    await expectHeightFollows(page, frame);
  });

  test('a consent manager that inserts the frame later: the height follows', async ({ page }) => {
    // The frame is held back in a template; the inline lines run where they were pasted.
    const held = SNIPPET.replace(/(<iframe[\s\S]*?<\/iframe>)/, '<template id="held-frame">$1</template><div id="consent-placeholder">Accept cookies to see this content</div>');
    await page.goto(siteUrl(held));
    await page.waitForTimeout(300);

    // Consent given: the manager puts the frame in place of its placeholder.
    await page.evaluate(() => {
      const template = document.getElementById('held-frame') as HTMLTemplateElement;
      document.getElementById('consent-placeholder')!.replaceWith(template.content.cloneNode(true));
    });
    const frame = await formFrame(page);
    await addAuthors(frame);

    await expectHeightFollows(page, frame);
  });

  test('an iframe inside an iframe of the listed site: the form is shown and its height follows', async ({ page }) => {
    const outer = `<iframe id="site-frame" title="a page of the site" src="${siteUrl(SNIPPET)}" style="display:block!important;width:100%!important;max-width:none!important;height:3000px!important;max-height:none!important;visibility:visible!important;opacity:1!important"></iframe>`;
    await page.goto(siteUrl(outer));
    const sitePage = await (await page.locator('#site-frame').elementHandle())?.contentFrame();
    if (!sitePage) throw new Error('The page of the site has no document');
    const frame = await formFrame(sitePage);
    await expectHeightFollows(sitePage, frame);
  });
});
