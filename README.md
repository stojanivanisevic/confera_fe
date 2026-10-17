# confera_fe

The web application of **Confera**, the conference and membership application of UdEkoM Balkans: the admin application, and the public forms that are shown as pages of their own or inside the association's conference sites. The API is in the sibling repository `confera_be`.

This is the work of milestone **0.3.0** (forms, embed and intake) on top of release 0.2.0: the public abstract form from the API, hosted and in the frame of a conference site, in English and Serbian; the snippet; the configuration of the forms, the deadlines, the submissions and the held emails in the admin.

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

Clone both repositories side by side, into one folder: the browser tests, `api:sync`, `api:check --sibling` and the comparison of the secret scanner look for `confera_be` next to this repository (`..\confera_be`). In both repositories `main` holds the latest release and `develop` the work in progress. To work on Confera, clone `develop` of both, as below; to look at the latest release, clone `main` of both (`-b main`).

```
mkdir Confera; cd Confera
git clone -b develop https://github.com/stojanivanisevic/confera_be.git
git clone -b develop https://github.com/stojanivanisevic/confera_fe.git
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
| http://localhost:3000/ | the admin: it asks for a session and sends you to sign-in. The screens of 0.2.0 part A are behind it (section 2a) |
| http://localhost:3000/sign-in | sign-in; from there "Forgot your password?" |
| http://127.0.0.1:3000/f/<form> | a hosted form, read from the API (`confera_be` with `seed:e2e` has the seeded abstract form of a conference) |
| http://127.0.0.1:3000/dev/gallery | the component gallery of the design system |

Stop it with `Ctrl+C`. The admin talks to the API at port 3001, where `.env` already points: start `confera_be` first (its README, "First start"). Without it the sign-in page says "Confera cannot reach its server".

### 2a. The admin screens of 0.2.0

Behind sign-in (an invitation link from `confera_be`, or its first-admin command, makes the first account): the home with the connection card; **Conferences** (a new draft, the settings with dates, languages, time zone, mail server and the listed sites, open, close, archive, a copy); **Email templates** (the organisation's or the chosen conference's; the editor, below); **Mail log** (every attempt, newest first; a stored body only in the sandboxed frame of the design system, ST-28); **Mail servers** (the password write-only, every change with the password asked again, the test message); **Users** (search, filters, invite, rename, change the role, deactivate, reactivate, remove, send the invitation again, end the sessions); **Organisation** (the issuer data, the payment details); **Audit log**; **My account** (change the password, change the email address, sign out everywhere). The pages outside the shell are `/sign-in`, `/forgot-password` and the pages of the links, `/invitations/<token>`, `/password-resets/<token>` and `/email-changes/<token>`.

The **conference switch** at the top is the conference the office works on: the mail log and the templates show it, and it stays chosen across screens and a reload of the tab (session storage). The navigation shows only the entries the person's permissions allow; a screen reached by its address still says "not allowed".

The **template editor** is the spike of ADR-12 (M2-FE-05): `packages/template-editor` is ProseMirror with a schema that is the closed template format of `confera_be` and nothing else; the toolbar is built from design-system controls in the page. A seeded template loads, is edited, is checked as the server checks it (`@confera/api-client`, `template-document.ts`, every shared vector of `template-vectors.json` passes) and is previewed as the server renders it. A placeholder is one object: a chip with its name, inserted from the type's catalogue, deleted as a whole; a typed brace is text. Pasted markup keeps only the format. There is no save in 0.2.0: the API has no write route for templates before 0.4.0.

What holds everywhere (ADR-03, ADR-20):
- **The session** is the API's `__Host-` cookie; the web application never reads it. `GET /api/v1/session` gives the person, the organisation and the CSRF value, and every changing request carries it as `X-CSRF-Token` (`@confera/api-client`, `createSessionClient`). A refetch the person did not ask for says `X-Confera-Background` and does not renew the session. A 401 sends to sign-in, with `next` pointing back.
- **A screen behind sign-in without any session cookie** is answered by the proxy with a 307 to `/sign-in?next=` (the cookie's presence is read, never its value; the API still decides whether a session is valid). No spinner, and it works without scripts.
- **A change that meets an ended session** keeps the page as it is and offers "Sign in in a new tab" and Continue; Continue reads the new session and the change goes on.
- **`next`** after sign-in is only a path of this origin (`apps/web/src/lib/next-path.ts`, ST-26): a full address, `//host`, a backslash, a scheme or one of the auth pages is ignored.
- **The password asked again** (bank and PayPal data, users and roles): a change the API refuses with `password_confirmation_required` opens the dialog, which confirms the password and then makes the change; it counts for 5 minutes in that session (`useFreshPassword`).
- **The live password checklist** (G2-25, ST-62): the four lines are the API's rule set, vendored with its vectors (`packages/api-client/openapi/password-rules.json`) and run in the browser, so nothing is sent while the password is typed; the server checks the same rules and names a broken one by its code, which the checklist shows at the line. `tests/password-rules.test.ts` runs every shared vector.
- **The content security policy is enforced** on the admin and auth pages and, since 0.3.0, on the public pages (one policy with the whole baseline, reported to the API's `/public/v1/csp-reports` through the public origin).
- The texts are English and live in one catalogue, `apps/web/src/admin/texts.ts`. The support contact named in error messages is the organisation profile's contact email (decision D8, 2026-10-17). The texts of the public forms are in English and Serbian in `packages/form-renderer/src/i18n/catalogue.ts`, with a parity check (`tests/form-catalogue.test.ts`).

### 2b. Forms, deadlines, submissions and held emails (0.3.0)

- **Forms** (`/forms`, narrowed by the conference switch): the forms of a conference, a new abstract form with a click; a form (`/forms/<id>`) has its **snippet** for the conference sites (section 10), its **texts** in both languages, the **authors** (the most a form takes, 10 unless changed, D7, and the notice from a later author on), **every field of the catalogue** in a drawer (shown, required, label, help, limits, file types and size, options), the **preview** of the draft through the renderer the sites use (it sends nothing), the **versions** and **Publish**, and the form's **send breaker**. What is configured is `contracts/form-configuration.schema.json` of `confera_be`: over the catalogue in code, never a free builder.
- **Deadlines**: a card in the settings of a conference: the abstract submission, the fee payment and the full paper, each a last day that ends at the end of that day in the conference's zone; moving it later opens the form at once; the history keeps every change. The settings also hold the **consent links** of the conference's forms (terms of publication, privacy notice; D6).
- **Submissions** (`/submissions`): the table, a page at a time, newest first, narrowed by the conference switch; a submission (`/submissions/<id>`): its data under the labels of its form version, the authors, the files with their scan state (downloaded only when clean), the consent, the history and the emails.
- **Held emails** (`/held-mail`): the confirmation emails the send breaker holds, why each waits, their release (selected or all) and the breaker of the organisation. While any is held, the shell says so to every admin who may release them.
- The states of a conference are named as the office names them: **Open for submissions**, **Close submissions** (D10); the copy and the archive are in its menu. The person's menu in the top bar holds My account and Sign out.

`corepack pnpm build` and `corepack pnpm start` run the production build. It does not contain the gallery (section 9).

## 3. Two host names

Confera has two surfaces, each on its own host name (ADR-02), and the application itself refuses a route on the wrong one. On a developer machine the two names are, as in `confera_be`:

| Surface | Host name | Routes |
|---|---|---|
| admin | `localhost` | `/`, `/users`, `/organisation`, `/audit`, `/account`, `/conferences`, `/forms`, `/submissions`, `/held-mail`, `/sign-in`, `/forgot-password`, `/invitations/[token]`, `/password-resets/[token]`, `/email-changes/[token]`, `/api/v1/…` |
| public | `127.0.0.1` | `/f/[form]`, `/embed/[form]`, `/s/[token]`, `/pay/[token]`, `/public/v1/…` |

So http://localhost:3000/f/<form> and http://127.0.0.1:3000/sign-in answer "not found". That is intended. On the public host "not found" says so in English and Serbian, with the way back to the conference site.

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
| `corepack pnpm secrets` | secret scan: credentials by format (secretlint), and literal values bound to names like a secret (section 11) |
| `corepack pnpm secrets:sync` | takes the scanner of the second part, with its manifest, from `confera_be`, unchanged, and records its version in a lock |
| `corepack pnpm test:supply-chain` | plants a fake secret, a vulnerable package and an unlisted build script in a copy under `.artifacts/` and expects each to be caught; the last step of `check` |
| `corepack pnpm dev` | the development server, with the gallery |
| `corepack pnpm e2e:install` | downloads the three browser engines, once |
| `corepack pnpm e2e` | browser tests on Chromium, Firefox and WebKit (section 6); with `CONFERA_E2E_API_ORIGIN` set, against a real `confera_be` (section 6, "Against the real API") |
| `corepack pnpm ds:check` | the design system and its adapter are intact (section 7) |
| `corepack pnpm ds:visual` | pictures of every component in an earlier release and in the working tree, and their difference, for review (section 7) |
| `corepack pnpm api:sync` / `api:check` | the API contract (section 8) |

## 5. Layout

```
apps/web                 the Next 16 application (App Router)
  src/proxy.ts           host separation, security headers, forward to the API: one place
  src/config/env.ts      the only file that reads the environment
  src/server/security    route kinds (routes.json), headers, the site list of a frame
packages/ui              the adapter around the design system; application code imports only this
packages/form-renderer   forms as authors see them: the definition read defensively, the renderer, the rule interpreter (the API's, held by its vectors), the catalogues and formats, the draft, files, the public API
packages/embed-loader    the snippet for conference sites and the frame's height reporter
packages/api-client      the vendored API contract, generated types, typed calls, the password rules and the template format
packages/template-editor the rich-text editor of mail templates (ProseMirror with the closed format of ADR-12; the 0.2.0 spike)
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

The full run takes about 22 minutes on the development machine (a busy machine takes longer), and needs the ports **3000, 3100, 3101, 4000 and 4001** free (stop `pnpm dev` first). It builds a test build, starts it, starts the application once more in development mode, a harness "conference site" and an API stub, and stops them all at the end.

- **Three engines**, each with third-party cookies blocked; one test proves the blocking is in effect.
- **Tests that are skipped or left out, each for a stated reason** (and only these):
  - `config-guard.spec.ts` and `qa-hosts.spec.ts` (the start-up guard and the Host-header requests) involve no browser: Chromium project only.
  - `ds-gallery-axe.spec.ts`, the 16 px touch test: pointer emulation is a Chromium feature (its stylesheet rule is held by `tests/ds-a11y-wiring.test.tsx`).
  - In WebKit, every test that needs a session (`NO_SESSION_IN_WEBKIT` in `e2e/support/admin.ts`): WebKit keeps no Secure cookie on `http://localhost`, and the `__Host-` session cookie of ADR-03 must be Secure. That is all of `admin.spec.ts` except the pages of the links, all of `admin-part-b.spec.ts` and `admin.edge.spec.ts`, the signed-in screens and dialogs of `admin-axe.spec.ts`, the signed-in test of `csp.spec.ts`, the admin home of `pages.spec.ts` and of `ds-2-3-0.spec.ts`, `ds-2-4-0.spec.ts`, and the invitation and session-banner tests of `ds-2-4-1.spec.ts`. The pages outside the shell, with the checklist, run in all three engines (logged as M2-ISS-04: WebKit against staging over HTTPS in 0.4.0).
  - With `CONFERA_E2E_API_ORIGIN` (a real API): `admin.spec.ts` and `admin-part-b.spec.ts` are left out by name (`STUB_ONLY_SPECS`), and the tests that need a record or a reset of the stub are skipped (`STUB_ONLY`): the screens of one stub record in `admin-axe.spec.ts`, the "longest names" test of `admin.edge.spec.ts`, the editor toggle of `ds-2-4-0.spec.ts` and the invitation and session-banner tests of `ds-2-4-1.spec.ts`.
  - `hydration-dev.spec.ts` runs only in its own project (the development server); `real-api.spec.ts` and `qa-real-api-flows.spec.ts` only in the project `real-api`, which exists only with a real API.
- **`e2e/qa-probes.spec.ts`** looks where the acceptance list does not: 320 px, 200 % and 400 % zoom, a conference site that keeps resizing or forges height messages, storage that throws, the form components by keyboard only, reduced motion.
- **What a failed test leaves behind**, in `playwright-report/index.html`: its trace (every action with the page as it was then, the console, the network) and a picture of the moment it failed. There is no film strip, on purpose. A film strip is recorded for every test, failed or not, by capturing each frame the page paints. WebKit paints at device scale 2 and without a graphics card on this kind of machine, and the gallery never stops painting (a spinner, skeletons), so that cost grew with the time a test took and not with what it did: three WebKit workers at once slowed each other down until tests of a few seconds passed their 60 s limit. On the gallery specs in WebKit, three workers: 317 s of test time with the film strip, 157 s without it.
- **A test stays far from its limit**, so that a full run is green on a busy laptop without running anything again. When you write one: one page, or one state of a page, per test (an accessibility scan costs WebKit about a second before it has looked at anything); ask the page one question about many elements instead of one question per element (`page.evaluate`, as in `e2e/ds-gallery.spec.ts`); a file whose every test loads the whole gallery, or scans it, runs its tests one after the other (`test.describe.configure({ mode: 'default' })`), because three of those at once slow each other and everything else down; and if a test does come near its limit, find where the time goes before you touch the limit.
- **The harness** (`e2e/harness/hostile.html`) is a site with hostile CSS and a hostile script on `localhost:4000`; the public surface is `127.0.0.1:3000`, another site, so the form's frame is a real third-party frame.
- **The forms of the browser tests** are served by the stub: `e2e/servers/public-forms.json` (the public form API of `api-stub-public.mjs`: the form, its site list, the token, uploads, the submit with its idempotency key and trap field). `spike-abstract` is the small form of the 0.1.0 spike written as a definition, so that the embed, Send and the probes keep proving what they proved; `itema-2026-abstract` is the seeded abstract form of `confera_be`. After `pnpm api:sync`, `node e2e/servers/make-public-forms.mjs` writes the file again from the vendored contract. `GET /__stub/public/submissions` lists what was stored, for the tests that count (one submission per double click). The admin API of 0.3.0 (forms, deadlines, submissions, held emails) is `api-stub-part-c.mjs`; `e2e/admin-intake.spec.ts` holds its screens, `e2e/public-form.spec.ts` the seeded form in three engines (20 MB and one byte more, a double click, Serbian from the address, a closed form).
- **The API stub** (`e2e/servers/harness.mjs`, `api-stub.mjs`) reads the surface from the `Host` header as `confera_be` does and answers the admin API of 0.2.0 part A as the vendored contract describes it: sign-in with the session cookie and the CSRF value, an exact `Origin`, the password asked again, users with the last-admin rule and versions, the organisation, the audit log, and the links as fixed tokens of its fixture (`stub-fixture.mjs`: invented people on `example.test`). Every worker has a universe of its own in it (keyed by the User-Agent, which carries the worker's slot), and `POST /__stub/reset` puts it back to the fixture, so the workers run at the same time. Part B (conferences, mail servers, the mail log, the templates read API with the 16 seeded templates, a copy of `confera_be`'s `prisma/seed/default-templates.json` in `e2e/servers/`) is in `api-stub-part-b.mjs`. The admin screens are tested against the stub: `e2e/admin.spec.ts` and `admin-part-b.spec.ts` need its records, tokens and reset, and are left out against a real API (below, "Against the real API"); `admin-axe.spec.ts` runs in both.
- Chromium runs as the full browser in its new headless mode (`channel: 'chromium'`), so the separate "headless shell" download is not needed.
- **Chromium never starts on the profile the test runner would make for it.** On a Windows machine that is not in a domain, the full Chromium build tries an interactive logon with an empty password to learn whether the account has one, once per empty profile. Each try is a failed logon (Security event 4625, logon type 2, process `chrome.exe`), and a run starts enough browsers to lock the account (event 4740). So:
  - `e2e/support/fixtures.ts` starts Chromium on an isolated profile of our own whose `Local State` already holds that answer, with the password manager, sign-in before filling and autofill switched off, and gives every page a virtual WebAuthn authenticator. Take `test` from that file in every spec; `tests/os-isolation.test.ts` fails if a spec takes it from `@playwright/test` or launches a browser itself.
  - `e2e/global-setup.ts` starts one Chromium before any test and reads the account's bad-password count before and after (read-only, no administrator rights), and prints one line when the count did not rise. The same check runs around every Chromium worker and at the end.
  - If the count ever rises, the run stops and the browser tests stay switched off on the machine: the error names a marker file in the temporary folder. The marker is read before a run starts and again by every worker before it starts a browser, of any engine, so a run that is already under way starts no further browser either (`tests/os-isolation-fixture.test.ts`). Find the cause, then delete the file. The worst case is one bad password, not a lockout.
  - **What the guard cannot see.** It compares readings of one number, and Windows sets that number back to zero at every successful logon; unlocking the screen is one. A bad password that is followed by an unlock before the next reading leaves nothing in the count, so inside one run a rise can go unnoticed. What bounds this is the canary: one Chromium, started exactly as the tests start it, on a page with the fields that wake the password manager, with a reading directly before and directly after, and before any test runs. The readings around every worker and at the end are a second look, not a proof. Do not unlock the machine while the canary runs (the first seconds of a run); for certainty afterwards, the Security log shows a failed logon as event 4625 with process `chrome.exe` (reading it needs administrator rights).
  - **Playwright's own windows are refused.** UI mode (`--ui`), the inspector (`--debug`, `PWDEBUG`, `page.pause()`), the trace viewer (`playwright show-trace`, which Playwright itself suggests after a failed test) and the recorder (`codegen`, `open`) are each a Chromium that Playwright starts by itself on a new, empty profile, outside the fixture. `pnpm e2e` and `pnpm ds:visual` stop on those switches, and `tests/os-isolation-paths.test.ts` keeps every other way of starting a browser out of the repository. **Never run `playwright show-trace`, `codegen` or `open` on such a machine.** To look at a failed test, open `playwright-report/index.html` in your own browser: the trace of every failed test is inside the report.

Things a newcomer trips over:
- **Antivirus that inspects web traffic.** Some products add a script and a stylesheet to every page loaded over plain HTTP, and re-sign HTTPS downloads. `e2e/support/fixtures.ts` answers such injected requests with nothing, in the kind that was asked for, in every context (also one a spec makes itself with `browser.newContext()`), and keeps them apart from the application's requests; `e2e/fixtures.spec.ts` holds that; a test proves from the server's own bytes that the application does not send them. If `e2e:install` fails with `SELF_SIGNED_CERT_IN_CHAIN`, the product is re-signing the download host; point Node at your organisation's root certificate with `NODE_EXTRA_CA_CERTS`. Never turn certificate checks off.
- **A run that was interrupted** can leave a server on a port. Find it with `Get-NetTCPConnection -LocalPort 3000` and stop that process.
- `E2E_SKIP_BUILD=1` reuses the last test build; use it only while writing a test.

### Against the real API (the cross-repo smoke test)

The same browser tests run in front of a real `confera_be` instead of the stub. The API is started by the documented commands of that repository and by nothing else (its README, section 9). In `..\confera_be`, with its `.env` a copy of `.env.example`:

**A second checkout of `confera_be`** (a clone or a git worktree beside the one a backend developer runs) gets a stack of its own: after the copy of `.env.example`, `corepack pnpm stack:ports` writes PostgreSQL and Mailpit ports derived from its folder (25000 + n, 26000 + n, 27000 + n) into its `.env`, and `stack:up` starts containers named after that folder, so the two stacks never share a database. The API port stays 3001: only one checkout runs `pnpm start` at a time. Name that checkout and its mail catcher for the flows of 0.2.0 with `CONFERA_E2E_BE_DIR`, `CONFERA_E2E_MAILPIT_ORIGIN` (`http://127.0.0.1:<CONFERA_MAIL_WEB_PORT>`) and `CONFERA_E2E_MAILPIT_SMTP_PORT` (`<CONFERA_MAIL_SMTP_PORT>`), from its `.env`.

```
corepack pnpm stack:up
corepack pnpm db:provision
corepack pnpm db:migrate
corepack pnpm seed:e2e
corepack pnpm build
corepack pnpm start          (its own terminal; the log ends with "api.started")
```

That API listens on `127.0.0.1:3001` and knows `localhost:3000` and `127.0.0.1:3000` as its two host names, which are the two origins of the browser tests. Then, in this repository:

```
corepack pnpm api:check --sibling
```

- PowerShell: `$env:CONFERA_E2E_API_ORIGIN = 'http://127.0.0.1:3001'; corepack pnpm e2e`
- Git Bash, macOS, Linux: `CONFERA_E2E_API_ORIGIN=http://127.0.0.1:3001 corepack pnpm e2e`

What the variable changes:

- **The web application under test forwards to the real API.** Every spec that does not need the stub runs as before. The specs sign in only through `signIn` of `e2e/support/admin.ts`, as the admin or reviewer of `seed:e2e` (same names and addresses as the stub's, the seed's password); a person the seed does not have is refused before anything is typed, so no spec causes a failed sign-in there (the API's brake would slow the seed admin down for everyone). `resetStub` does nothing.
- **Two specs are left out of every project, by name**: `admin.spec.ts` and `admin-part-b.spec.ts` (`STUB_ONLY_SPECS` in `playwright.config.ts`). They change and reset the stub's records and open its link tokens, which a real API does not have. In `admin-axe.spec.ts` the screens of one record of the stub (a user, a conference, a mail server, a mail-log entry, a template) are skipped with that reason; the lists, the forms and the dialogs are scanned against the real API.
- **The flows of 0.2.0 through the real API** (`e2e/qa-real-api-flows.spec.ts`, M2-QA-02) run in the project `real-api` too: a mail server and its test message, an invitation, a reset, the bank details, the audit log, the five draft conferences, each mail read back from the mail catcher.
- **One more project runs, `real-api`** (`e2e/real-api.spec.ts`), with what only the real API can answer: its database is ready, its trace id and its security headers arrive through the forward, an error arrives as its problem document, the version it gives is the version of the vendored contract, every `GET` route of the vendored contract exists, it reads the surface from the `Host` header, and no other site is given access. Without the variable this file belongs to no project, so a normal run skips nothing.
- **The short form**: add `--project=real-api`. It runs only those two files (HTTP requests, one signed-in page and the flows, in Chromium).
- **Before a browser starts**, the run asks `http://127.0.0.1:3001/health/ready`. If the API is not there or its database does not answer, the run stops with one message that names the six commands above.
- **Only this machine is taken**: `http://127.0.0.1:<port>` or `http://localhost:<port>`, nothing else. The browser tests send odd and hostile requests and must never be pointed at a server.
- **A web application that is already running on port 3000 or 3100 is not taken over** in such a run (it was started with another API address): the run stops and says that the port is in use. Stop that process first.
- The stub still runs on port 3101 in such a run: one test uses that address as a third-party page, and the tests that ask the stub directly still ask the stub.

In 0.2.0 the admin routes want a session, and the pages of the links answer an unknown token with 404 `link_invalid`; `real-api.spec.ts` expects both. Stop the API with Ctrl+C and the stack with `corepack pnpm stack:down` when you are done.

## 7. Design system

`design-system/` is the UdEkoM Balkans design system, **version 2.5.0**, made in this repository (ADR-21). Its `CHANGELOG.md` lists every change from version 1, which is the first commit of this repository.

- The UI comes only from it: no other UI kit, no Tailwind, no colour literal outside `design-system/tokens.css`. Since design system 2.3.0 type, spacing and sizes are tokens too: a stylesheet writes `font: var(--text-body-sm)`, `var(--gutter-l)`, `var(--target-touch)`, never a px size or a font family (1 and 2 px borders and the breakpoints stay px). The lint enforces this (`colour-literal`, `size-literal`, `font-literal` and the rest), and `lint-fixtures/` holds a planted violation for every rule.
- Application code imports `@confera/ui`, never the folder. `packages/ui/src/generated/` is the design-system script wrapped, unchanged, in a client module so that it renders on the server and hydrates. `corepack pnpm ds:build` regenerates it.
- **The folder is changed only as a release.** After a change: update `CHANGELOG.md`, then `corepack pnpm ds:release` (regenerates `tokens.css` and the fonts, records `CHECKSUMS.sha256`) and `corepack pnpm ds:build`. Until then `ds:check` fails and names the file.
- `corepack pnpm ds:check` also fails on an address of another origin or a raw-markup write in the script, on a custom property without a token, on a fixed English text in a component, and when manifest, exports and types disagree.
- `corepack pnpm ds:visual` (needs the browsers) renders every preview of an earlier release and of the working tree as a plain script, and writes both, their difference and the share of changed pixels to `.artifacts/ds-visual/index.html`. The earlier release is the commit or tag in `DS_VISUAL_BASE` (`$env:DS_VISUAL_BASE = 'v0.1.0'` in PowerShell gives design system 2.2.0), by default the first commit (version 1).
- `corepack pnpm ds:snapshot` writes the release as a reproducible zip to `.artifacts/udekom-design-system-v<version>.zip` and prints its checksum.

## 8. API contract

`confera_be` generates and commits two OpenAPI documents, and, since 0.2.0, the password rule set and the template document format, each with its shared vectors (`contracts/password-rules.json`, `contracts/template-vectors.json`); since 0.3.0 the form definition and its configuration as JSON schemas and the rules of the public forms with their vectors (`contracts/form-definition.schema.json`, `form-configuration.schema.json`, `form-rule-vectors.json`). This repository vendors a copy of all of them in `packages/api-client/openapi/`, with `openapi.lock.json` (commit, tag, checksum and version) and the generated types in `packages/api-client/src/generated/`.

```
corepack pnpm api:sync              # from ..\confera_be; or: --from <directory>
```

The contract must be committed in `confera_be`. Commit the three things together. `corepack pnpm api:check` (part of `check`) fails when a copy does not match the lock or a type file is stale; `corepack pnpm api:check --sibling` also fails when the checkout of `confera_be` next to this repository has another contract, and says which checkout and commit it compared with.

**Line endings.** Git may say, in the checkout of `confera_be`, "in the working copy of 'openapi/openapi.json', CRLF will be replaced by LF the next time Git touches it". The file on disk then has Windows line endings (a tool on Windows wrote it) while both repositories keep LF (`.gitattributes`). Nothing differs for the contract: `api:sync` and `api:check` read the text with LF line endings, so the checksums are the same. `git add --renormalize openapi` in `confera_be` makes the warning go.

`openapi-typescript` 7.13.0 declares TypeScript 5 as its peer. It was run under TypeScript 6.0.3 and 5.9.3 on the same document with identical output, so it runs on 6.0.3; the exception is written down in `pnpm-workspace.yaml`, and `api:check` regenerates the types on every check.

## 9. Configuration and what a production build is

The application reads its settings only in `apps/web/src/config/env.ts` and refuses to start when one is wrong, naming the variable and never its value (ADR-24):

| Variable | Meaning |
|---|---|
| `STAGE` | `local`, `dev`, `test` or `prod`. No default. The first three start only with loopback or `.test` origins |
| `CONFERA_ADMIN_ORIGIN`, `CONFERA_PUBLIC_ORIGIN` | the two surfaces; two different host names (a port or a scheme does not make another host: a cookie does not tell ports apart); https on `prod` |
| `CONFERA_API_ORIGIN` | where `/api/v1` and `/public/v1` are forwarded |
| `PORT` | port of `dev` and `start` (3000) |
| `LISTEN_HOST` | the address `dev` and `start` listen on: `127.0.0.1` by default outside `prod` (this machine only), `0.0.0.0` on `prod` (inside its container). On `local`, `dev` and `test` anything but a loopback address (`127.0.0.1`, `::1`, `localhost`) stops the start, and `-H`/`--hostname` is refused: the same rule as in `confera_be` |

The web application has no secret and must never be given one. `scripts/next.mjs` is the only way Next is started: it turns the framework's telemetry off and loads `.env`.

A **test build** (`corepack pnpm build:test`, used by `dev` and `e2e`) also contains the gallery. Since 0.3.0 no build holds a form of its own: the forms come from the API (the browser tests: from the stub). A production build does not contain them at all, not even their names, and a test build refuses to start on `prod`.

**Security headers** (ADR-28) are set in one place, `apps/web/src/proxy.ts`, by kind of page; `apps/web/src/server/security/routes.json` declares the kind of every route, and a route that is not declared fails `verify:build`. From 0.1.0 two rules are enforced on every page: who may frame it (`frame-ancestors 'none'` everywhere except the frame page of a form with a site list) and no inline event handlers. From 0.2.0 the pages of the admin surface (the kinds `admin` and `auth`), and from 0.3.0 the public pages (`hosted-form`, `frame`, `secure-link`), enforce the whole baseline in one policy and report what it blocks to the API (`report-uri` and `report-to` at `<public origin>/public/v1/csp-reports`); the error and gallery pages keep the baseline report-only. The site list of a frame page comes from the API (`/public/v1/forms/<slug>/frame-sites`), read for every request: removing a site works at once, and a failed lookup frames nothing. Every page carries a fresh nonce and is never stored. A page answers GET and HEAD only: any other method, and any request that names a server action (`Next-Action`), gets 405 with the header set of its kind before the framework sees it (SEC-M1-01); `/api/v1` and `/public/v1` keep every method. The proxy runs for every path except the framework's own files under `/_next/static/`, which keep their long cache and get `nosniff` (`next.config.ts`); any other path under `/_next/`, a file at the root that does not exist and the error page of a page that fails are pages like the others, with the header set of their kind (`e2e/security-headers.spec.ts`, `tests/proxy-coverage.test.ts`). There is no route handler and nothing is served from `public/`.

## 10. The embed

`buildEmbedSnippet` in `@confera/embed-loader` produces what an admin pastes into a conference site (the form's screen in the admin shows it): a line with a link to the hosted form, the frame, and a few inline lines. No code is loaded from Confera into the site; to change the snippet it is pasted again. Where a site strips scripts, the frame keeps its fixed height and scrolls inside. `e2e/embed.spec.ts` is the proof on the hostile page. Decided for 0.3.0 (the owner's decisions of the 0.1.0 reviews, built as recommended):

- **D2, the language of the site.** The snippet carries it (`?lang=sr` on the frame and on the link); without one, the visitor's browser decides inside the form (Serbian also for Croatian, Bosnian and Montenegrin), else English. The author can switch in the form; the draft of the tab keeps the choice.
- **D5, the link above the frame.** "Form not showing? Open it on its own page." / "Obrazac se ne prikazuje? Otvorite ga na posebnoj stranici." stands above the frame, in the snippet's language, so it is in view while the frame loads and where a site that is not listed gets a blocked frame. It opens in the same tab. The frame shows no heading of its own (the site's page has one; a screen reader still finds the form's name) and paints no ground on the site.
- **D1, the scroll after Send.** The frame asks for the part it shows next (the summary of the errors, the thank-you) with `{ type: 'confera:into-view', top }`; the lines scroll the page to it within the Security reviewer's limits: the origin and the sending frame are checked, only that frame, only vertically (`scrollBy(0, …)`), only when that point is outside the window, `top` a finite number clamped to the frame's own height, at most once a second, and nothing else. Chromium and Firefox already scroll the site along with the focus inside a frame; Safari does not, and there the lines do it.

Because a pasted snippet can only be repaired by pasting it again, the inline lines assume nothing about when they run or when the frame arrives (`e2e/embed.edge.spec.ts`): a speed plugin may run them late, a consent manager may hold the frame back and put a new one in later. So they never keep the frame they found: when a message arrives they check its origin first and then look for the frame with this id whose window sent it. A frame that already shows Confera's page when they run has told its height before anyone listened: the lines make it one pixel taller, and the frame answers that change by telling its height again. They send nothing into the frame, wait for nothing (no timer) and stay under 800 characters (600 held the height alone). For the form `itema-2026-abstract` on `https://forms.example.test`, pasted into a Serbian page:

```html
<p lang="sr"><a href="https://forms.example.test/f/itema-2026-abstract?lang=sr">Obrazac se ne prikazuje? Otvorite ga na posebnoj stranici.</a></p>
<iframe id="confera-form-itema-2026-abstract" src="https://forms.example.test/embed/itema-2026-abstract?lang=sr" title="Prijava apstrakta" lang="sr" loading="lazy" referrerpolicy="no-referrer" style="display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;height:900px!important;min-height:0!important;max-height:none!important;border:0!important;margin:0!important;padding:0!important;visibility:visible!important;opacity:1!important"></iframe>
<script>(function(){var o="https://forms.example.test",i="confera-form-itema-2026-abstract";function z(f,h){f.style.setProperty("height",h+"px","important")}function N(x){return typeof x=="number"&&isFinite(x)}var w=0;var f=document.getElementById(i),s=f&&!f.contentDocument&&parseInt(f.style.height);if(s)z(f,s+1);window.addEventListener("message",function(e){if(e.origin!==o||!e.source)return;for(var a=document.querySelectorAll("iframe#"+i),k=0,g;k<a.length;k++)if(a[k].contentWindow===e.source)g=a[k];var d=g&&e.data||{},t=d.top,r,n=Date.now(),h=innerHeight;if(d.type==="confera:height"&&N(d.height))z(g,Math.min(20000,Math.max(200,Math.round(d.height))));if(d.type==="confera:into-view"&&N(t)&&n-w>999){r=g.getBoundingClientRect();t=r.top+Math.min(Math.max(t,0),r.height);if(t<0||t>h){w=n;scrollBy(0,t-h/4)}}})})();</script>
```

**The form inside the frame is the form of the hosted page** (`@confera/form-renderer`): the published definition of the API, read on the server and rendered with the design system. Its fields are plain controls: the server sends the whole form as markup, and the scripts that attach it can take seconds on a phone; an author who starts typing in that time must not lose the text. So a field never takes its text from component state (no `value=`, no `checked=`): it is a control with a `name`, the browser holds what is typed, and the page reads the controls through a store (`createFormValueStore`, `useFormValues` and `useFormRef`). While the form is being attached the store answers with the initial values, so the markup matches; right after, with what is really in the controls. A draft kept in the tab is written only into controls the author has not touched (`tests/form-typed-before-attach.test.tsx`).

**The rules** are the API's: `packages/form-renderer/src/rules.ts` is the client's copy of `src/modules/forms/rules.ts` of `confera_be`, and `tests/form-rule-vectors.test.ts` runs every shared vector (the same errors, path and code, in the same order; the same kept values). An error names its field, and in the block of authors its author; a refusal of the API comes back to the same field in the same words.

**The moment after Send** (`tests/form-send.test.tsx`, `e2e/form-send.spec.ts`):
- Every rule of the form is checked. A failed Send moves the focus to the summary of the errors, every time, and its items are links that move the focus to their fields; a successful Send moves it to the thank-you, with the reference. Both are scrolled into view first, and inside a frame the site is asked to show them (D1).
- Nothing typed ever goes into an address. Until the scripts are there, Send is disabled and Enter in a field submits nothing (a browser's own submit is a navigation, and Firefox stops loading the scripts when one starts). The `<form>` has `method="post"` all the same, with `/f/<form>/send` as its action: the proxy answers that path with 204, so whatever submits the form, the page stays with what was typed. Without scripts at all a `<noscript>` line says the form needs them.
- The submit (ADR-08): a single-use token fetched by the page once it is attached (never rendered into the markup), in the header `X-Form-Token`; the proof-of-work when the API asks for one; the trap field; one `Idempotency-Key` per form instance, kept with the draft, so a double click, a lost answer and a reload send one submission. A used or refused token is replaced once with the same key.

## 11. Dependencies and the supply chain

The rules of ADR-01 are settings in `pnpm-workspace.yaml`, the same as in `confera_be`: exact versions; a frozen lockfile; a version must be public for 3 days; a dependency's build script runs only if `allowBuilds` names it; strict engines and peers; `pnpm audit` fails `check` on high or critical; a secret scan.

```
corepack pnpm add --filter @confera/web <name>@<exact version>     # or -w for the root
```

**Secret scan** (`corepack pnpm secrets`), in two parts with one verdict, as in `confera_be`:
- secretlint finds credentials by their **format**: tokens of known services, private keys, an address with a user and a password.
- `scripts/secret-assignments/` finds a secret that has no format by the **name** it is bound to. Its rule is the next paragraph, and it is the rule you write code by. It is the same rule, in the same words, in `confera_be`.

**The rule for a secret-like name.** In every file that git tracks, no literal value is bound to a secret-like name.

- **A secret-like name** is decided by its last word, in any casing (`smtpPassword`, `SMTP_PASSWORD`, `smtp-password`):
  - the last word is, or ends with: password, passwd, pwd, passphrase, secret, token (`PGPASSWORD`, `DBPASSWD`, `MYSQL_PWD`, `keyPassphrase`, `csrfToken`, `clientSecret`);
  - the last word is pass, credential or credentials (`DB_PASS`, `smtpPass`; `bypass` and `compass` are not the word pass);
  - the last word is `key` and the word before it is one of: api, private, data, access, secret, signing, encryption, master, client, session (`AWS_SECRET_ACCESS_KEY`, `DATA_KEY`, `signingKey`).

  Qualifier words after the secret word, and a number at the end, do not count: sandbox, live, prod, production, staging, test, dev, local, previous, prev, old, new, current, next, primary, secondary, backup, rotated (`PAYPAL_CLIENT_SECRET_SANDBOX`, `DATA_KEY_PREVIOUS`, `SMTP_PASSWORD_2`). A name whose last word is another one is not secret-like: `passwordPolicy`, `tokenType`, `secretName`, `PASSWORD_MIN_LENGTH`, `SESSION_SECRET_FILE`, a label, a message; nor are `primaryKey`, `sortKey`, `cacheKey`, `publicKey`, `idempotencyKey`, nor a plural (`secrets:` of compose lists names, not values).

- **Allowed values, and nothing else:**
  - nothing: an empty value, and also `null`, `~`, `true` and `false`, which are no value or a flag (`persist-credentials: false`);
  - a reference to something else as the whole value: `${VAR}`, `$VAR`, `$1`, `$@`, references one after the other (`"$PREFIX$SUFFIX"`), `$(command)`, `${{ secrets.X }}`; in JavaScript anything that is not a literal (`process.env.X`, a call, another variable); in PowerShell a command or a call (`$p = Read-Host`);
  - a placeholder: a literal that **starts with** `invented-` or `local-only-`.

  A list of values under a secret-like name is read value by value.

- **There is no guess by length or by randomness.** `'too_short'` under a secret-like name is a finding, and so are `changeme` and `1`. A test that needs a password that is too short uses `'invented-x'`.
- **The written exceptions, and no others:**
  - the option `credentials` of the Fetch API takes a mode: under exactly that name, exactly `'include'`, `'same-origin'` and `'omit'` are not a finding;
  - versions under names of packages: the maps `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`, `overrides`, `resolutions`, `catalog` and `catalogs` of a package manifest or a pnpm workspace file (and `pnpm.overrides`);
  - GitHub Actions: under `permissions`, the levels `read`, `write` and `none` (`id-token: write`).
- **Where a name gets a value:**
  - `NAME=value` at the start of a line, with or without `export`, quotes, a leading list dash, `ENV`, `ARG` or `RUN` (environment files, shell, compose, Dockerfile, this README), and `-e NAME=value` or `--env NAME=value` anywhere in a line;
  - `name: value` in YAML and `"name": value` in JSON, in any letter case, also in a file with one more extension (`compose.yml.example`);
  - in JavaScript and TypeScript an assignment (also `+=`), a declaration (typed or not), a field of a class, an object property, a default parameter, an attribute of a JSX element, and a literal used as a fallback for such a name (`??`, `||`, a branch of a ternary), also inside the `${...}` of a template.

  A file is read as UTF-8, or as UTF-16 when a byte-order mark says so.

- **What is not read:** comments; lockfiles; and what this repository generates or vendors: the API contract of `confera_be` in `packages/api-client/openapi/` (vendored by `api:sync`), the types generated from it in `packages/api-client/src/generated/`, and the design-system script wrapped for the application in `packages/ui/src/generated/` (generated by `ds:build`; its source in `design-system/` is read). The list of what is left out is `scripts/secret-scan.config.mjs`; a hand-written file with a finding is changed, never added to that list.

The rule reaches names that only sound like a secret, and those are renamed: a label is `showPasswordText`, not `showPassword`; a lint rule is `unknown-custom-property`, not `unknown-token`; a header of a test request is `'x-csrf-token': 'invented-csrf'`. The web application itself must never be given a secret (section 9).

**Where the scanner comes from.** It is one file without dependencies, `scripts/secret-assignments/secret-assignments.mjs`, with its two corpora beside it: shapes that must be reported (`…reported.mjs`) and ordinary lines that must not be (`…ordinary.mjs`), and `secret-assignments.manifest.json`: the version of the scanner and the SHA-256 of each of the three files (over the text with LF line endings). The four are written in `confera_be`, hold nothing about a repository, and are copied here unchanged; they are never edited here.

- `--self-test` runs the two corpora and compares the three files with the manifest, so a copy that was changed, or is of another version, fails. The unit tests run it (`tests/secret-assignments.test.ts`).
- `scripts/secret-scan.lock.json` records the version that was taken and the SHA-256 of the manifest; `tests/secret-assignments-lock.test.ts` holds the copies to it. When `confera_be` is checked out next to this repository (or where `CONFERA_BE_DIR` points) and has the scanner, the same test compares its manifest with this one and fails on any difference: the two repositories cannot drift apart unseen.

```
corepack pnpm secrets:sync                                           takes the four files from ..\confera_be (or: --from <directory>), checks them, writes the lock
node scripts/secret-assignments/secret-assignments.mjs               scans the current directory
node scripts/secret-assignments/secret-assignments.mjs --self-test   runs the two corpora, checks the manifest
node scripts/secret-assignments/secret-assignments.mjs --version     the version of the scanner
```

`corepack pnpm test:supply-chain` (part of `check`) proves that these rules bite, on planted cases in a copy of the repository under `.artifacts/`; it plants nothing in your working tree and removes its copy. `tests/supply-chain-settings.test.ts` holds the settings themselves: a rule that is switched off or a version range fails the unit tests.

**Lint.** ESLint uses the React, hooks, accessibility and typescript-eslint plugins directly, and the style lint is our own small PostCSS script (`scripts/lint-styles.mjs`). A lint selector matches one spelling; `tests/source-rules.test.ts` holds the same bans on the syntax tree, in any spelling (who reads the environment, where raw markup is mentioned, which modules are imported, inline styles, code from text). `eslint-config-next` and Stylelint are not used: both bring in `braces` 3.0.3, which has a known vulnerability rated high and no patched version (GHSA-vfj7-8cjw-p6xm), and the audit refuses it. Return to them when that is fixed.

ESLint is 9.39.5, the newest that every lint plugin supports; npm marks the 9 line as no longer supported.

## 12. Git

`main` holds the latest release and `develop` the work in progress. Work on a branch from `develop`; a release is prepared on `release/<version>` and the lead puts it on `main` with its tag. Commit messages follow Conventional Commits.
