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
| `corepack pnpm secrets` | secret scan: credentials by format (secretlint), and literal values bound to names like a secret (section 11) |
| `corepack pnpm secrets:sync` | takes the scanner of the second part, with its manifest, from `confera_be`, unchanged, and records its version in a lock |
| `corepack pnpm test:supply-chain` | plants a fake secret, a vulnerable package and an unlisted build script in a copy under `.artifacts/` and expects each to be caught; the last step of `check` |
| `corepack pnpm dev` | the development server, with the gallery and the spike form |
| `corepack pnpm e2e:install` | downloads the three browser engines, once |
| `corepack pnpm e2e` | browser tests on Chromium, Firefox and WebKit (section 6); with `CONFERA_E2E_API_ORIGIN` set, against a real `confera_be` (section 6, "Against the real API") |
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

The run takes eight to fifteen minutes, depending on what else the machine is doing, and needs the ports **3000, 3100, 3101, 4000 and 4001** free (stop `pnpm dev` first). It builds a test build, starts it, starts the application once more in development mode, a harness "conference site" and an API stub, and stops them all at the end.

- **Three engines**, each with third-party cookies blocked; one test proves the blocking is in effect.
- **Tests that do not run in every engine**, each for a stated reason: the start-up guard (`config-guard`) and the Host-header requests (`qa-hosts`) involve no browser and run in the Chromium project only; the 16 px touch test needs pointer emulation, which only Chromium has (its stylesheet rule is held by a unit test). Nothing else is skipped.
- **`e2e/qa-probes.spec.ts`** looks where the acceptance list does not: 320 px, 200 % and 400 % zoom, a conference site that keeps resizing or forges height messages, storage that throws, the form components by keyboard only, reduced motion.
- **What a failed test leaves behind**, in `playwright-report/index.html`: its trace (every action with the page as it was then, the console, the network) and a picture of the moment it failed. There is no film strip, on purpose. A film strip is recorded for every test, failed or not, by capturing each frame the page paints. WebKit paints at device scale 2 and without a graphics card on this kind of machine, and the gallery never stops painting (a spinner, skeletons), so that cost grew with the time a test took and not with what it did: three WebKit workers at once slowed each other down until tests of a few seconds passed their 60 s limit. On the gallery specs in WebKit, three workers: 317 s of test time with the film strip, 157 s without it.
- **A test stays far from its limit**, so that a full run is green on a busy laptop without running anything again. When you write one: one page, or one state of a page, per test (an accessibility scan costs WebKit about a second before it has looked at anything); ask the page one question about many elements instead of one question per element (`page.evaluate`, as in `e2e/ds-gallery.spec.ts`); a file whose every test loads the whole gallery, or scans it, runs its tests one after the other (`test.describe.configure({ mode: 'default' })`), because three of those at once slow each other and everything else down; and if a test does come near its limit, find where the time goes before you touch the limit.
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

### Against the real API (the cross-repo smoke test)

The same browser tests run in front of a real `confera_be` instead of the stub. The API is started by the documented commands of that repository and by nothing else (its README, section 9). In `..\confera_be`, with its `.env` a copy of `.env.example`:

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

- **The web application under test forwards to the real API.** Every spec runs as before; the admin home shows what the real API answers, in all three engines.
- **One more project runs, `real-api`** (`e2e/real-api.spec.ts`), with what only the real API can answer: its database is ready, its trace id and its security headers arrive through the forward, an error arrives as its problem document, the version it gives is the version of the vendored contract, every `GET` route of the vendored contract exists, it reads the surface from the `Host` header, and no other site is given access. Without the variable this file belongs to no project, so a normal run skips nothing.
- **The short form**, about two minutes: add `--project=real-api`. It runs only that file (HTTP requests and one page in Chromium).
- **Before a browser starts**, the run asks `http://127.0.0.1:3001/health/ready`. If the API is not there or its database does not answer, the run stops with one message that names the six commands above.
- **Only this machine is taken**: `http://127.0.0.1:<port>` or `http://localhost:<port>`, nothing else. The browser tests send odd and hostile requests and must never be pointed at a server.
- **A web application that is already running on port 3000 or 3100 is not taken over** in such a run (it was started with another API address): the run stops and says that the port is in use. Stop that process first.
- The stub still runs on port 3101 in such a run: one test uses that address as a third-party page, and the tests that ask the stub directly still ask the stub.

In 0.1.0 the API has one admin route (`GET /api/v1/meta`) and no public route, and no route reads what `seed:e2e` wrote yet (sign-in arrives with 0.2.0); the seed has tests of its own in `confera_be` (`test/e2e/seed.spec.ts`). Stop the API with Ctrl+C and the stack with `corepack pnpm stack:down` when you are done.

## 7. Design system

`design-system/` is the UdEkoM Balkans design system, **version 2.1.0**, made in this repository (ADR-21). Its `CHANGELOG.md` lists every change from version 1, which is the first commit of this repository.

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

Work on `m1/fe-foundation` for milestone 0.1.0. Commit messages follow Conventional Commits. `main` is created by the lead at the release.
