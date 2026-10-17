// The bans of M1-FE-01 and ADR-20, held on the syntax tree of the application's own source.
//
// The lint (eslint.config.mjs) matches the usual spelling of each banned thing, and its
// planted violations prove that (tests/lint-fixtures.test.ts). A lint selector can be
// walked around by another spelling of the same thing: `el['innerHTML'] = x`,
// `el.setAttribute('srcdoc', x)`, `import('@mui/material')`, `process['env']`,
// `window.eval(x)`, a named colour inside `border: '1px solid red'`. None of these is
// reported by the lint today. This test reads every source file of the application as a
// syntax tree and holds the same bans in any spelling:
//
//   1. only the configuration module reads the environment (ADR-01);
//   2. raw markup is mentioned in the one reviewed component only (ADR-20, SEC-A-19);
//   3. application code imports from a reviewed list of modules: no second UI kit (NFR-UI-01);
//   4. inline styles and paint attributes are a reviewed list: no colour outside the tokens;
//   5. no code is made from text, and there is no server action (ADR-20).
//
// Each scan is first shown the spellings it must find.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'generated' || name.startsWith('.') ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The application's own source: the app and the packages, without generated files and tests. */
const files = ['apps', 'packages']
  .flatMap((group) => readdirSync(join(root, group)).map((name) => join(root, group, name, 'src')))
  .flatMap(sourceFiles)
  .map((path) => ({ name: relative(root, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }));

function parse(name: string, text: string): ts.SourceFile {
  return ts.createSourceFile(name, text, ts.ScriptTarget.ES2023, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
type Finding = string;
function scan(name: string, text: string, visit: (node: ts.Node, source: ts.SourceFile, add: (node: ts.Node, what: string) => void) => void): Finding[] {
  const source = parse(name, text);
  const findings: Finding[] = [];
  const add = (node: ts.Node, what: string) => findings.push(`${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${what}`);
  const walk = (node: ts.Node) => {
    visit(node, source, add);
    ts.forEachChild(node, walk);
  };
  walk(source);
  return findings;
}
const scanAll = (rule: (name: string, text: string) => Finding[]) => files.flatMap(({ name, text }) => rule(name, text));
const SAMPLE = 'apps/web/src/sample.tsx';

describe('the source tree', () => {
  it('is read: the app and the four packages', () => {
    expect(files.length).toBeGreaterThan(25);
    for (const part of ['apps/web/src/proxy.ts', 'packages/ui/src/index.ts', 'packages/form-renderer/src/FormRenderer.tsx', 'packages/embed-loader/src/snippet.ts', 'packages/api-client/src/index.ts']) {
      expect(files.map((file) => file.name)).toContain(part);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. The environment
// ---------------------------------------------------------------------------

/** What code may use of `process` without reaching the environment. */
const ALLOWED_PROCESS_MEMBERS = ['exit', 'exitCode'];
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'self', 'window']);
const PROCESS_MODULES = new Set(['process', 'node:process']);

function environmentAccesses(name: string, text: string): Finding[] {
  return scan(name, text, (node, source, add) => {
    if (ts.isIdentifier(node) && node.text === 'process') {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        if (!ALLOWED_PROCESS_MEMBERS.includes(parent.name.text)) add(node, `process.${parent.name.text}${ts.isPropertyAccessExpression(parent.parent) ? `.${parent.parent.name.text}` : ''}`);
      } else if ((ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isPropertyAssignment(parent) && parent.name === node)) {
        if (ts.isPropertyAccessExpression(parent) && ts.isIdentifier(parent.expression) && GLOBAL_OBJECTS.has(parent.expression.text)) add(node, `${parent.expression.text}.process`);
      } else {
        add(node, `"process" used as a value: ${parent.getText(source).slice(0, 60)}`);
      }
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && GLOBAL_OBJECTS.has(node.expression.text) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'process') {
      add(node, `${node.expression.text}['process']`);
    }
    if (ts.isMetaProperty(node) && node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'env') add(node, 'import.meta.env');
  }).concat(importsOf(name, text).filter(({ specifier }) => PROCESS_MODULES.has(specifier)).map(({ where, specifier }) => `${where}: import of "${specifier}"`));
}

describe('1. only the configuration module reads the environment (ADR-01)', () => {
  it.each([
    ['a member access', 'export const s = process.env.STAGE;'],
    ['a computed access', "export const s = process['env'].STAGE;"],
    ['destructuring', 'const { env } = process;\nexport const s = env.STAGE;'],
    ['a copy of the object', 'const p = process;\nexport const s = p.env.STAGE;'],
    ['globalThis', 'export const s = globalThis.process.env.STAGE;'],
    ['globalThis, computed', "export const s = globalThis['process'].env;"],
    ['a named import', "import { env } from 'node:process';\nexport const s = env.STAGE;"],
    ['a namespace import', "import * as p from 'process';\nexport const s = p.env.STAGE;"],
    ['a dynamic import', "export const s = async () => (await import('node:process')).env;"],
    ['the bundler variable', 'export const s = import.meta.env.STAGE;'],
    ['a public variable of the framework', 'export const s = process.env.NEXT_PUBLIC_API;'],
  ])('the scan finds %s', (_name, code) => {
    expect(environmentAccesses(SAMPLE, code).length).toBeGreaterThan(0);
  });

  it('and leaves ending the process alone', () => {
    expect(environmentAccesses(SAMPLE, 'process.exit(1);\nprocess.exitCode = 1;\nexport const o = { process: 1 };')).toEqual([]);
  });

  it('in the application the environment is read in the configuration module, and once more for the runtime the framework fills in', () => {
    expect(scanAll(environmentAccesses)).toEqual([
      'apps/web/src/config/env.ts:151: process.env',
      'apps/web/src/config/env.ts:151: process.env.CONFERA_DEV_PAGES',
      'apps/web/src/config/env.ts:157: process.env.NODE_ENV',
      // Not configuration: the framework replaces it at build time (see the comment in the file).
      'apps/web/src/instrumentation.ts:8: process.env.NEXT_RUNTIME',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. Raw markup
// ---------------------------------------------------------------------------

/** Names through which text becomes markup. Lower case; compared without regard to case. */
const RAW_MARKUP_NAMES = new Set([
  'innerhtml', 'outerhtml', 'insertadjacenthtml', 'dangerouslysetinnerhtml', 'srcdoc', 'createcontextualfragment',
  'sethtmlunsafe', 'parsehtmlunsafe', 'domparser', 'write', 'writeln',
]);
const REVIEWED_RAW_MARKUP_COMPONENT = 'packages/ui/src/reviewed/SandboxedMarkupFrame.tsx';

function rawMarkup(name: string, text: string): Finding[] {
  return scan(name, text, (node, _source, add) => {
    const named = (value: string) => RAW_MARKUP_NAMES.has(value.toLowerCase());
    // `document.write` only: "write" is an ordinary word elsewhere (a stream, a file).
    const isDocumentWrite = (value: string, at: ts.Node) =>
      /^write(?:ln)?$/i.test(value) && ts.isPropertyAccessExpression(at.parent) && at.parent.name === at && /(^|\.)document$/.test(at.parent.expression.getText());
    if (ts.isIdentifier(node) && named(node.text)) {
      if (/^write(?:ln)?$/i.test(node.text)) {
        if (isDocumentWrite(node.text, node)) add(node, `document.${node.text}`);
      } else add(node, node.text);
    }
    if (ts.isStringLiteralLike(node) && named(node.text) && !/^write(?:ln)?$/i.test(node.text)) add(node, `"${node.text}"`);
    // An address that is a document or a script in itself.
    if (ts.isStringLiteralLike(node) && /^\s*(?:data:text\/html|javascript:)/i.test(node.text)) add(node, `an address that is markup or code: "${node.text.slice(0, 30)}"`);
    if (ts.isTemplateHead(node) && /^\s*(?:data:text\/html|javascript:)/i.test(node.text)) add(node, 'an address that is markup or code, as a template');
  });
}

describe('2. raw markup is rendered by the one reviewed component only (ADR-20, SEC-A-19)', () => {
  it.each([
    ['the React property', 'export const F = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;'],
    ['the React property, spread', 'export const F = ({ h }: { h: string }) => <div {...{ dangerouslySetInnerHTML: { __html: h } }} />;'],
    ['an assignment', 'export const f = (el: HTMLElement, h: string) => { el.innerHTML = h; };'],
    ['a computed assignment', "export const f = (el: HTMLElement, h: string) => { el['innerHTML'] = h; };"],
    ['Object.assign', 'export const f = (el: HTMLElement, h: string) => { Object.assign(el, { innerHTML: h }); };'],
    ['outerHTML', 'export const f = (el: HTMLElement, h: string) => { el.outerHTML = h; };'],
    ['insertAdjacentHTML', "export const f = (el: HTMLElement, h: string) => { el.insertAdjacentHTML('beforeend', h); };"],
    ['a frame document as an attribute', 'export const F = ({ h }: { h: string }) => <iframe title="x" srcDoc={h} />;'],
    ['a frame document set as an attribute', "export const f = (el: HTMLIFrameElement, h: string) => { el.setAttribute('srcdoc', h); };"],
    ['a frame document as an address', "export const F = ({ h }: { h: string }) => <iframe title=\"x\" src={'data:text/html,' + h} />;"],
    ['a frame document as an address, in a template', 'export const F = ({ h }: { h: string }) => <iframe title="x" src={`data:text/html,${h}`} />;'],
    ['a script address', 'export const F = () => <a href="javascript:alert(1)">x</a>;'],
    ['a parser', "export const f = (h: string) => new DOMParser().parseFromString(h, 'text/html');"],
    ['a fragment from text', 'export const f = (h: string) => document.createRange().createContextualFragment(h);'],
    ['setHTMLUnsafe', 'export const f = (el: Element, h: string) => { (el as any).setHTMLUnsafe(h); };'],
    ['document.write', 'export const f = (h: string) => { document.write(h); };'],
    ['window.document.writeln', 'export const f = (h: string) => { window.document.writeln(h); };'],
  ])('the scan finds %s', (_name, code) => {
    expect(rawMarkup(SAMPLE, code).length).toBeGreaterThan(0);
  });

  it.each([
    ['text as text', 'export const F = ({ t }: { t: string }) => <p>{t}</p>;'],
    ['a stream that is written to', "export const f = (s: { write(t: string): void }) => { s.write('x'); };"],
    ['textContent', 'export const f = (el: HTMLElement, t: string) => { el.textContent = t; };'],
    ['an ordinary address', 'export const F = () => <a href="/sign-in">x</a>;'],
  ])('and leaves alone %s', (_name, code) => {
    expect(rawMarkup(SAMPLE, code)).toEqual([]);
  });

  it('in the application only the reviewed component mentions it, once', () => {
    expect(scanAll(rawMarkup)).toEqual([`${REVIEWED_RAW_MARKUP_COMPONENT}:41: srcDoc`]);
  });

  it('the reviewed component shows the markup in a frame with an empty sandbox and nothing else', () => {
    const text = files.find((file) => file.name === REVIEWED_RAW_MARKUP_COMPONENT)?.text ?? '';
    expect(text).toContain('sandbox=""');
    expect(text).not.toMatch(/allow-(?:scripts|same-origin|forms|popups|top-navigation)/);
  });
});

// ---------------------------------------------------------------------------
// 3. Imports
// ---------------------------------------------------------------------------

interface Import {
  where: string;
  specifier: string;
}

function importsOf(name: string, text: string): Import[] {
  const source = parse(name, text);
  const found: Import[] = [];
  const add = (node: ts.Node, specifier: string) => found.push({ where: `${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`, specifier });
  const walk = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node, node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0];
      add(node, argument && ts.isStringLiteralLike(argument) ? argument.text : '(a module name that is not written out)');
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) add(node, node.argument.literal.text);
    ts.forEachChild(node, walk);
  };
  walk(source);
  return found;
}

/**
 * Every module the application's own source may import. A new entry is a decision: it is
 * added here, in a diff a reviewer sees. No UI kit, no icon set, no styling library.
 */
const REVIEWED_MODULES: readonly RegExp[] = [
  /^\.{1,2}\//, // files of the same package
  /^@\//, // files of the web application
  /^#dev-fixtures$/,
  /^@confera\/(?:ui|form-renderer|embed-loader|api-client|template-editor)(?:\/(?:styles|gallery))?$/, // the internal packages, by their public entries (the template editor since 0.2.0)
  /^react$/,
  /^react-dom\/server$/,
  /^next$/,
  /^next\/(?:navigation|link|server|server\.js|headers|font\/local)$/, // `next/link` since 0.2.0: the links of the admin screens
  /^node:(?:http|https|stream|net)$/,
  /^openapi-fetch$/, // the typed API client (ADR-19)
  /^prosemirror-(?:model|state|view|commands|keymap|history)$/, // the rich-text engine of the template editor (ADR-12, M2-FE-05): no UI of its own, the toolbar is the design system's
];

describe('3. application code imports from a reviewed list: no second UI kit (NFR-UI-01)', () => {
  /** The design-system folder and the inside of the adapter, by whatever path (ADR-21). */
  const DESIGN_SYSTEM_INTERNALS = /(?:^|\/)design-system\/|(?:^|\/)packages\/ui\/src\/|^@confera\/ui\/src\//;
  const unreviewed = (name: string, text: string) =>
    importsOf(name, text)
      .filter(({ specifier }) => DESIGN_SYSTEM_INTERNALS.test(specifier) || !REVIEWED_MODULES.some((pattern) => pattern.test(specifier)))
      .map(({ where, specifier }) => `${where}: ${specifier}`);

  it.each([
    ['a UI kit', "import { Button } from '@mui/material';\nexport { Button };"],
    ['a UI kit, types only', "import type { ButtonProps } from 'antd';\nexport type P = ButtonProps;"],
    ['a UI kit, loaded when needed', "export const load = () => import('@radix-ui/react-dialog');"],
    ['a UI kit, required', "export const kit = require('@chakra-ui/react');"],
    ['a UI kit, re-exported', "export * from '@headlessui/react';"],
    ['a UI kit as a type import', "export type P = import('@mantine/core').ButtonProps;"],
    ['an icon set', "import { X } from 'lucide-react';\nexport { X };"],
    ['a styling library', "import styled from 'styled-components';\nexport { styled };"],
    ['Tailwind', "import 'tailwindcss/tailwind.css';"],
    ['a module whose name is built', 'export const load = (name: string) => import(name);'],
    ['the design-system folder itself', "import '../../../design-system/components/bundle.css';"],
    ['the inside of the adapter', "import x from '@confera/ui/src/generated/udekom.client.js';\nexport { x };"],
    ['the inside of the adapter, by its path', "import { x } from '../../../packages/ui/src/labels';\nexport { x };"],
  ])('the scan finds %s', (_name, code) => {
    expect(unreviewed('apps/web/src/sample.tsx', code).length).toBeGreaterThan(0);
  });

  it('in the application every import is on the list', () => {
    // packages/ui is the adapter: it alone reaches into the design-system folder.
    const outside = files.filter((file) => !file.name.startsWith('packages/ui/src/')).flatMap(({ name, text }) => unreviewed(name, text));
    expect(outside).toEqual([]);
  });

  it('the adapter imports the design system, React and nothing else', () => {
    const adapter = files.filter((file) => file.name.startsWith('packages/ui/src/')).flatMap(({ name, text }) => importsOf(name, text).map(({ specifier }) => specifier));
    for (const specifier of new Set(adapter)) {
      expect(specifier, `packages/ui imports ${specifier}`).toMatch(/^\.{1,2}\/|^react$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Inline styles and paint attributes
// ---------------------------------------------------------------------------

const PAINT_ATTRIBUTES = new Set(['style', 'fill', 'stroke', 'color', 'bgcolor', 'stopcolor', 'floodcolor', 'lightingcolor']);

function inlinePaint(name: string, text: string): Finding[] {
  return scan(name, text, (node, source, add) => {
    if (ts.isJsxAttribute(node) && PAINT_ATTRIBUTES.has(node.name.getText(source).toLowerCase().replaceAll('-', ''))) add(node, `${node.name.getText(source)}=`);
    // `element.style.x = ...` and `element.style.setProperty(...)` in the application's own scripts.
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'style' && ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) add(node, `.style.${node.parent.name.text}`);
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'style' && ts.isObjectLiteralExpression(node.initializer)) add(node, 'style: {…}');
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'setAttribute') {
      const attribute = node.arguments[0];
      if (attribute && ts.isStringLiteralLike(attribute) && PAINT_ATTRIBUTES.has(attribute.text.toLowerCase())) add(node, `setAttribute("${attribute.text}")`);
    }
  });
}

describe('4. inline styles and paint attributes are a reviewed list: colours come from the tokens (NFR-UI-01)', () => {
  it.each([
    ['a named colour', "export const F = () => <p style={{ color: 'red' }}>x</p>;"],
    ['a named colour in a shorthand', "export const F = () => <p style={{ border: '1px solid red' }}>x</p>;"],
    ['a named colour in a template', 'export const F = () => <p style={{ color: `red` }}>x</p>;'],
    ['a shadow', "export const F = () => <p style={{ boxShadow: '0 0 0 2px red' }}>x</p>;"],
    ['a colour held in a variable', "const c = 'red';\nexport const F = () => <p style={{ color: c }}>x</p>;"],
    ['a paint attribute of a drawing', 'export const F = () => <svg><rect fill="red" width="1" height="1" /></svg>;'],
    ['a stroke', 'export const F = () => <svg><path stroke="blue" d="M0 0" /></svg>;'],
    ['a style set from a script', "export const f = (el: HTMLElement) => { el.style.color = 'red'; };"],
    ['a style property set from a script', "export const f = (el: HTMLElement) => { el.style.setProperty('color', 'red'); };"],
    ['a style attribute set from a script', "export const f = (el: HTMLElement) => { el.setAttribute('style', 'color:red'); };"],
    ['a style handed to createElement', "import { createElement } from 'react';\nexport const F = () => createElement('p', { style: { color: 'red' } });"],
  ])('the scan finds %s', (_name, code) => {
    expect(inlinePaint(SAMPLE, code).length).toBeGreaterThan(0);
  });

  it('in the application there is one: the reviewed frame passes on a style its caller gives it', () => {
    expect(scanAll(inlinePaint)).toEqual([`${REVIEWED_RAW_MARKUP_COMPONENT}:36: style=`]);
  });

  it('the snippet for conference sites sets the height of its own frame and no colour', () => {
    // It is text that runs in the conference site (ADR-07), so the scan above does not read it as code.
    const snippet = files.find((file) => file.name === 'packages/embed-loader/src/snippet.ts')?.text ?? '';
    const styles = [...snippet.matchAll(/style\.(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2]})`);
    expect(styles).toEqual(['setProperty("height",h+"px","important")']);
    expect(snippet).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Code from text, server actions
// ---------------------------------------------------------------------------

function codeFromText(name: string, text: string): Finding[] {
  return scan(name, text, (node, _source, add) => {
    if (ts.isIdentifier(node) && node.text === 'eval') add(node, 'eval');
    if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') add(node, 'Function()');
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isIdentifier(node.expression) ? node.expression.text : '';
      const first = node.arguments[0];
      if (/^set(?:Timeout|Interval)$/.test(callee) && first && !ts.isArrowFunction(first) && !ts.isFunctionExpression(first) && !ts.isIdentifier(first) && !ts.isPropertyAccessExpression(first)) add(node, `${callee} with something that is not a function`);
    }
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'use server') add(node, "'use server'");
  });
}

describe('5. no code from text, no server action (ADR-20)', () => {
  it.each([
    ['eval', 'export const f = (c: string) => eval(c);'],
    ['eval, called indirectly', 'export const f = (c: string) => (0, eval)(c);'],
    ['window.eval', 'export const f = (c: string) => window.eval(c);'],
    ['a function from text', "export const f = (c: string) => new Function('a', c);"],
    ['a function from text, without new', 'export const f = (c: string) => Function(c)();'],
    ['a timer with text', "export const f = () => setTimeout('alert(1)', 0);"],
    ['a timer with built text', "export const f = (c: string) => window.setInterval('x' + c, 10);"],
    ['a server action in a file', "'use server';\nexport async function save() { return 1; }"],
    ['a server action in a function', "export async function save() {\n  'use server';\n  return 1;\n}"],
  ])('the scan finds %s', (_name, code) => {
    expect(codeFromText(SAMPLE, code).length).toBeGreaterThan(0);
  });

  it('and leaves a timer with a function alone', () => {
    expect(codeFromText(SAMPLE, 'const g = () => 1;\nsetTimeout(() => g(), 10);\nsetTimeout(g, 10);\nwindow.setInterval(function () { g(); }, 10);')).toEqual([]);
  });

  it('in the application there is none', () => {
    expect(scanAll(codeFromText)).toEqual([]);
  });

  it('the snippet for conference sites runs no text as code either', () => {
    const snippet = files.find((file) => file.name === 'packages/embed-loader/src/snippet.ts')?.text ?? '';
    const lines = snippet.split('\n').filter((line) => /^\s*['`]/.test(line)); // the lines that are the inline script
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.join('\n')).not.toMatch(/\beval\b|\bFunction\b|setTimeout|setInterval|innerHTML|document\.write|import\(/);
  });
});
