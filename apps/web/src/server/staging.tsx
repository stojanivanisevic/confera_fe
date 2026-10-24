/**
 * The staging banner (M4-OPS-02: every screen of the staging instance says that it is one). The
 * API names its instance in GET /api/v1/meta (`instance`: `staging`, `production`, or null on a
 * developer machine). The web application's own STAGE does not decide it alone: the staging server
 * runs the production build.
 *
 * It fails closed (SEC-M4-06): the banner shows unless the API has confirmed an instance that is
 * not staging. Confirmed are `production`, and null (a developer machine's API) while this web
 * application itself runs on a developer stage (local, dev, test); a production build must hear
 * `production`. An answer that is late (over 2 s), refused, unreadable or names anything else
 * shows the banner. A slow moment does not undo a confirmation at once: an answer confirmed in
 * the last 10 minutes still counts while the API does not answer (tests: staging.test.tsx).
 *
 * It is not dismissible. Inside the frame of a conference site it sits inside the part whose
 * height the frame reports (EmbeddedForm's `banner`), so the height logic is unchanged. In the
 * admin shell a mark in the sticky top bar keeps saying it after the banner scrolled away (UX4-27).
 */
import { getConfig, type Stage } from '@/config/env';

import { forwardToApi } from './forward';

/** A confirmed answer is used for a minute, then the API is asked again. */
const KEEP_MS = 60_000;
/** While the API does not answer, a confirmation this young still counts. */
const STALE_MS = 10 * 60_000;
/** An unconfirmed answer is asked again this soon (no 2 s wait on every page while the API is away). */
const RETRY_MS = 10_000;
const TIMEOUT_MS = 2_000;

/** What an answer of GET /api/v1/meta says of this instance. */
export type InstanceAnswer = 'staging' | 'not-staging' | 'unknown';

let kept: { readonly at: number; readonly answer: InstanceAnswer } | null = null;
let confirmed: { readonly at: number } | null = null;

/** Whether an answer of GET /api/v1/meta names staging, confirms another instance, or says nothing sure. */
export function instanceOf(meta: unknown, stage: Stage): InstanceAnswer {
  if (typeof meta !== 'object' || meta === null) return 'unknown';
  const { instance, stage: apiStage } = meta as { instance?: unknown; stage?: unknown };
  if (instance === 'staging' || (instance === undefined && apiStage === 'staging')) return 'staging';
  if (instance === 'production') return 'not-staging';
  // The API of a developer machine names no instance; it confirms only to a web application on a developer stage.
  if (instance === null && stage !== 'prod') return 'not-staging';
  return 'unknown';
}

async function askApi(): Promise<InstanceAnswer> {
  const config = getConfig();
  try {
    const response = await forwardToApi({
      apiOrigin: config.apiOrigin,
      pathAndQuery: '/api/v1/meta',
      method: 'GET',
      headers: new Headers({ host: config.adminHost, accept: 'application/json' }),
      body: null,
      surface: 'admin',
      timeoutMs: TIMEOUT_MS,
    });
    if (!response.ok) return 'unknown';
    const text = await response.text();
    return text.length < 10_000 ? instanceOf(JSON.parse(text) as unknown, config.stage) : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Whether every screen shows the banner: yes, unless the API confirmed an instance that is not staging. */
export async function isStaging(now: number = Date.now()): Promise<boolean> {
  if (kept && now - kept.at < (kept.answer === 'unknown' ? RETRY_MS : KEEP_MS)) return showFor(kept.answer, now);
  const answer = await askApi();
  kept = { at: now, answer };
  if (answer === 'not-staging') confirmed = { at: now };
  if (answer === 'staging') confirmed = null;
  return showFor(answer, now);
}

function showFor(answer: InstanceAnswer, now: number): boolean {
  if (answer === 'not-staging') return false;
  if (answer === 'staging') return true;
  // Unsure: a recent confirmation still counts; without one the banner shows.
  return !(confirmed && now - confirmed.at < STALE_MS);
}

/**
 * The banner itself, in both languages of Confera, with nothing to close. Above a page it is a
 * landmark of its own; inside the page's `main` (a form, a frame, not found) it is a note there.
 */
export function StagingNotice({ inside = false }: { readonly inside?: boolean }) {
  const words = (
    <>
      <strong lang="en">Staging — test data only</strong>
      <span aria-hidden="true"> · </span>
      <strong lang="sr">Probno okruženje — samo probni podaci</strong>
    </>
  );
  return inside ? (
    <p className="confera-staging" role="note" data-confera-staging="">
      {words}
    </p>
  ) : (
    <aside className="confera-staging" aria-label="Staging" data-confera-staging="">
      {words}
    </aside>
  );
}

/** The banner unless the API confirmed another instance. */
export async function StagingBanner({ inside = false }: { readonly inside?: boolean }) {
  return (await isStaging()) ? <StagingNotice inside={inside} /> : null;
}
