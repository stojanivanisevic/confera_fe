// Which ways of starting the browser tests are refused, and why.
//
// The tests get their browser from e2e/support/fixtures.ts, which starts Chromium on an
// isolated profile (e2e/support/os-isolation.ts tells the story: on Windows the full
// Chromium build tries to log on to the developer's account when its profile is empty).
//
// Playwright can also open windows OF ITS OWN: the UI mode (`--ui`), the inspector
// (`--debug`, PWDEBUG, a pause in a spec), the trace viewer (`show-trace`) and the recorder
// (`codegen`, `open`). Each of them is a Chromium that Playwright starts by itself, on a new,
// empty profile, before and outside any fixture (playwright-core, `launchApp`, which asks
// for a persistent context with an empty profile directory). The fixture cannot protect what
// it does not start, so
// `pnpm e2e` and `pnpm ds:visual` refuse the switches that open such a window, and
// tests/os-isolation-paths.test.ts keeps the rest out of the repository.
//
// To look at a failed test: open playwright-report/index.html in your own browser; the
// trace of every failed test is inside the report.

/** Switches of `playwright test` that open a window of Playwright's own. */
const OWN_WINDOW_SWITCHES = /^--(?:ui|ui-host|ui-port|debug)(?:=|$)/;

/**
 * The reason to refuse a run of the browser tests, or null when it may start.
 * @param {readonly string[]} args arguments passed on to `playwright test`
 * @param {Readonly<Record<string, string | undefined>>} env the environment of the run
 * @returns {string | null}
 */
export function refusedBrowserWindow(args, env) {
  const flag = args.find((arg) => OWN_WINDOW_SWITCHES.test(arg));
  if (flag) {
    return `"${flag.split('=')[0]}" opens a window of Playwright's own: a Chromium that starts outside the isolated profile of the tests (README, "Browser tests"). Open playwright-report/index.html in your own browser instead.`;
  }
  const debug = env.PWDEBUG;
  if (debug !== undefined && debug !== '' && debug !== '0') {
    return 'PWDEBUG is set: it opens the inspector, a Chromium that starts outside the isolated profile of the tests (README, "Browser tests"). Unset it.';
  }
  return null;
}
