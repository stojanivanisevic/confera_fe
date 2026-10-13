# confera_fe

The web application of **Confera**, the conference and membership application of UdEkoM Balkans: the admin application, and the public forms that are shown as pages of their own or inside the association's conference sites. The API is in the sibling repository `confera_be`.

This is release **0.1.0** (foundations): the toolchain, design system version 2 with its adapter, the embed and the security headers proven by tests. There are no accounts and no real forms yet.

Everything here runs on Windows, macOS and Linux. Commands are written for PowerShell or any other shell.

## 1. What you need

| Tool | Version | Note |
|---|---|---|
| Node.js | 22.13 or newer in the 22 line (developed on 22.14; `.nvmrc`) | Node 24 is not supported yet |
| corepack | the one that comes with Node (0.31) | it provides pnpm; **do not install pnpm yourself** |
| git | any recent | |
| Docker | not needed for this repository | `confera_be` needs it |

pnpm is **11.28.2**, pinned in `package.json`. Every command is `corepack pnpm …`. (`corepack enable` would let you type `pnpm` alone, but it needs administrator rights on Windows and is not required.) The first `corepack pnpm` command downloads pnpm once and may ask you to confirm with `Y`.

## 2. First start

```
git clone https://github.com/stojanivanisevic/confera_fe.git
cd confera_fe
corepack pnpm install
```

`install` never changes the lockfile. Then create your local settings (there is no secret in them) and run every check:

```
Copy-Item .env.example .env        # PowerShell;  cp .env.example .env  elsewhere
corepack pnpm check
```

`check` takes four to six minutes and ends with `✓ pnpm check passed`. Now start the application:

```
corepack pnpm dev
```

| Address | What you see |
|---|---|
| http://localhost:3000/ | the admin home. It asks the API for its name and version; without `confera_be` running it says "The API does not answer" |
| http://localhost:3000/sign-in | the sign-in page (the form arrives with 0.2.0) |
| http://127.0.0.1:3000/f/spike-abstract | the hosted form of the 0.1.0 spike |
| http://127.0.0.1:3000/dev/gallery | the component gallery of design system v2 |

Stop it with `Ctrl+C`. To see the admin home talk to the real API, start `confera_be` first (its README, "First start"); it listens on port 3001, where `.env` already points.

`corepack pnpm build` and `corepack pnpm start` run the production build. It does not contain the gallery or the spike form (section 9).

## 3. Two host names

Confera has two surfaces, each on its own host name (ADR-02), and the application itself refuses a route on the wrong one. On a developer machine the two names are, as in `confera_be`:

| Surface | Host name | Routes |
|---|---|---|
| admin | `localhost` | `/`, `/sign-in`, `/api/v1/…` |
| public | `127.0.0.1` | `/f/[form]`, `/embed/[form]`, `/s/[token]`, `/pay/[token]`, `/public/v1/…` |

So http://localhost:3000/f/spike-abstract and http://127.0.0.1:3000/sign-in answer "not found". That is intended.

`/api/v1` and `/public/v1` are forwarded to the API **with the browser's `Host` header unchanged**: the API reads the surface from that header and ignores `X-Forwarded-Host`. This is why the forward is our own code (`apps/web/src/server/forward.ts`) and not a rewrite of the framework, which replaces the header.

## 4. Commands

| Command | What it does |
|---|---|
| `corepack pnpm check` | everything below except the browser tests; must be green before a push |
| `corepack pnpm lint` | ESLint (type-checked) and the style lint |
| `corepack pnpm typecheck` | TypeScript, every package |
| `corepack pnpm test` | unit tests (Vitest) |
| `corepack pnpm build` / `start` | the production build, and serving it |
| `corepack pnpm verify:build` | the production build has only the declared routes, no dev-only text, no public source map |
| `corepack pnpm secrets` | secret scan: credentials by format (secretlint) and values assigned to names like a secret |
| `corepack pnpm test:supply-chain` | plants a fake secret, a vulnerable package and an unlisted build script in a copy under `.artifacts/` and expects each to be caught; the last step of `check` |
| `corepack pnpm dev` | the development server, with the gallery and the spike form |
| `corepack pnpm e2e:install` | downloads the three browser engines, once |
| `corepack pnpm e2e` | browser tests on Chromium, Firefox and WebKit (section 6) |
| `corepack pnpm ds:check` | the design system and its adapter are intact (section 7) |
| `corepack pnpm ds:visual` | pictures of every component in v1 and v2, for review |
| `corepack pnpm api:sync` / `api:check` | the API contract (section 8) |

## 5. Layout

```
apps/web                 the Next 16 application (App Router)
  src/proxy.ts           host separation, security headers, forward to the API: one place
  src/config/env.ts      the only file that reads the environment
  src/server/security    route kinds (routes.json), headers, the site list of a frame
packages/ui              the adapter around the design system; application code imports only this
packages/form-renderer   forms as authors see them (0.1.0: the spike form, the store its fields are read through, draft storage)
packages/embed-loader    the snippet for conference sites and the frame's height reporter
packages/api-client      the vendored API contract, generated types, typed calls
design-system            UdEkoM Balkans design system, version 2 (its own README and CHANGELOG)
scripts                  the commands above, as Node scripts
tests                    unit tests that span packages
e2e                      browser tests, the harness site, the API stub
lint-fixtures            planted violations that the lint must keep catching
```

## 6. Browser tests

```
corepack pnpm e2e:install
corepack pnpm e2e
```

The run takes about eight minutes and needs the ports **3000, 3100, 3101, 4000 and 4001** free (stop `pnpm dev` first). It builds a test build, starts it, starts the application once more in development mode, a harness "conference site" and an API stub, and stops them all at the end.

- **Three engines**, each with third-party cookies blocked; one test proves the blocking is in effect.
- **Tests that do not run in every engine**, each for a stated reason: the start-up guard (`config-guard`) and the Host-header requests (`qa-hosts`) involve no browser and run in the Chromium project only; the 16 px touch test needs pointer emulation, which only Chromium has (its stylesheet rule is held by a unit test). Nothing else is skipped.
- **`e2e/qa-probes.spec.ts`** looks where the acceptance list does not: 320 px, 200 % and 400 % zoom, a conference site that keeps resizing or forges height messages, storage that throws, the form components by keyboard only, reduced motion.
- **On a loaded machine** the WebKit accessibility scans can pass the 60 s limit of a test. Run the failed file again alone before believing it: `corepack pnpm e2e --project=webkit --workers=1 e2e/pages.spec.ts`.
- **The harness** (`e2e/harness/hostile.html`) is a site with hostile CSS and a hostile script on `localhost:4000`; the public surface is `127.0.0.1:3000`, another site, so the form's frame is a real third-party frame.
- **The API stub** (`e2e/servers/harness.mjs`) answers `GET /api/v1/meta` and reads the surface from the `Host` header as `confera_be` does.
- Chromium runs as the full browser in its new headless mode (`channel: 'chromium'`), so the separate "headless shell" download is not needed.
- **Chromium never starts on the profile the test runner would make for it.** On a Windows machine that is not in a domain, the full Chromium build tries an interactive logon with an empty password to learn whether the account has one, once per empty profile. Each try is a failed logon (Security event 4625, logon type 2, process `chrome.exe`), and a run starts enough browsers to lock the account (event 4740). So:
  - `e2e/support/fixtures.ts` starts Chromium on an isolated profile of our own whose `Local State` already holds that answer, with the password manager, sign-in before filling and autofill switched off, and gives every page a virtual WebAuthn authenticator. Take `test` from that file in every spec; `tests/os-isolation.test.ts` fails if a spec takes it from `@playwright/test` or launches a browser itself.
  - `e2e/global-setup.ts` starts one Chromium before any test and reads the account's bad-password count before and after (read-only, no administrator rights). The same check runs around every Chromium worker and at the end.
  - If the count ever rises, the run stops and the browser tests stay switched off on the machine: the error names a marker file in the temporary folder. The marker is read before a run starts and again by every worker before it starts a browser, of any engine, so a run that is already under way starts no further browser either (`tests/os-isolation-fixture.test.ts`). Find the cause, then delete the file. The worst case is one bad password, not a lockout.
  - **What the guard cannot see.** It compares readings of one number, and Windows sets that number back to zero at every successful logon; unlocking the screen is one. A bad password that is followed by an unlock before the next reading leaves nothing in the count, so inside one run a rise can go unnoticed. What bounds this is the canary: one Chromium, started exactly as the tests start it, on a page with the fields that wake the password manager, with a reading directly before and directly after, and before any test runs. The readings around every worker and at the end are a second look, not a proof. Do not unlock the machine while the canary runs (the first seconds of a run); for certainty afterwards, the Security log shows a failed logon as event 4625 with process `chrome.exe` (reading it needs administrator rights).
  - **Playwright's own windows are refused.** UI mode (`--ui`), the inspector (`--debug`, `PWDEBUG`, `page.pause()`), the trace viewer (`playwright show-trace`, which Playwright itself suggests after a failed test) and the recorder (`codegen`, `open`) are each a Chromium that Playwright starts by itself on a new, empty profile, outside the fixture. `pnpm e2e` and `pnpm ds:visual` stop on those switches, and `tests/os-isolation-paths.test.ts` keeps every other way of starting a browser out of the repository. **Never run `playwright show-trace`, `codegen` or `open` on such a machine.** To look at a failed test, open `playwright-report/index.html` in your own browser: the trace of every failed test is inside the report.

Things a newcomer trips over:
- **Antivirus that inspects web traffic.** Some products add a script and a stylesheet to every page loaded over plain HTTP, and re-sign HTTPS downloads. `e2e/support/fixtures.ts` answers such injected requests with nothing, in the kind that was asked for, in every context (also one a spec makes itself with `browser.newContext()`), and keeps them apart from the application's requests; `e2e/fixtures.spec.ts` holds that; a test proves from the server's own bytes that the application does not send them. If `e2e:install` fails with `SELF_SIGNED_CERT_IN_CHAIN`, the product is re-signing the download host; point Node at your organisation's root certificate with `NODE_EXTRA_CA_CERTS`. Never turn certificate checks off.
- **A run that was interrupted** can leave a server on a port. Find it with `Get-NetTCPConnection -LocalPort 3000` and stop that process.
- `E2E_SKIP_BUILD=1` reuses the last test build; use it only while writing a test.

## 7. Design system

`design-system/` is the UdEkoM Balkans design system, **version 2.0.1**, made in this repository (ADR-21). Its `CHANGELOG.md` lists every change from version 1, which is the first commit of this repository.

- The UI comes only from it: no other UI kit, no Tailwind, no colour literal outside `design-system/tokens.css`. The lint enforces this, and `lint-fixtures/` holds a planted violation for every rule.
- Application code imports `@confera/ui`, never the folder. `packages/ui/src/generated/` is the design-system script wrapped, unchanged, in a client module so that it renders on the server and hydrates. `corepack pnpm ds:build` regenerates it.
- **The folder is changed only as a release.** After a change: update `CHANGELOG.md`, then `corepack pnpm ds:release` (regenerates `tokens.css` and the fonts, records `CHECKSUMS.sha256`) and `corepack pnpm ds:build`. Until then `ds:check` fails and names the file.
- `corepack pnpm ds:check` also fails on an address of another origin or a raw-markup write in the script, on a custom property without a token, on a fixed English text in a component, and when manifest, exports and types disagree.
- `corepack pnpm ds:visual` (needs the browsers) renders every preview of v1 and v2 as a plain script and writes `.artifacts/ds-visual/index.html`.
- `corepack pnpm ds:snapshot` writes the release as a reproducible zip to `.artifacts/udekom-design-system-v<version>.zip` and prints its checksum.

## 8. API contract

`confera_be` generates and commits two OpenAPI documents. This repository vendors a copy of both in `packages/api-client/openapi/`, with `openapi.lock.json` (commit, tag, checksum and version) and the generated types in `packages/api-client/src/generated/`.

```
corepack pnpm api:sync              # from ..\confera_be; or: --from <directory>
```

The contract must be committed in `confera_be`. Commit the three things together. `corepack pnpm api:check` (part of `check`) fails when a copy does not match the lock or a type file is stale; `corepack pnpm api:check --sibling` also fails when the checkout of `confera_be` next to this repository has another contract.

`openapi-typescript` 7.13.0 declares TypeScript 5 as its peer. It was run under TypeScript 6.0.3 and 5.9.3 on the same document with identical output, so it runs on 6.0.3; the exception is written down in `pnpm-workspace.yaml`, and `api:check` regenerates the types on every check.

## 9. Configuration and what a production build is

The application reads its settings only in `apps/web/src/config/env.ts` and refuses to start when one is wrong, naming the variable and never its value (ADR-24):

| Variable | Meaning |
|---|---|
| `STAGE` | `local`, `dev`, `test` or `prod`. No default. The first three start only with loopback or `.test` origins |
| `CONFERA_ADMIN_ORIGIN`, `CONFERA_PUBLIC_ORIGIN` | the two surfaces; two different host names; https on `prod` |
| `CONFERA_API_ORIGIN` | where `/api/v1` and `/public/v1` are forwarded |
| `PORT` | port of `dev` and `start` (3000) |

The web application has no secret and must never be given one. `scripts/next.mjs` is the only way Next is started: it turns the framework's telemetry off and loads `.env`.

A **test build** (`corepack pnpm build:test`, used by `dev` and `e2e`) also contains the gallery and the spike fixtures. A production build does not contain them at all, not even their names, and a test build refuses to start on `prod`.

**Security headers** (ADR-28) are set in one place, `apps/web/src/proxy.ts`, by kind of page; `apps/web/src/server/security/routes.json` declares the kind of every route, and a route that is not declared fails `verify:build`. From 0.1.0 two rules are enforced: who may frame a page (`frame-ancestors 'none'` everywhere except the frame page of a form with a site list) and no inline event handlers. The rest of the policy is report-only until 0.2.0 (admin) and 0.3.0 (public). Every page carries a fresh nonce and is never stored.

## 10. The embed

`buildEmbedSnippet` in `@confera/embed-loader` produces what an admin pastes into a conference site: a frame, a link to the hosted form, and a few inline lines that only set the frame's height. No code is loaded from Confera into the site; to change the snippet it is pasted again. Where a site strips scripts, the frame keeps its fixed height. `e2e/embed.spec.ts` is the proof on the hostile page.

**The fields of a form are plain controls.** The server sends the whole form as markup, and the scripts that attach it can take seconds on a phone; an author who starts typing in that time must not lose the text. So a field never takes its text from component state (no `value=`, no `checked=`): it is a control with a `name`, the browser holds what is typed, and the page reads the controls through a store (`createFormValueStore`, `useFormValues` and `useFormRef` in `@confera/form-renderer`). While the form is being attached the store answers with the initial values, so the markup matches; right after, with what is really in the controls. A draft kept in the tab is written only into controls the author has not touched. The form renderer of 0.3.0 builds on the same store; `tests/form-typed-before-attach.test.tsx` holds the behaviour on the spike form.

## 11. Dependencies and the supply chain

The rules of ADR-01 are settings in `pnpm-workspace.yaml`, the same as in `confera_be`: exact versions; a frozen lockfile; a version must be public for 3 days; a dependency's build script runs only if `allowBuilds` names it; strict engines and peers; `pnpm audit` fails `check` on high or critical; a secret scan.

```
corepack pnpm add --filter @confera/web <name>@<exact version>     # or -w for the root
```

**Secret scan** (`corepack pnpm secrets`), in two parts with one verdict, as in `confera_be`:
- secretlint finds credentials by their **format**: tokens of known services, private keys, an address with a user and a password.
- `scripts/secret-assignments.mjs` finds a secret that has no format by the **name** it is assigned to: a literal value of 8 characters or more assigned to a name with `PASSWORD`, `SECRET`, `TOKEN`, `CREDENTIAL` or `KEY` in it. In an environment or configuration file that is `NAME=value` or `NAME: value`; in source code and JSON a quoted value (`clientSecret: '...'`). It names the file, the line and the variable, never the value.

A placeholder starts with `invented-` or `local-only-`; an empty value and a reference such as `${VAR}` are fine too. Anything else fails, `changeme` included. In a test, build such a text from parts. A name that ends in `FILE`, `PATH`, `URL`, `NAME` or `HEADER` says where a secret is and is not reported; nor is one branch of a choice (`a ? "hidePassword" : "showPassword"`) or the `credentials` option of `fetch`. The web application itself must never be given a secret (section 9).

`corepack pnpm test:supply-chain` (part of `check`) proves that these rules bite, on planted cases in a copy of the repository under `.artifacts/`; it plants nothing in your working tree and removes its copy. `tests/supply-chain-settings.test.ts` holds the settings themselves: a rule that is switched off or a version range fails the unit tests.

**Lint.** ESLint uses the React, hooks, accessibility and typescript-eslint plugins directly, and the style lint is our own small PostCSS script (`scripts/lint-styles.mjs`). A lint selector matches one spelling; `tests/source-rules.test.ts` holds the same bans on the syntax tree, in any spelling (who reads the environment, where raw markup is mentioned, which modules are imported, inline styles, code from text). `eslint-config-next` and Stylelint are not used: both bring in `braces` 3.0.3, which has a known vulnerability rated high and no patched version (GHSA-vfj7-8cjw-p6xm), and the audit refuses it. Return to them when that is fixed.

ESLint is 9.39.5, the newest that every lint plugin supports; npm marks the 9 line as no longer supported.

## 12. Git

Work on `m1/fe-foundation` for milestone 0.1.0. Commit messages follow Conventional Commits. `main` is created by the lead at the release.
