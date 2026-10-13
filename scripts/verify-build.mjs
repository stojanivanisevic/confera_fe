// Checks a finished production build (ADR-20, ADR-24; the frontend part of ST-02):
//   1. its routes are exactly the declared, non-dev routes (no gallery, no harness);
//   2. every route has a declared kind (ADR-28);
//   3. no dev-only text is anywhere in the build (dev tools are absent, not switched off);
//   4. no source map is public;
//   5. the framework settings of ADR-20 are what the build was made with.
//
//   node scripts/verify-build.mjs [distDir]      default: apps/web/.next
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { webDir } from './lib.mjs';

/** Routes the framework adds by itself. They render error pages only. */
export const FRAMEWORK_ROUTES = ['/_not-found', '/_global-error'];

/** Text that exists only in dev pages and spike fixtures. None of it may be in a production build. */
export const DEV_ONLY_MARKERS = ['dev/gallery', 'spike-abstract', 'spike-unlisted', 'dev-fixtures.dev', 'data-confera-dev'];

/** Pure part: compares the routes of a build with the declared routes. Returns a list of problems. */
export function checkRoutes(buildRoutes, declared) {
  const problems = [];
  const declaredAll = new Map(declared.routes.map((r) => [r.route, r]));
  const expected = new Set([...declared.routes.filter((r) => !r.planned).map((r) => r.route), ...FRAMEWORK_ROUTES]);
  for (const route of buildRoutes) {
    const entry = declaredAll.get(route);
    if (route === '/dev' || route.startsWith('/dev/')) problems.push(`dev-only route in a production build: ${route}`);
    else if (!entry && !FRAMEWORK_ROUTES.includes(route)) problems.push(`route without a declared kind (add it to routes.json): ${route}`);
    else if (entry?.planned) problems.push(`route is built but still marked as planned in routes.json: ${route}`);
  }
  for (const route of expected) {
    if (!buildRoutes.includes(route)) problems.push(`declared route is missing from the build: ${route}`);
  }
  for (const entry of declared.routes) {
    if (!entry.kind || !entry.surface) problems.push(`route without kind or surface in routes.json: ${entry.route}`);
  }
  return problems;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function verifyBuild(distDir) {
  const problems = [];
  if (!existsSync(join(distDir, 'BUILD_ID'))) return [`no build found in ${distDir}; run \`pnpm build\` first`];

  const declared = JSON.parse(readFileSync(join(webDir, 'src', 'server', 'security', 'routes.json'), 'utf8'));
  const appRoutes = Object.values(JSON.parse(readFileSync(join(distDir, 'app-path-routes-manifest.json'), 'utf8')));
  problems.push(...checkRoutes(appRoutes, declared));

  // Scan what is served and what runs on the server. `cache`, `trace*` and
  // `diagnostics` are build bookkeeping that never leaves the build machine.
  for (const part of ['static', 'server']) {
    const dir = join(distDir, part);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const name = relative(distDir, file);
      if (part === 'static' && file.endsWith('.map')) problems.push(`public source map: ${name}`);
      if (!/\.(js|mjs|css|html|json|rsc|txt|body|meta)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      if (part === 'static' && /[#@]\s*sourceMappingURL=/.test(text)) problems.push(`source map reference in a public file: ${name}`);
      for (const marker of DEV_ONLY_MARKERS) {
        if (text.includes(marker)) problems.push(`dev-only text "${marker}" in ${name}`);
      }
    }
  }

  const config = JSON.parse(readFileSync(join(distDir, 'required-server-files.json'), 'utf8')).config;
  if (config.poweredByHeader !== false) problems.push('poweredByHeader is not off');
  if (config.productionBrowserSourceMaps !== false) problems.push('productionBrowserSourceMaps is not off');
  if (config.images?.unoptimized !== true) problems.push('the image optimiser is not off');
  if (config.env?.CONFERA_DEV_PAGES !== '0') problems.push('the build was made with the dev pages');

  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const distDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(webDir, '.next');
  const problems = verifyBuild(distDir);
  if (problems.length > 0) {
    console.error(`✗ The production build is not what it must be:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('✓ Production build verified: declared routes only, no dev-only text, no public source map, ADR-20 settings.');
}
