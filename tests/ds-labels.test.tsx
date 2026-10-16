// M1-FE-06: no fixed English string remains in a component. Every text a
// component writes by itself comes from the labels and can be translated.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain Node script without type declarations
import { fixedTexts } from '../scripts/ds-build.mjs';
import * as U from '../packages/ui/src/generated/udekom.client';
import { LABELS_SR } from '../packages/ui/src/labels';

const bundle = readFileSync(fileURLToPath(new URL('../design-system/components/bundle.js', import.meta.url)), 'utf8');
const EN = U.defaultLabels;
const keys = Object.keys(EN) as Array<keyof U.UdekomLabels>;
const text = (element: ReactElement) => renderToStaticMarkup(element);

describe('no fixed text in the bundle', () => {
  it('the scan finds no text outside the labels', () => {
    expect(fixedTexts(bundle)).toEqual([]);
  });

  it('the scan does find such text when it is there (the shapes version 1 had)', () => {
    const v1 = 'h("button", { "aria-label": "Close" }); h("span", null, from + " of " + total); h("p", null, "Drop files here or click to choose");';
    expect(fixedTexts(v1)).toEqual(['Close', ' of ', 'Drop files here or click to choose']);
  });

  it('the scan is not fooled by class names, keys and selectors', () => {
    expect(fixedTexts('cx("ud-icon-btn ud-shell__menu"); e.key === "ArrowRight"; q("input, select, textarea, button:not([data-close])");')).toEqual([]);
  });
});

describe('the Serbian catalogue', () => {
  it('has exactly the keys of the English defaults', () => {
    expect(Object.keys(LABELS_SR).sort()).toEqual([...keys].sort());
  });

  it.each(keys)('%s keeps the parts in braces of the English text', (key) => {
    const parts = (value: string) => [...value.matchAll(/\{[a-z]+\}/g)].map((m) => m[0]).sort();
    expect(parts(LABELS_SR[key])).toEqual(parts(EN[key]));
    expect(LABELS_SR[key].trim()).not.toBe('');
  });
});

describe('every built-in text can be translated', () => {
  // Components rendered with no text of the caller's own where a built-in text would show.
  const everything = (
    <div>
      <U.ArrowButton direction="left" />
      <U.ArrowButton />
      <U.Tag onRemove={() => undefined}>Tema</U.Tag>
      <U.Tag onRemove={() => undefined}><b>Tema</b></U.Tag>
      <U.FileButton />
      <U.PasswordField label="Lozinka" />
      <U.SearchField value="x" onChange={() => undefined} onClear={() => undefined} />
      <U.FileDropzone files={[{ name: 'rad.docx', size: 10, progress: 40 }]} onRemove={() => undefined} />
      <U.Spinner />
      <U.DataTable columns={[{ key: 'a', header: 'A' }]} rows={[]} selectable />
      <U.DataTable columns={[{ key: 'a', header: 'A' }]} rows={[{ id: 1, a: 'x' }]} selectable />
      <U.DataTable columns={[{ key: 'a', header: 'A' }]} rows={[]} filtered onClearFilters={() => undefined} />
      <U.Pagination page={2} pageSize={10} total={48} pageSizeOptions={[10, 25]} />
      <U.Alert onClose={() => undefined}>Tekst</U.Alert>
      <U.Dialog open title="Naslov" onClose={() => undefined} />
      <U.ConfirmDialog open title="Naslov" busy onConfirm={() => undefined} onCancel={() => undefined} />
      <U.Drawer open title="Naslov" onClose={() => undefined} />
      <U.Breadcrumbs items={[{ label: 'A', href: '#a' }, { label: 'B' }]} />
      <U.Menu items={[]} />
      <U.SidebarNav items={[]} />
      <U.AppShell sidebar={null}>Sadržaj</U.AppShell>
      <U.Repeater items={[{ key: 1 }, { key: 2 }]} onChange={() => undefined} renderRow={() => null} />
      <U.PermissionMatrix roles={[{ id: 'r', name: 'Uloga' }]} permissions={[{ name: 'p', label: 'Pravo' }]} value={{}} />
      <U.FilterBar onReset={() => undefined}>x</U.FilterBar>
    </div>
  );
  // Built-in texts that need an interaction to appear (a toast, an open listbox, a shown password)
  // are covered by the bundle scan above: they are read from the same labels.
  // `table` names a DataTable's scroll area only while it scrolls, which needs a measured layout (2.4.0; tests/ds-2-4-0.test.tsx).
  const NOT_IN_STATIC_MARKUP: Array<keyof U.UdekomLabels> = ['hidePasswordText', 'noMatches', 'search', 'confirm', 'table'];

  const english = text(everything);
  const serbian = text(<U.LabelsProvider labels={LABELS_SR}>{everything}</U.LabelsProvider>);
  const filled = (template: string) => template.replace(/\{[a-z]+\}/g, '\u0000').split('\u0000').filter((part) => part.trim().length > 1);

  it.each(keys.filter((k) => !NOT_IN_STATIC_MARKUP.includes(k)))('%s: the English text shows by default and the Serbian text replaces it', (key) => {
    for (const part of filled(EN[key])) expect(english, `default "${part}"`).toContain(part);
    for (const part of filled(LABELS_SR[key])) expect(serbian, `translated "${part}"`).toContain(part);
  });

  it('with the Serbian labels no English default is left anywhere', () => {
    const visible = serbian.replace(/<[^>]*>/g, ' ');
    const attributes = [...serbian.matchAll(/(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1]).join(' | ');
    for (const key of keys) {
      if (EN[key] === LABELS_SR[key]) continue; // "{role}: {permission}" has no words
      for (const part of filled(EN[key])) {
        const word = new RegExp(`(^|[^\\p{L}])${part.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u');
        expect(word.test(visible), `"${part}" is still shown`).toBe(false);
        expect(word.test(attributes), `"${part}" is still announced`).toBe(false);
      }
    }
  });

  it('texts with a part in braces are filled in', () => {
    expect(serbian).toContain('aria-label="Ukloni Tema"');
    expect(serbian).toContain('11–20 od 48');
    expect(serbian).toContain('aria-label="Otprema se rad.docx"');
    expect(serbian).toContain('aria-label="Ukloni 2"');
    expect(serbian).toContain('aria-label="Uloga: Pravo"');
  });

  it('the labels prop of one component wins over the provider, and its own text prop over both', () => {
    const html = text(
      <U.LabelsProvider labels={LABELS_SR}>
        <U.Dialog open title="T" onClose={() => undefined} labels={{ close: 'Schließen' }} />
        <U.FileButton buttonText="Odaberi" />
        <U.Spinner />
      </U.LabelsProvider>,
    );
    expect(html).toContain('aria-label="Schließen"');
    expect(html).toContain('Odaberi');
    expect(html).not.toContain('Izaberite fajl');
    expect(html).toContain('Učitavanje');
  });

  it('nested providers add to each other', () => {
    const html = text(
      <U.LabelsProvider labels={{ loading: 'Učitavanje' }}>
        <U.LabelsProvider labels={{ close: 'Zatvori' }}>
          <U.Spinner />
          <U.Dialog open title="T" onClose={() => undefined} />
        </U.LabelsProvider>
      </U.LabelsProvider>,
    );
    expect(html).toContain('Učitavanje');
    expect(html).toContain('aria-label="Zatvori"');
  });
});

describe('the two labels that were renamed in design system 2.1.0', () => {
  // A password field that hides its text shows the "show" button.
  const field = (labels?: U.PasswordFieldProps['labels']) => <U.PasswordField label="Lozinka" labels={labels} />;

  it('have their new names in the defaults, with the texts they had', () => {
    expect(EN.showPasswordText).toBe('Show password');
    expect(EN.hidePasswordText).toBe('Hide password');
    expect(keys).not.toContain('showPassword');
    expect(keys).not.toContain('hidePassword');
    expect(text(field())).toContain('aria-label="Show password"');
  });

  it('a list that still uses a name of 2.0 is understood, on a component and on a provider', () => {
    expect(text(field({ showPassword: 'invented-on-the-component' }))).toContain('aria-label="invented-on-the-component"');
    expect(text(<U.LabelsProvider labels={{ showPassword: 'invented-on-the-provider' }}>{field()}</U.LabelsProvider>)).toContain('aria-label="invented-on-the-provider"');
    // Both names are in the list of renamed labels: the "hide" text is read the same way once the field is shown.
    expect(bundle).toContain('var RENAMED_LABELS = { showPasswordText: "showPassword", hidePasswordText: "hidePassword" };');
  });

  it('the new name wins in a list that gives both, and the component still wins over the provider', () => {
    expect(text(field({ showPassword: 'invented-old-name', showPasswordText: 'Prikaži lozinku' }))).toContain('aria-label="Prikaži lozinku"');
    expect(text(<U.LabelsProvider labels={LABELS_SR}>{field({ showPassword: 'invented-on-the-component' })}</U.LabelsProvider>)).toContain('aria-label="invented-on-the-component"');
  });
});
