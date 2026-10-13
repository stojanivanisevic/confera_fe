// The cross-repo smoke test (M1-QA-02): the browser tests in front of a real confera_be.
//
// The real API is not started from here. It is started by the documented commands of
// confera_be (its README, section 9) and named by CONFERA_E2E_API_ORIGIN (../env.ts).
// Before any test runs, this module asks it whether it is there and ready, so that a
// forgotten step shows as one clear message and not as dozens of failed tests.
import { REAL_API_ORIGIN } from '../env';

const READY_PATH = '/health/ready';
const WAIT_MS = 5_000;

export const HOW_TO_START =
  'Start confera_be as its README says (section 9): corepack pnpm stack:up, db:provision, db:migrate, seed:e2e, build, start. Then run the browser tests again.';

/** What the readiness address answered: the status and the body, or the reason nothing came back. */
export async function askRealApi(origin: string, fetcher: typeof fetch = fetch): Promise<{ status: number; body: unknown } | { failure: string }> {
  try {
    const response = await fetcher(`${origin}${READY_PATH}`, { signal: AbortSignal.timeout(WAIT_MS), redirect: 'error', headers: { accept: 'application/json' } });
    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) as unknown };
    } catch {
      return { status: response.status, body: text.slice(0, 200) };
    }
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : '';
    return { failure: `${error instanceof Error ? error.message : String(error)}${cause}` };
  }
}

/** Stops the run when a real API was named and it is not ready. Does nothing in a run against the stub. */
export async function assertRealApiReady(origin: string | null = REAL_API_ORIGIN, fetcher: typeof fetch = fetch): Promise<void> {
  if (origin === null) return;
  const answer = await askRealApi(origin, fetcher);
  if ('failure' in answer) {
    throw new Error(`CONFERA_E2E_API_ORIGIN names ${origin}, but nothing answers at ${origin}${READY_PATH} (${answer.failure}). ${HOW_TO_START}`);
  }
  const ready = answer.status === 200 && typeof answer.body === 'object' && answer.body !== null && (answer.body as { status?: unknown }).status === 'ok';
  if (!ready) {
    throw new Error(
      `CONFERA_E2E_API_ORIGIN names ${origin}, but ${origin}${READY_PATH} answered ${String(answer.status)} ${JSON.stringify(answer.body)} and not 200 {"status":"ok"}: that is not a confera_be whose database answers. ${HOW_TO_START}`,
    );
  }
  console.log(`The browser tests run against the real API at ${origin} (cross-repo smoke test).`);
}
