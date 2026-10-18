/**
 * The staging banner (M4-OPS-02: every screen of the staging instance says that it is one). The
 * API names its stage in GET /api/v1/meta (`stage`); only the exact value `staging` shows the
 * banner. Production names another stage, so there the banner never renders, and so does every
 * answer that is missing, late or cannot be read (tests/staging-banner.test.tsx). The web
 * application's own STAGE does not decide it: the staging server runs the production build.
 *
 * It is not dismissible. Inside the frame of a conference site it sits inside the part whose
 * height the frame reports (EmbeddedForm's `banner`), so the height logic is unchanged.
 */
import { getConfig } from '@/config/env';

import { forwardToApi } from './forward';

/** The API is asked once a minute at most; the answer is the same for every request. */
const KEEP_MS = 60_000;
const TIMEOUT_MS = 2_000;

let kept: { readonly at: number; readonly staging: boolean } | null = null;

/** Whether an answer of GET /api/v1/meta names the staging stage. Anything else is not staging. */
export function namesStaging(meta: unknown): boolean {
  return typeof meta === 'object' && meta !== null && (meta as { stage?: unknown }).stage === 'staging';
}

async function askApi(): Promise<boolean> {
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
    if (!response.ok) return false;
    const text = await response.text();
    return text.length < 10_000 && namesStaging(JSON.parse(text) as unknown);
  } catch {
    return false;
  }
}

/** Whether this instance is the staging one, as its API says. */
export async function isStaging(now: number = Date.now()): Promise<boolean> {
  if (kept && now - kept.at < KEEP_MS) return kept.staging;
  const staging = await askApi();
  kept = { at: now, staging };
  return staging;
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

/** The banner when the API says staging, else nothing. */
export async function StagingBanner({ inside = false }: { readonly inside?: boolean }) {
  return (await isStaging()) ? <StagingNotice inside={inside} /> : null;
}
