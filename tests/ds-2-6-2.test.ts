// Design system 2.6.2: the application this system was extended for is named Congresa (the rename
// of 2026-10-31). Text only: every file of the release names it Congresa, except the changelog's
// history: the sections released under the old name, and the 2.6.2 section that records the rename.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, it } from 'vitest';

import { DS_VERSION } from '../packages/ui/src/generated/manifest';

const ds = join(process.cwd(), 'design-system');
const TEXT = /\.(?:md|json|css|js|ts|html|txt)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : TEXT.test(name) ? [path] : [];
  });
}

it('is version 2.6.2 or later', () => {
  const [major, minor, patch] = DS_VERSION.split('.').map(Number) as [number, number, number];
  expect(major * 10000 + minor * 100 + patch).toBeGreaterThanOrEqual(20602);
  expect(readFileSync(join(ds, 'CHANGELOG.md'), 'utf8')).toMatch(/^## 2\.6\.2 \(\d{4}-\d{2}-\d{2}\)$/m);
});

it('names the application Congresa, outside the history in the changelog', () => {
  const found: string[] = [];
  for (const file of files(ds)) {
    let text = readFileSync(file, 'utf8');
    if (relative(ds, file) === 'CHANGELOG.md') {
      // 2.6.2 records the rename; the sections below it were released under the old name.
      const released = text.indexOf('\n## 2.6.2 ');
      expect(released).toBeGreaterThan(0);
      text = text.slice(0, released);
    }
    // The repository keeps its name (confera_fe); the application does not.
    const rest = text.replace(/confera_(?:be|fe)/g, '');
    if (/confera/i.test(rest)) found.push(relative(ds, file));
  }
  expect(found).toEqual([]);
});
