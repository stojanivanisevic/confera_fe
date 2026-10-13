// `pnpm ds:snapshot`: writes the design-system release as a zip for the vault
// (ADR-21): .artifacts/udekom-design-system-v<version>.zip, with the same top
// folder as the version 1 zip.
//
// The zip is reproducible: entries are sorted, text has LF line endings and
// every entry carries the date of the release, so the same release always
// gives the same bytes and the same checksum. It refuses to run when the
// folder is not the recorded release (`pnpm ds:check` must pass).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

import { fail, root } from './lib.mjs';
import { checkDesignSystem } from './ds-check.mjs';
import { dsDir, paths, readText, releaseFiles, sha256 } from './ds-lib.mjs';

const { problems } = checkDesignSystem();
if (problems.length > 0) fail(`The design system is not a clean release:\n  - ${problems.join('\n  - ')}`);

const released = /^## (\d+\.\d+\.\d+) \((\d{4})-(\d{2})-(\d{2})\)$/m.exec(readText(paths.changelog));
if (!released) fail('design-system/CHANGELOG.md has no release heading.');
const [, version, year, month, day] = released;
const dosDate = ((Number(year) - 1980) << 9) | (Number(month) << 5) | Number(day);
const dosTime = 0;

const TEXT = /\.(md|json|js|css|ts|html|txt|sha256)$/;
const files = [...releaseFiles(), 'CHECKSUMS.sha256'].sort();
const local = [];
const central = [];
let offset = 0;

for (const file of files) {
  const raw = readFileSync(join(dsDir, file));
  const data = TEXT.test(file) ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : raw;
  const name = Buffer.from(`udekom-design-system/${file}`, 'utf8');
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0x0800, 6); // names are UTF-8
  header.writeUInt16LE(8, 8); // deflate
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0); // central directory entry
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(dosTime, 12);
  entry.writeUInt16LE(dosDate, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += header.length + name.length + packed.length;
}

const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...local, directory, end]);
const out = join(root, '.artifacts', `udekom-design-system-v${version}.zip`);
mkdirSync(join(root, '.artifacts'), { recursive: true });
writeFileSync(out, zip);

console.log(`design system ${version}: ${files.length} files`);
console.log(`  zip             ${out}`);
console.log(`  sha256 of zip   ${sha256(zip)}`);
console.log(`  release checksum (sha256 of CHECKSUMS.sha256, LF)   ${sha256(readText(paths.checksums).replace(/\r\n/g, '\n'))}`);
