// The template document format of confera_be (ADR-12; ST-58, ST-22): a mail template is a
// document as data, never markup. The editor of the web application (M2-FE-05) makes such
// documents; this module checks them as the API checks them and renders them as the API
// renders them, so a preview shows what is sent and a refusal is known before the save.
//
// The format is the API's: `openapi/template-vectors.json` is vendored from
// `contracts/template-vectors.json` of confera_be by `pnpm api:sync` (generated there from
// src/modules/templates). The limits and the placeholder catalogue per type are read from
// that file, never written here; the algorithm is the server's (document.ts, render.ts), and
// tests/template-vectors.test.ts runs every vector, so the two repositories cannot drift apart.
import vectors from '../openapi/template-vectors.json';

export type Mark = 'bold' | 'italic' | 'underline';
export const MARKS: readonly Mark[] = ['bold', 'italic', 'underline'];

export interface TextNode {
  readonly type: 'text';
  readonly text: string;
  readonly marks?: readonly Mark[];
}
export interface HardBreakNode {
  readonly type: 'hardBreak';
}
export interface PlaceholderNode {
  readonly type: 'placeholder';
  readonly key: string;
}
export interface LinkNode {
  readonly type: 'link';
  readonly href: string | { readonly placeholder: 'link' };
  readonly children: readonly TextNode[];
}
export type InlineNode = TextNode | HardBreakNode | PlaceholderNode | LinkNode;

export interface ParagraphNode {
  readonly type: 'paragraph';
  readonly children: readonly InlineNode[];
}
export interface HeadingNode {
  readonly type: 'heading';
  readonly level: 1 | 2 | 3;
  readonly children: readonly InlineNode[];
}
export interface ListItemNode {
  readonly type: 'listItem';
  readonly children: readonly InlineNode[];
}
export interface ListNode {
  readonly type: 'bulletList' | 'numberedList';
  readonly items: readonly ListItemNode[];
}
export interface ConditionalNode {
  readonly type: 'conditional';
  readonly key: string;
  readonly children: readonly BlockNode[];
}
export type BlockNode = ParagraphNode | HeadingNode | ListNode | ConditionalNode;

export interface DocNode {
  readonly type: 'doc';
  readonly children: readonly BlockNode[];
}
export interface SubjectNode {
  readonly type: 'subject';
  readonly children: readonly (TextNode | PlaceholderNode)[];
}

export type DocumentErrorCode =
  | 'not_a_document'
  | 'too_large'
  | 'too_deep'
  | 'unknown_node'
  | 'unknown_attribute'
  | 'wrong_attribute'
  | 'unknown_placeholder'
  | 'unknown_condition'
  | 'link_scheme'
  | 'link_placeholder'
  | 'text_control_character'
  | 'subject_too_long';

/** What a check refuses, with the code the API gives and where. */
export class DocumentError extends Error {
  readonly code: DocumentErrorCode;
  readonly path: string;

  constructor(code: DocumentErrorCode, path: string) {
    super(`${code} at ${path}`);
    this.name = 'DocumentError';
    this.code = code;
    this.path = path;
  }
}

export interface Catalogue {
  readonly placeholders: ReadonlySet<string>;
  readonly conditions: ReadonlySet<string>;
}

interface TypeEntry {
  readonly placeholders: readonly string[];
  readonly conditions: readonly string[];
}

/** The version of the format this build was made with. */
export const TEMPLATE_FORMAT_VERSION: number = vectors.version;
export const DOCUMENT_LIMIT_BYTES: number = vectors.limits.documentBytes;
export const MAX_DEPTH: number = vectors.limits.depth;
export const SUBJECT_LIMIT: number = vectors.limits.subjectCharacters;
export const TEMPLATE_LANGUAGES: readonly string[] = vectors.languages;
const TYPES = vectors.types as Readonly<Record<string, TypeEntry>>;
export const TEMPLATE_TYPES: readonly string[] = Object.keys(TYPES);

/** The catalogue of a template type: the placeholders and conditions it may use. */
export function catalogueOf(type: string): Catalogue {
  const entry = Object.hasOwn(TYPES, type) ? TYPES[type] : undefined;
  return { placeholders: new Set(entry?.placeholders ?? []), conditions: new Set(entry?.conditions ?? []) };
}

/** A message of the type carries a secure link: the address of a link node. */
export const carriesLink = (type: string): boolean => catalogueOf(type).placeholders.has('link');

const SAFE_KEY = /^[a-z][A-Za-z0-9]{0,39}$/;
// The control characters and the Unicode line separators: never in a text of a template.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/u;
const TYPED_LINK = /^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+)$/u;

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function attributes(node: Record<string, unknown>, path: string, allowed: readonly string[]): void {
  for (const name of Object.keys(node)) {
    if (!allowed.includes(name)) throw new DocumentError('unknown_attribute', `${path}.${name}`);
  }
}

function checkKey(value: unknown, path: string, known: ReadonlySet<string>, code: DocumentErrorCode): string {
  // A key is looked up by name: a name of a prototype member must never pass as one.
  if (typeof value !== 'string' || !SAFE_KEY.test(value) || !known.has(value)) throw new DocumentError(code, path);
  return value;
}

/** A typed link address the format takes: `https:` or `mailto:`, without a space, quote or angle bracket. */
export const isTypedLink = (href: string): boolean => TYPED_LINK.test(href) && !CONTROL.test(href);

function checkText(node: unknown, path: string): TextNode {
  if (!isRecord(node) || node.type !== 'text') throw new DocumentError('unknown_node', path);
  attributes(node, path, ['type', 'text', 'marks']);
  if (typeof node.text !== 'string') throw new DocumentError('wrong_attribute', `${path}.text`);
  if (CONTROL.test(node.text)) throw new DocumentError('text_control_character', `${path}.text`);
  if (node.marks === undefined) return { type: 'text', text: node.text };
  if (!Array.isArray(node.marks) || !node.marks.every((mark) => MARKS.includes(mark as Mark))) throw new DocumentError('wrong_attribute', `${path}.marks`);
  return { type: 'text', text: node.text, marks: [...new Set(node.marks as Mark[])] };
}

function checkInline(node: unknown, path: string, catalogue: Catalogue, depth: number): InlineNode {
  if (depth > MAX_DEPTH) throw new DocumentError('too_deep', path);
  if (!isRecord(node) || typeof node.type !== 'string') throw new DocumentError('unknown_node', path);
  switch (node.type) {
    case 'text':
      return checkText(node, path);
    case 'hardBreak':
      attributes(node, path, ['type']);
      return { type: 'hardBreak' };
    case 'placeholder': {
      attributes(node, path, ['type', 'key']);
      // The secure link is the address of a link node, never a text placeholder.
      const key = checkKey(node.key, `${path}.key`, catalogue.placeholders, 'unknown_placeholder');
      if (key === 'link') throw new DocumentError('unknown_placeholder', `${path}.key`);
      return { type: 'placeholder', key };
    }
    case 'link': {
      attributes(node, path, ['type', 'href', 'children']);
      let href: LinkNode['href'];
      if (isRecord(node.href)) {
        attributes(node.href, `${path}.href`, ['placeholder']);
        if (node.href.placeholder !== 'link' || !catalogue.placeholders.has('link')) throw new DocumentError('link_placeholder', `${path}.href`);
        href = { placeholder: 'link' };
      } else if (typeof node.href === 'string' && isTypedLink(node.href)) {
        href = node.href;
      } else {
        throw new DocumentError('link_scheme', `${path}.href`);
      }
      if (!Array.isArray(node.children) || node.children.length === 0) throw new DocumentError('wrong_attribute', `${path}.children`);
      return { type: 'link', href, children: node.children.map((child, index) => checkText(child, `${path}.children[${String(index)}]`)) };
    }
    default:
      throw new DocumentError('unknown_node', path);
  }
}

function checkInlines(value: unknown, path: string, catalogue: Catalogue, depth: number): InlineNode[] {
  if (!Array.isArray(value)) throw new DocumentError('wrong_attribute', path);
  return value.map((child, index) => checkInline(child, `${path}[${String(index)}]`, catalogue, depth + 1));
}

function checkBlock(node: unknown, path: string, catalogue: Catalogue, depth: number): BlockNode {
  if (depth > MAX_DEPTH) throw new DocumentError('too_deep', path);
  if (!isRecord(node) || typeof node.type !== 'string') throw new DocumentError('unknown_node', path);
  switch (node.type) {
    case 'paragraph':
      attributes(node, path, ['type', 'children']);
      return { type: 'paragraph', children: checkInlines(node.children, `${path}.children`, catalogue, depth) };
    case 'heading': {
      attributes(node, path, ['type', 'level', 'children']);
      if (node.level !== 1 && node.level !== 2 && node.level !== 3) throw new DocumentError('wrong_attribute', `${path}.level`);
      return { type: 'heading', level: node.level, children: checkInlines(node.children, `${path}.children`, catalogue, depth) };
    }
    case 'bulletList':
    case 'numberedList': {
      attributes(node, path, ['type', 'items']);
      if (!Array.isArray(node.items)) throw new DocumentError('wrong_attribute', `${path}.items`);
      const items = node.items.map((item, index): ListItemNode => {
        const itemPath = `${path}.items[${String(index)}]`;
        if (!isRecord(item) || item.type !== 'listItem') throw new DocumentError('unknown_node', itemPath);
        attributes(item, itemPath, ['type', 'children']);
        return { type: 'listItem', children: checkInlines(item.children, `${itemPath}.children`, catalogue, depth + 1) };
      });
      return { type: node.type, items };
    }
    case 'conditional': {
      attributes(node, path, ['type', 'key', 'children']);
      const key = checkKey(node.key, `${path}.key`, catalogue.conditions, 'unknown_condition');
      return { type: 'conditional', key, children: checkBlocks(node.children, `${path}.children`, catalogue, depth) };
    }
    default:
      throw new DocumentError('unknown_node', path);
  }
}

function checkBlocks(value: unknown, path: string, catalogue: Catalogue, depth: number): BlockNode[] {
  if (!Array.isArray(value)) throw new DocumentError('wrong_attribute', path);
  return value.map((child, index) => checkBlock(child, `${path}[${String(index)}]`, catalogue, depth + 1));
}

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

/** Checks a body against the format and the catalogue; returns the document as data of its own. */
export function checkBody(value: unknown, catalogue: Catalogue): DocNode {
  if (typeof value === 'string' || !isRecord(value) || value.type !== 'doc') throw new DocumentError('not_a_document', '$');
  if (utf8Bytes(JSON.stringify(value)) > DOCUMENT_LIMIT_BYTES) throw new DocumentError('too_large', '$');
  attributes(value, '$', ['type', 'children']);
  return { type: 'doc', children: checkBlocks(value.children, '$.children', catalogue, 1) };
}

/** Checks a subject: one line of text and placeholders, without any line or control character. */
export function checkSubject(value: unknown, catalogue: Catalogue): SubjectNode {
  if (typeof value === 'string' || !isRecord(value) || value.type !== 'subject') throw new DocumentError('not_a_document', '$');
  attributes(value, '$', ['type', 'children']);
  if (!Array.isArray(value.children)) throw new DocumentError('wrong_attribute', '$.children');
  const children = value.children.map((child, index): TextNode | PlaceholderNode => {
    const path = `$.children[${String(index)}]`;
    const inline = checkInline(child, path, catalogue, 1);
    if (inline.type !== 'text' && inline.type !== 'placeholder') throw new DocumentError('unknown_node', path);
    if (inline.type === 'text' && /[\r\n\t]/.test(inline.text)) throw new DocumentError('text_control_character', `${path}.text`);
    return inline;
  });
  const length = children.reduce((sum, child) => sum + (child.type === 'text' ? child.text.length : 0), 0);
  if (length > SUBJECT_LIMIT) throw new DocumentError('subject_too_long', '$');
  return { type: 'subject', children };
}

// ---- rendering: the server's serialiser, for the preview --------------------------------

export interface RenderInput {
  /** The placeholder values, plain text. */
  readonly values: Readonly<Record<string, string>>;
  /** The conditions that hold. */
  readonly conditions: ReadonlySet<string>;
  /** The secure link of the message, when the type carries one. */
  readonly link?: string | undefined;
}

export class RenderError extends Error {
  readonly code: 'missing_value' | 'missing_link' | 'too_large';

  constructor(code: 'missing_value' | 'missing_link' | 'too_large') {
    super(code);
    this.name = 'RenderError';
    this.code = code;
  }
}

/** The rendered body must stay under this (ADR-12). */
export const RENDERED_LIMIT_BYTES = 100 * 1024;

export const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A placeholder value as one line of text: no line or control character survives.
const oneLine = (text: string): string => text.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/gu, ' ').trim();

function valueOf(key: string, input: RenderInput): string {
  const value = Object.hasOwn(input.values, key) ? input.values[key] : undefined;
  if (value === undefined) throw new RenderError('missing_value');
  return oneLine(value);
}

function linkOf(input: RenderInput): string {
  if (input.link === undefined) throw new RenderError('missing_link');
  return input.link;
}

const TAGS: Readonly<Record<Mark, string>> = { bold: 'strong', italic: 'em', underline: 'u' };

function inlineHtml(node: InlineNode, input: RenderInput): string {
  switch (node.type) {
    case 'text': {
      let html = escapeHtml(node.text);
      for (const mark of node.marks ?? []) html = `<${TAGS[mark]}>${html}</${TAGS[mark]}>`;
      return html;
    }
    case 'hardBreak':
      return '<br>';
    case 'placeholder':
      return escapeHtml(valueOf(node.key, input));
    case 'link': {
      const href = typeof node.href === 'string' ? node.href : linkOf(input);
      return `<a href="${escapeHtml(href)}">${node.children.map((child) => inlineHtml(child, input)).join('')}</a>`;
    }
  }
}

function inlineText(node: InlineNode, input: RenderInput): string {
  switch (node.type) {
    case 'text':
      return node.text;
    case 'hardBreak':
      return '\n';
    case 'placeholder':
      return valueOf(node.key, input);
    case 'link': {
      const href = typeof node.href === 'string' ? node.href : linkOf(input);
      const label = node.children.map((child) => inlineText(child, input)).join('');
      return label === href ? href : `${label} <${href}>`;
    }
  }
}

function blockHtml(node: BlockNode, input: RenderInput): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${node.children.map((child) => inlineHtml(child, input)).join('')}</p>`;
    case 'heading':
      return `<h${String(node.level)}>${node.children.map((child) => inlineHtml(child, input)).join('')}</h${String(node.level)}>`;
    case 'bulletList':
    case 'numberedList': {
      const tag = node.type === 'bulletList' ? 'ul' : 'ol';
      return `<${tag}>${node.items.map((item) => `<li>${item.children.map((child) => inlineHtml(child, input)).join('')}</li>`).join('')}</${tag}>`;
    }
    case 'conditional':
      return input.conditions.has(node.key) ? node.children.map((child) => blockHtml(child, input)).join('') : '';
  }
}

function blockText(node: BlockNode, input: RenderInput): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return node.children.map((child) => inlineText(child, input)).join('');
    case 'bulletList':
    case 'numberedList':
      return node.items.map((item, index) => `${node.type === 'bulletList' ? '-' : `${String(index + 1)}.`} ${item.children.map((child) => inlineText(child, input)).join('')}`).join('\n');
    case 'conditional':
      return input.conditions.has(node.key)
        ? node.children
            .map((child) => blockText(child, input))
            .filter((part) => part !== '')
            .join('\n\n')
        : '';
  }
}

/** Renders a body: the HTML of the message and its plain-text alternative. */
export function renderBody(document: DocNode, input: RenderInput): { html: string; text: string } {
  const html = document.children.map((block) => blockHtml(block, input)).join('\n');
  const text = document.children
    .map((block) => blockText(block, input))
    .filter((part) => part !== '')
    .join('\n\n');
  if (utf8Bytes(html) > RENDERED_LIMIT_BYTES) throw new RenderError('too_large');
  return { html, text: `${text}\n` };
}

/** Renders a subject: one line, with every placeholder value made one line too. */
export function renderSubject(subject: SubjectNode, input: RenderInput): string {
  return oneLine(subject.children.map((child) => (child.type === 'text' ? child.text : valueOf(child.key, input))).join(''));
}

// ---- the shared vectors ----------------------------------------------------------------

export interface RefusedVector {
  readonly name: string;
  readonly kind: 'body' | 'subject';
  readonly type: string;
  readonly document: unknown;
  readonly code: DocumentErrorCode;
}
export interface RenderedVector {
  readonly name: string;
  readonly type: string;
  readonly subject: unknown;
  readonly body: unknown;
  readonly input: { readonly values: Readonly<Record<string, string>>; readonly conditions: readonly string[]; readonly link?: string };
  readonly expected: { readonly subject: string; readonly html: string; readonly text: string };
}

export const TEMPLATE_REFUSED_VECTORS = vectors.refused as unknown as readonly RefusedVector[];
export const TEMPLATE_RENDERED_VECTORS = vectors.rendered as unknown as readonly RenderedVector[];
