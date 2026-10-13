// ADR-20 framework settings and the production route allowlist (frontend part of ST-02).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { checkRoutes, FRAMEWORK_ROUTES } from '../scripts/verify-build.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const declared = JSON.parse(readFileSync(join(root, 'apps/web/src/server/security/routes.json'), 'utf8'));
const productionRoutes = [
  ...declared.routes.filter((r: { planned?: string }) => !r.planned).map((r: { route: string }) => r.route),
  ...FRAMEWORK_ROUTES,
];

describe('production route allowlist', () => {
  it('accepts exactly the declared production routes', () => {
    expect(checkRoutes(productionRoutes, declared)).toEqual([]);
  });

  it('fails when the gallery is in a production build', () => {
    expect(checkRoutes([...productionRoutes, '/dev/gallery'], declared).join('\n')).toMatch(/dev-only route in a production build: \/dev\/gallery/);
  });

  it('fails when a page has no declared kind', () => {
    expect(checkRoutes([...productionRoutes, '/harness'], declared).join('\n')).toMatch(/without a declared kind/);
  });

  it('fails when a declared route is missing', () => {
    expect(checkRoutes(productionRoutes.filter((r) => r !== '/sign-in'), declared).join('\n')).toMatch(/missing from the build: \/sign-in/);
  });
});

describe('framework settings (ADR-20)', () => {
  it('every package script that starts Next goes through the wrapper that turns telemetry off', () => {
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts as Record<string, string>;
    for (const [name, command] of Object.entries(scripts)) {
      expect(command, `script "${name}" calls next directly`).not.toMatch(/(^|\s)next(\s|$)/);
    }
    const wrapper = readFileSync(join(root, 'scripts/next.mjs'), 'utf8');
    expect(wrapper).toMatch(/NEXT_TELEMETRY_DISABLED: '1'/);
  });

  it('telemetry is reported as disabled by the framework itself', () => {
    const result = spawnSync(process.execPath, [join(root, 'scripts/next.mjs'), 'telemetry', 'status'], { cwd: root, encoding: 'utf8' });
    expect(`${result.stdout}${result.stderr}`).toMatch(/Status: Disabled/);
  });

  it('the configuration turns off the version header, public source maps and the image optimiser', () => {
    const config = readFileSync(join(root, 'apps/web/next.config.ts'), 'utf8');
    expect(config).toMatch(/poweredByHeader: false/);
    expect(config).toMatch(/productionBrowserSourceMaps: false/);
    expect(config).toMatch(/images: \{ unoptimized: true \}/);
  });

  it('the dev pages cannot be built or started on the prod stage', () => {
    const result = spawnSync(process.execPath, [join(root, 'scripts/next.mjs'), 'build', '--dev-pages'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, STAGE: 'prod' },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/cannot be built or started with STAGE=prod/);
  });
});
