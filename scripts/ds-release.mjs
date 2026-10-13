// `pnpm ds:release`: cuts a design-system release (ADR-21).
// It regenerates what is generated (tokens.css, fonts), checks that the
// version is named everywhere, and records the checksum of every file in
// design-system/CHECKSUMS.sha256. `pnpm ds:check` then refuses any later
// change to the folder that is not followed by a new release.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, root, runNode } from './lib.mjs';
import { checksumsText, paths, readBundleVersion, readText, readTokens, sha256 } from './ds-lib.mjs';

for (const script of ['ds-tokens.mjs', 'ds-fonts.mjs']) {
  if (runNode(join(root, 'scripts', script)) !== 0) fail(`${script} failed`);
}

const tokens = readTokens();
const changelog = readText(paths.changelog);
const released = /^## (\d+)\.(\d+)\.(\d+) \(\d{4}-\d{2}-\d{2}\)$/m.exec(changelog);
if (!released) fail('design-system/CHANGELOG.md has no release heading of the form "## 2.0.0 (2026-10-13)".');
const version = `${released[1]}.${released[2]}.${released[3]}`;
if (Number(released[1]) !== tokens.version) {
  fail(`tokens.json says version ${tokens.version}, the changelog's newest release is ${version}.`);
}
const bundleVersion = readBundleVersion(readText(paths.bundleJs));
if (bundleVersion !== null && bundleVersion !== version) {
  fail(`components/bundle.js says @ds-version ${bundleVersion}, the changelog's newest release is ${version}.`);
}

const text = checksumsText();
writeFileSync(paths.checksums, text);
console.log(`design-system ${version}: ${text.trim().split('\n').length} files recorded in CHECKSUMS.sha256`);
console.log(`release checksum (sha256 of CHECKSUMS.sha256): ${sha256(text)}`);
