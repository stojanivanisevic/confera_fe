// Small guards around @confera/ui that are cheap to check without a browser.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path));

describe('@confera/ui', () => {
  it('keeps its stylesheet entry out of tree shaking', () => {
    // Without this the bundler drops `import "@confera/ui/styles"` (a module
    // without exports) and the application is served with no design-system
    // styles and no fonts at all. e2e/ds-gallery.spec.ts proves the result in a browser.
    const pkg = JSON.parse(read('packages/ui/package.json').toString()) as { sideEffects: string[]; exports: Record<string, string> };
    expect(pkg.sideEffects).toContain('./src/styles.ts');
    expect(pkg.sideEffects).toContain('**/*.css');
    expect(pkg.exports['./styles']).toBe('./src/styles.ts');
  });

  it('loads the fonts, then the tokens, then the components, and nothing else', () => {
    const styles = read('packages/ui/src/styles.ts').toString();
    const imports = [...styles.matchAll(/^import '(.+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual([
      '../../../design-system/fonts/fonts.css',
      '../../../design-system/tokens.css',
      '../../../design-system/components/bundle.css',
    ]);
  });

  it('the site icon is the design-system mark, unchanged', () => {
    expect(read('apps/web/src/app/icon.png').equals(read('design-system/assets/Logos/udekom-mark.png'))).toBe(true);
  });
});
