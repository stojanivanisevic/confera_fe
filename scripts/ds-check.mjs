// `pnpm ds:check`: the checks that guard the design system and its adapter
// (ADR-21, SEC-A-48). It fails when
//   - a file of design-system/ changed without a new release (CHECKSUMS.sha256);
//   - the version is not the same in tokens.json, the changelog and the bundle;
//   - tokens.css or the fonts are not what their sources generate;
//   - manifest, exports and types do not agree;
//   - a custom property used by a stylesheet has no token;
//   - the bundle or a stylesheet contains an address of another origin or a
//     network call, or the bundle writes raw markup or builds code from text;
//   - the bundle cannot be wrapped any more, or the generated adapter is stale.
// The visual comparison is a separate command that needs browsers: `pnpm ds:visual`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildAdapter, checkTransforms, generatedDir, NON_COMPONENT_EXPORTS, runtimeExports } from './ds-build.mjs';
import { checksumsText, dsDir, fontRelease, paths, readBundleVersion, readManifest, readText, readTokens, sha256, tokensCss } from './ds-lib.mjs';
import { lintCss, readTokenNames } from './lint-styles.mjs';

const lf = (text) => text.replace(/\r\n/g, '\n');

/** Addresses and network calls that must not be in first-party script text. */
const EXTERNAL = [
  [/\b(?:https?|wss?|ftp):\/\//i, 'an address with a scheme'],
  [/(["'`(=\s])\/\/[a-z0-9]/i, 'a protocol-relative address'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bimportScripts\b/, 'importScripts'],
  [/\bimport\s*\(/, 'dynamic import'],
  [/\bnew\s+Image\b/, 'new Image'],
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, 'browser storage'],
  [/\bdocument\.cookie\b/, 'document.cookie'],
];
/** Ways of turning text into markup or code. */
const RAW_MARKUP = [
  [/\binnerHTML\b/, 'innerHTML'],
  [/\bouterHTML\b/, 'outerHTML'],
  [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'],
  [/\bdangerouslySetInnerHTML\b/, 'dangerouslySetInnerHTML'],
  [/\bdocument\.write(?:ln)?\b/, 'document.write'],
  [/\bcreateContextualFragment\b/, 'createContextualFragment'],
  [/\bDOMParser\b/, 'DOMParser'],
  [/\bsrcdoc\b/i, 'srcdoc'],
  [/\bsetHTMLUnsafe\b/, 'setHTMLUnsafe'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bFunction\s*\(/, 'Function()'],
  [/\bset(?:Timeout|Interval)\s*\(\s*["'`]/, 'a timer with code as text'],
];

/** Scans script text. Comments are scanned too: an address in a comment is still an address in the file. */
export function scanScript(text) {
  const problems = [];
  const lines = text.split('\n');
  for (const [list, kind] of [[EXTERNAL, 'external address or network call'], [RAW_MARKUP, 'raw-markup write or code from text']]) {
    for (const [pattern, name] of list) {
      const index = lines.findIndex((line) => pattern.test(line));
      if (index >= 0) problems.push(`${kind}: ${name} (line ${index + 1})`);
    }
  }
  return problems;
}

/**
 * Every check on a design-system folder. Returns a list of problems.
 * @param {{ dir?: string, checkGenerated?: boolean }} [options]
 */
export function checkDesignSystem(options = {}) {
  const dir = options.dir ?? dsDir;
  const at = (...parts) => join(dir, ...parts);
  const problems = [];

  const bundle = lf(readText(at('components', 'bundle.js')));
  const bundleCss = lf(readText(at('components', 'bundle.css')));
  const types = lf(readText(at('components', 'index.d.ts')));
  const tokens = readTokens(at('tokens.json'));

  // ---- release discipline -------------------------------------------------------
  if (!existsSync(at('CHECKSUMS.sha256'))) {
    problems.push('CHECKSUMS.sha256 is missing: cut a release with `pnpm ds:release`');
  } else {
    const recorded = new Map(lf(readText(at('CHECKSUMS.sha256'))).trim().split('\n').map((l) => [l.slice(66), l.slice(0, 64)]));
    const actual = new Map(checksumsText(dir).trim().split('\n').map((l) => [l.slice(66), l.slice(0, 64)]));
    for (const [file, sum] of actual) {
      if (!recorded.has(file)) problems.push(`file added without a release: ${file}`);
      else if (recorded.get(file) !== sum) problems.push(`file changed without a release: ${file}`);
    }
    for (const file of recorded.keys()) if (!actual.has(file)) problems.push(`file removed without a release: ${file}`);
  }
  const changelog = existsSync(at('CHANGELOG.md')) ? readText(at('CHANGELOG.md')) : '';
  const released = /^## (\d+)\.(\d+)\.(\d+) \(\d{4}-\d{2}-\d{2}\)$/m.exec(changelog);
  if (!released) problems.push('CHANGELOG.md has no release heading');
  else {
    const version = `${released[1]}.${released[2]}.${released[3]}`;
    if (Number(released[1]) !== tokens.version) problems.push(`tokens.json is version ${tokens.version}, the changelog says ${version}`);
    const bundleVersion = readBundleVersion(bundle);
    if (bundleVersion !== null && bundleVersion !== version) problems.push(`the bundle says version ${bundleVersion}, the changelog says ${version}`);
  }

  // ---- generated files ----------------------------------------------------------
  if (!existsSync(at('tokens.css')) || lf(readText(at('tokens.css'))) !== tokensCss(tokens)) {
    problems.push('tokens.css is not what tokens.json generates (`pnpm ds:tokens`)');
  }
  if (dir === dsDir) {
    for (const [name, data] of fontRelease()) {
      const file = join(paths.fontsDir, name);
      const same = existsSync(file) && sha256(/\.(css|txt)$/.test(name) ? lf(readText(file)) : readText(file, null)) === sha256(typeof data === 'string' ? lf(data) : /\.txt$/.test(name) ? lf(data.toString('utf8')) : data);
      if (!same) problems.push(`fonts/${name} is not the file of the pinned package (\`pnpm ds:fonts\`)`);
    }
  }

  // ---- manifest = exports = types --------------------------------------------------
  let manifest;
  try {
    manifest = readManifest(bundle);
    const exported = runtimeExports(bundle);
    const components = exported.filter((n) => !NON_COMPONENT_EXPORTS.includes(n));
    for (const name of manifest.componentNames) if (!components.includes(name)) problems.push(`in the manifest, not exported by the bundle: ${name}`);
    for (const name of components) if (!manifest.componentNames.includes(name)) problems.push(`exported by the bundle, not in the manifest: ${name}`);
    const typed = [...types.matchAll(/^export interface (\w+)Props\b/gm)].map((m) => m[1]);
    for (const name of manifest.componentNames) if (!typed.includes(name)) problems.push(`no ${name}Props in index.d.ts`);
    for (const name of typed) if (!manifest.componentNames.includes(name)) problems.push(`${name}Props in index.d.ts has no component`);
    if (new Set(manifest.componentNames).size !== manifest.componentNames.length) problems.push('the manifest names a component twice');
  } catch (error) {
    problems.push(`the bundle cannot be read: ${error.message}`);
  }

  // ---- every custom property has a token; no colour literal; no other origin ----------
  const tokenNames = readTokenNames(at('tokens.css'));
  const sheets = [['components/bundle.css', bundleCss]];
  if (existsSync(at('fonts', 'fonts.css'))) sheets.push(['fonts/fonts.css', lf(readText(at('fonts', 'fonts.css')))]);
  for (const [name, css] of sheets) {
    for (const finding of lintCss(css, { filename: name, tokens: tokenNames, designSystem: true })) {
      problems.push(`${name}:${finding.line} ${finding.rule}: ${finding.text}`);
    }
  }
  for (const used of new Set([...bundleCss.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]))) {
    if (!tokenNames.has(used)) problems.push(`components/bundle.css uses ${used}, which is not a token`);
  }

  // ---- first-party script text: no other origin, no raw markup -------------------------
  for (const problem of scanScript(bundle)) problems.push(`components/bundle.js: ${problem}`);

  // ---- the adapter ------------------------------------------------------------------------
  for (const problem of checkTransforms(bundle)) problems.push(`components/bundle.js: ${problem}`);
  if (options.checkGenerated ?? dir === dsDir) {
    for (const [name, text] of buildAdapter()) {
      const file = join(generatedDir, name);
      if (!existsSync(file) || lf(readText(file)) !== text) problems.push(`packages/ui/src/generated/${name} is stale (\`pnpm ds:build\`)`);
    }
  }

  return { problems, manifest };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { problems, manifest } = checkDesignSystem();
  if (problems.length > 0) {
    console.error(`✗ pnpm ds:check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  const release = sha256(lf(readText(paths.checksums)));
  console.log(`✓ design system: release intact (${release.slice(0, 16)}…), ${manifest.componentNames.length} components in manifest, exports and types, every custom property is a token,`);
  console.log('  no address of another origin, no raw-markup write, adapter up to date');
}
