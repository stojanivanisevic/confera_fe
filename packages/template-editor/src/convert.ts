// A document of the format into the editor and back (ADR-12, M2-FE-05). Loading and saving
// must not change a document: for every seeded template and every rendered vector,
// `bodyFromEditor(bodyToEditor(doc))` is the document again (tests/template-editor.test.ts).
// The editor merges neighbouring texts with the same marks and keeps marks in one order, so
// "the same" is the same after `normaliseBody`, which does only that.
import { Mark as EditorMark, type Node as EditorNode } from 'prosemirror-model';

import { MARKS, type BlockNode, type DocNode, type InlineNode, type LinkNode, type Mark, type PlaceholderNode, type SubjectNode, type TextNode } from '@confera/api-client';

import { bodySchema, SECURE_LINK, subjectSchema } from './schema';

// ---- format -> editor --------------------------------------------------------------------

function textMarks(marks: readonly Mark[] | undefined, link: EditorMark | null): readonly EditorMark[] {
  const out = (marks ?? []).map((mark) => bodySchema.marks[mark].create());
  if (link) out.push(link);
  return EditorMark.setFrom(out);
}

function inlineToEditor(node: InlineNode): EditorNode[] {
  switch (node.type) {
    case 'text':
      return node.text === '' ? [] : [bodySchema.text(node.text, textMarks(node.marks, null))];
    case 'hardBreak':
      return [bodySchema.nodes.hardBreak.create()];
    case 'placeholder':
      return [bodySchema.nodes.placeholder.create({ key: node.key })];
    case 'link': {
      const link = bodySchema.marks.link.create({ href: typeof node.href === 'string' ? node.href : SECURE_LINK });
      return node.children.filter((child) => child.text !== '').map((child) => bodySchema.text(child.text, textMarks(child.marks, link)));
    }
  }
}

function blockToEditor(node: BlockNode): EditorNode {
  const inline = (children: readonly InlineNode[]) => children.flatMap(inlineToEditor);
  switch (node.type) {
    case 'paragraph':
      return bodySchema.nodes.paragraph.create(null, inline(node.children));
    case 'heading':
      return bodySchema.nodes.heading.create({ level: node.level }, inline(node.children));
    case 'bulletList':
    case 'numberedList':
      return bodySchema.nodes[node.type].create(
        null,
        node.items.map((item) => bodySchema.nodes.listItem.create(null, inline(item.children))),
      );
    case 'conditional':
      return bodySchema.nodes.conditional.create({ key: node.key }, node.children.map(blockToEditor));
  }
}

/** A body of the format as an editor document. An empty body becomes one empty paragraph. */
export function bodyToEditor(doc: DocNode): EditorNode {
  const blocks = doc.children.map(blockToEditor);
  return bodySchema.nodes.doc.create(null, blocks.length > 0 ? blocks : [bodySchema.nodes.paragraph.create()]);
}

/** A subject of the format as an editor document. */
export function subjectToEditor(subject: SubjectNode): EditorNode {
  return subjectSchema.nodes.doc.create(
    null,
    subject.children.flatMap((child) => (child.type === 'text' ? (child.text === '' ? [] : [subjectSchema.text(child.text)]) : [subjectSchema.nodes.placeholder.create({ key: child.key })])),
  );
}

// ---- editor -> format --------------------------------------------------------------------

function marksOf(node: EditorNode): Mark[] {
  return MARKS.filter((mark) => node.marks.some((m) => m.type.name === mark));
}

function textOf(node: EditorNode): TextNode {
  const marks = marksOf(node);
  return marks.length > 0 ? { type: 'text', text: node.text ?? '', marks } : { type: 'text', text: node.text ?? '' };
}

function inlineFromEditor(parent: EditorNode): InlineNode[] {
  const out: InlineNode[] = [];
  parent.forEach((child) => {
    if (child.type.name === 'hardBreak') {
      out.push({ type: 'hardBreak' });
      return;
    }
    if (child.type.name === 'placeholder') {
      out.push({ type: 'placeholder', key: child.attrs.key as string });
      return;
    }
    const link = child.marks.find((mark) => mark.type.name === 'link');
    if (!link) {
      out.push(textOf(child));
      return;
    }
    const href = link.attrs.href === SECURE_LINK ? ({ placeholder: 'link' } as const) : (link.attrs.href as string);
    const last = out.at(-1);
    // Neighbouring texts under the same link are one link node of the format.
    if (last?.type === 'link' && sameHref(last.href, href)) {
      out[out.length - 1] = { ...last, children: [...last.children, textOf(child)] };
    } else {
      out.push({ type: 'link', href, children: [textOf(child)] });
    }
  });
  return out;
}

const sameHref = (a: LinkNode['href'], b: LinkNode['href']): boolean => (typeof a === 'string' || typeof b === 'string' ? a === b : true);

function blockFromEditor(node: EditorNode): BlockNode {
  switch (node.type.name) {
    case 'heading':
      return { type: 'heading', level: node.attrs.level as 1 | 2 | 3, children: inlineFromEditor(node) };
    case 'bulletList':
    case 'numberedList': {
      const items: { type: 'listItem'; children: InlineNode[] }[] = [];
      node.forEach((item) => items.push({ type: 'listItem', children: inlineFromEditor(item) }));
      return { type: node.type.name, items };
    }
    case 'conditional': {
      const children: BlockNode[] = [];
      node.forEach((child) => children.push(blockFromEditor(child)));
      return { type: 'conditional', key: node.attrs.key as string, children };
    }
    default:
      return { type: 'paragraph', children: inlineFromEditor(node) };
  }
}

/** An editor document as a body of the format: what is checked and, later, saved. */
export function bodyFromEditor(doc: EditorNode): DocNode {
  const children: BlockNode[] = [];
  doc.forEach((block) => children.push(blockFromEditor(block)));
  return { type: 'doc', children };
}

/** An editor document as a subject of the format. */
export function subjectFromEditor(doc: EditorNode): SubjectNode {
  const children: (TextNode | PlaceholderNode)[] = [];
  doc.forEach((child) => children.push(child.type.name === 'placeholder' ? { type: 'placeholder', key: child.attrs.key as string } : { type: 'text', text: child.text ?? '' }));
  return { type: 'subject', children };
}

// ---- the same document, written the one way the editor writes it --------------------------

const sameMarks = (a: readonly Mark[] | undefined, b: readonly Mark[] | undefined): boolean => (a ?? []).join() === (b ?? []).join();

function normaliseTexts(children: readonly TextNode[]): TextNode[] {
  const out: TextNode[] = [];
  for (const child of children) {
    if (child.text === '') continue;
    const marks = MARKS.filter((mark) => child.marks?.includes(mark));
    const node: TextNode = marks.length > 0 ? { type: 'text', text: child.text, marks } : { type: 'text', text: child.text };
    const last = out.at(-1);
    if (last && sameMarks(last.marks, node.marks)) out[out.length - 1] = { ...last, text: last.text + node.text };
    else out.push(node);
  }
  return out;
}

function normaliseInline(children: readonly InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const child of children) {
    const last = out.at(-1);
    if (child.type === 'text') {
      const [node] = normaliseTexts([child]);
      if (!node) continue;
      if (last?.type === 'text' && sameMarks(last.marks, node.marks)) out[out.length - 1] = { ...last, text: last.text + node.text };
      else out.push(node);
    } else if (child.type === 'link') {
      const texts = normaliseTexts(child.children);
      if (texts.length === 0) continue;
      if (last?.type === 'link' && sameHref(last.href, child.href)) out[out.length - 1] = { ...last, children: normaliseTexts([...last.children, ...texts]) };
      else out.push({ type: 'link', href: child.href, children: texts });
    } else {
      out.push(child);
    }
  }
  return out;
}

function normaliseBlock(block: BlockNode): BlockNode {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return { ...block, children: normaliseInline(block.children) };
    case 'bulletList':
    case 'numberedList':
      return { ...block, items: block.items.map((item) => ({ ...item, children: normaliseInline(item.children) })) };
    case 'conditional':
      return { ...block, children: block.children.map(normaliseBlock) };
  }
}

/** The body as the editor writes it: neighbouring texts with the same marks joined, marks in one order. */
export function normaliseBody(doc: DocNode): DocNode {
  const children = doc.children.map(normaliseBlock);
  return { type: 'doc', children: children.length > 0 ? children : [{ type: 'paragraph', children: [] }] };
}

/** The subject as the editor writes it. */
export function normaliseSubject(subject: SubjectNode): SubjectNode {
  const out: (TextNode | PlaceholderNode)[] = [];
  for (const child of subject.children) {
    const last = out.at(-1);
    if (child.type === 'text') {
      if (child.text === '') continue;
      if (last?.type === 'text') out[out.length - 1] = { type: 'text', text: last.text + child.text };
      else out.push({ type: 'text', text: child.text });
    } else {
      out.push(child);
    }
  }
  return { type: 'subject', children: out };
}
