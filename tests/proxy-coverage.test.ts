// Which responses pass the proxy (apps/web/src/proxy.ts), where every page gets the header set
// of its kind (ADR-28), and what is left to the framework. e2e/security-headers.spec.ts asks the
// running server; this holds the configuration that decides it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const web = join(root, 'apps', 'web');

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('what passes the proxy', () => {
  it('everything but the framework\'s own files under /_next/static/', () => {
    const proxy = readFileSync(join(web, 'src', 'proxy.ts'), 'utf8');
    expect(proxy).toContain("matcher: ['/((?!_next/static/).*)'],");
    expect(proxy.match(/matcher:/g)).toHaveLength(1);
  });

  it('those files are never sniffed as another type (next.config.ts)', () => {
    const config = readFileSync(join(web, 'next.config.ts'), 'utf8');
    expect(config).toContain("{ source: '/_next/static/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] }");
  });

  it('there is no route handler: no response of the application is made outside the pages and the forwarding of the proxy', () => {
    const handlers = filesUnder(join(web, 'src', 'app'))
      .filter((path) => /[\\/]route\.(?:[cm]?[jt]sx?)$/.test(path))
      .map((path) => relative(root, path).replaceAll('\\', '/'));
    expect(handlers).toEqual([]);
  });

  it('no file is served from public/: the one file at the root is declared as an asset', () => {
    expect(filesUnder(join(web, 'public'))).toEqual([]);
    const routes = JSON.parse(readFileSync(join(web, 'src', 'server', 'security', 'routes.json'), 'utf8')) as { routes: Array<{ route: string; kind: string }> };
    expect(routes.routes.filter((r) => r.kind === 'asset').map((r) => r.route)).toEqual(['/icon.png']);
  });
});
