// ST-11, ADR-01: the supply-chain rules are settings in pnpm-workspace.yaml and exact
// versions in every package.json. `confera_be` has a script that checks that they stay
// (scripts/supply-chain.mjs); here it is this test. A rule that is switched off, a range
// instead of a version or a build script that is allowed without a review fails `pnpm check`.
//
// The values are written out in this file and not read from anywhere: changing a rule
// means changing this test, in a diff a reviewer sees.
// That the rules bite (a planted secret, a vulnerable package, an unlisted build script)
// is `pnpm test:supply-chain` (scripts/supply-chain-planted.mjs).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Shortest waiting time for a new release that this repository accepts, in minutes (one day). */
const MINIMUM_RELEASE_AGE_FLOOR = 1440;

/** Dependency build scripts that were reviewed and may run. None so far. */
const REVIEWED_BUILD_SCRIPTS: readonly string[] = [];

/** The top-level settings of pnpm-workspace.yaml, as plain `key: value` lines. */
function settings(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z]+):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (match) found.set(match[1]!, match[2]!);
  }
  return found;
}

/** The entries of a one-level mapping such as `allowBuilds:`. */
function mapping(text: string, key: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  const entries = new Map<string, string>();
  if (start < 0) return entries;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = /^\s+['"]?([^'":#][^'":]*)['"]?:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (match) entries.set(match[1]!, match[2]!);
  }
  return entries;
}

function manifests(): string[] {
  const files = ['package.json'];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(join(root, group))) {
      const file = `${group}/${name}/package.json`;
      if (existsSync(join(root, file))) files.push(file);
    }
  }
  return files;
}

const workspace = read('pnpm-workspace.yaml');
const set = settings(workspace);

describe('supply-chain settings of pnpm-workspace.yaml (ST-11, ADR-01)', () => {
  it('the parser of this test reads the file', () => {
    expect(set.size).toBeGreaterThan(5);
    expect(settings('frozenLockfile: false  # off').get('frozenLockfile')).toBe('false');
    expect(mapping("allowBuilds:\n  a: true\n  '@b/c': false\nnext: 1\n", 'allowBuilds')).toEqual(
      new Map([
        ['a', 'true'],
        ['@b/c', 'false'],
      ]),
    );
  });

  it.each([
    ['frozenLockfile', 'true', 'an install never changes the lockfile'],
    ['strictDepBuilds', 'true', 'an unlisted build script stops the install'],
    ['blockExoticSubdeps', 'true', 'sub-dependencies come from the registry only'],
    ['engineStrict', 'true', 'a dependency that does not support this Node stops the install'],
    ['strictPeerDependencies', 'true', 'peer ranges are checked'],
    ['verifyDepsBeforeRun', 'error', 'a script never runs on stale node_modules'],
    ['savePrefix', "''", 'a dependency is added with an exact version'],
  ])('%s is %s: %s', (name, value) => {
    expect({ name, value: set.get(name) }).toEqual({ name, value });
  });

  it('a new release must be public for at least a day before it can be installed', () => {
    const age = Number(set.get('minimumReleaseAge'));
    expect(Number.isInteger(age)).toBe(true);
    expect(age).toBeGreaterThanOrEqual(MINIMUM_RELEASE_AGE_FLOOR);
    expect(set.get('minimumReleaseAgeStrict')).not.toBe('false');
    expect(workspace).not.toMatch(/^minimumReleaseAgeExclude:/m);
  });

  it.each(['dangerouslyAllowAllBuilds', 'ignoreScripts', 'onlyBuiltDependencies', 'neverBuiltDependencies', 'ignoredBuiltDependencies'])(
    'build scripts are decided in allowBuilds and nowhere else: no %s',
    (name) => {
      expect(set.has(name)).toBe(false);
    },
  );

  it('only reviewed build scripts may run, and every entry is true or false', () => {
    const builds = mapping(workspace, 'allowBuilds');
    expect(builds.size).toBeGreaterThan(0);
    for (const [name, value] of builds) expect({ name, decided: ['true', 'false'].includes(value) }).toEqual({ name, decided: true });
    const allowed = [...builds].filter(([, value]) => value === 'true').map(([name]) => name);
    expect(allowed.sort()).toEqual([...REVIEWED_BUILD_SCRIPTS].sort());
  });

  it('no version is forced or patched without a note in this test', () => {
    // An override or a patch replaces what the registry serves: each one is a decision.
    expect(mapping(workspace, 'overrides')).toEqual(new Map());
    expect(mapping(workspace, 'patchedDependencies')).toEqual(new Map());
  });

  it('the one peer exception is the documented one (ADR-19, openapi-typescript on TypeScript 6)', () => {
    expect(workspace).toContain("'openapi-typescript>typescript': '6.0.3'");
    expect((workspace.match(/^\s+'[^']+>[^']+':/gm) ?? []).length).toBe(1);
  });
});

describe('.npmrc holds no setting and no token', () => {
  it('only names the registry', () => {
    const lines = read('.npmrc')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '' && !line.trim().startsWith(';') && !line.trim().startsWith('#'));
    expect(lines).toEqual(['registry=https://registry.npmjs.org/']);
  });
});

describe('exact versions everywhere (ST-11, ADR-01)', () => {
  const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
  const files = manifests();

  it('finds the manifests of the workspace', () => {
    expect(files).toEqual(
      expect.arrayContaining(['package.json', 'apps/web/package.json', 'packages/ui/package.json', 'packages/api-client/package.json']),
    );
  });

  it.each(files)('%s pins every dependency to one version', (file) => {
    const manifest = JSON.parse(read(file)) as Record<string, Record<string, string> | undefined>;
    const loose: string[] = [];
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        const internal = name.startsWith('@confera/') && version === 'workspace:*';
        if (!internal && !EXACT.test(version)) loose.push(`${field}: ${name}@${version}`);
      }
    }
    expect(loose).toEqual([]);
  });

  it.each(files)('%s has no install script of its own', (file) => {
    const scripts = (JSON.parse(read(file)) as { scripts?: Record<string, string> }).scripts ?? {};
    expect(Object.keys(scripts).filter((name) => /^(pre|post)?install$|^prepare$|^prepublish/.test(name))).toEqual([]);
  });

  it('pnpm itself is pinned to an exact version with its hash, and Node to its line', () => {
    const manifest = JSON.parse(read('package.json')) as { packageManager?: string; engines?: Record<string, string> };
    expect(manifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+\+sha512\.[0-9a-f]{128}$/);
    expect(manifest.engines?.node).toBe('>=22.13.0 <23');
    expect(manifest.engines?.pnpm).toBe(manifest.packageManager?.slice('pnpm@'.length, manifest.packageManager.indexOf('+')));
  });

  it('the lockfile exists and locks the versions the manifests ask for', () => {
    const lock = read('pnpm-lock.yaml');
    expect(lock).toMatch(/^lockfileVersion:/m);
    for (const file of files) {
      const manifest = JSON.parse(read(file)) as Record<string, Record<string, string> | undefined>;
      for (const field of ['dependencies', 'devDependencies']) {
        for (const [name, version] of Object.entries(manifest[field] ?? {})) {
          if (version === 'workspace:*') continue;
          expect(lock, `${name}@${version} of ${file} is not in the lockfile`).toContain(`${name}@${version}`);
        }
      }
    }
  });

  it('no dependency comes from anywhere but the registry', () => {
    const lock = read('pnpm-lock.yaml');
    expect(lock).not.toMatch(/resolution: \{[^}]*(?:tarball: (?!https:\/\/registry\.npmjs\.org\/)|repo:|type: git)/);
    expect(lock).not.toMatch(/(?:git\+|github:|file:|https?:\/\/(?!registry\.npmjs\.org\/))[^\s'"]*\.(?:git|tgz)/);
  });
});
