// @vitest-environment jsdom
// M2-FE-05, the spike of the template editor (ADR-12): ProseMirror with the closed format of
// confera_be as its schema.
//   - every seeded template and every rendered vector loads and saves to the same document,
//     which the API's check accepts and the API's renderer renders as the vector says;
//   - a placeholder is one indivisible object: a leaf atom with no text inside and no mark;
//     a typed brace stays text (ST-22);
//   - the toolbar's commands make only what the format has, and pasted markup keeps only
//     that (no `javascript:` or `http:` link, no image).
import { DOMParser as SchemaParser } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection, type Command } from 'prosemirror-state';
import { afterEach, describe, expect, it } from 'vitest';

import { catalogueOf, checkBody, checkSubject, renderBody, renderSubject, TEMPLATE_RENDERED_VECTORS, type DocNode, type InlineNode, type SubjectNode } from '@confera/api-client';
import {
  bodyFromEditor,
  bodySchema,
  bodyToEditor,
  insertPlaceholder,
  mountBodyEditor,
  mountSubjectEditor,
  normaliseBody,
  normaliseSubject,
  removeLink,
  SECURE_LINK,
  setBlock,
  setLink,
  subjectFromEditor,
  subjectToEditor,
  toggleList,
  toggleTextMark,
  toolbarState,
} from './index';
import seededFile from '../../../e2e/servers/default-templates.json';

// The seeded defaults, as the stub of the browser tests serves them (a copy of prisma/seed/default-templates.json of confera_be).
const seeded = seededFile as unknown as { templates: Array<{ type: string; language: string; subject: SubjectNode; body: DocNode }> };

const paragraph = (...children: InlineNode[]): DocNode => ({ type: 'doc', children: [{ type: 'paragraph', children }] });
const stateOf = (doc: DocNode) => EditorState.create({ doc: bodyToEditor(doc) });
const apply = (state: EditorState, command: Command): EditorState => {
  let next = state;
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
};

describe('loading and saving does not change a document', () => {
  it.each(seeded.templates.map((template) => [`${template.type} (${template.language})`, template] as const))('the seeded template %s', (_name, template) => {
    const catalogue = catalogueOf(template.type);
    const body = bodyFromEditor(bodyToEditor(template.body));
    const subject = subjectFromEditor(subjectToEditor(template.subject));
    expect(body).toEqual(normaliseBody(template.body));
    expect(subject).toEqual(normaliseSubject(template.subject));
    expect(checkBody(body, catalogue)).toEqual(body);
    expect(checkSubject(subject, catalogue)).toEqual(subject);
  });

  it.each(TEMPLATE_RENDERED_VECTORS.map((vector) => [vector.name, vector] as const))('the vector "%s" renders as the API renders it after a round trip', (_name, vector) => {
    const catalogue = catalogueOf(vector.type);
    const body = bodyFromEditor(bodyToEditor(checkBody(vector.body, catalogue)));
    const subject = subjectFromEditor(subjectToEditor(checkSubject(vector.subject, catalogue)));
    const input = { values: vector.input.values, conditions: new Set(vector.input.conditions), link: vector.input.link };
    expect(renderSubject(checkSubject(subject, catalogue), input)).toBe(vector.expected.subject);
    expect(renderBody(checkBody(body, catalogue), input)).toEqual({ html: vector.expected.html, text: vector.expected.text });
  });
});

describe('a placeholder is one indivisible object', () => {
  const doc = paragraph({ type: 'text', text: 'Dear ' }, { type: 'placeholder', key: 'recipientName' }, { type: 'text', text: ',' });

  it('is a leaf atom of size 1 that takes no mark and holds no text', () => {
    const type = bodySchema.nodes.placeholder;
    expect(type.isAtom && type.isLeaf && type.isInline).toBe(true);
    expect(type.allowsMarkType(bodySchema.marks.bold)).toBe(false);
    expect(type.allowsMarkType(bodySchema.marks.link)).toBe(false);
    const node = bodyToEditor(doc).firstChild!.child(1);
    expect(node.nodeSize).toBe(1);
    expect(node.content.size).toBe(0);
  });

  it('bold over the whole line leaves the placeholder as it is', () => {
    let state = stateOf(doc);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)));
    state = apply(state, toggleTextMark('bold'));
    expect(bodyFromEditor(state.doc)).toEqual(paragraph({ type: 'text', text: 'Dear ', marks: ['bold'] }, { type: 'placeholder', key: 'recipientName' }, { type: 'text', text: ',', marks: ['bold'] }));
  });

  it('is selected and deleted as a whole', () => {
    let state = stateOf(doc);
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 6)));
    state = state.apply(state.tr.deleteSelection());
    expect(bodyFromEditor(state.doc)).toEqual(paragraph({ type: 'text', text: 'Dear ,' }));
  });

  it('is inserted at the cursor, and only from the catalogue the page offers', () => {
    let state = stateOf(paragraph({ type: 'text', text: 'Hello ' }));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7)));
    state = apply(state, insertPlaceholder('organisationName'));
    const body = bodyFromEditor(state.doc);
    expect(body).toEqual(paragraph({ type: 'text', text: 'Hello ' }, { type: 'placeholder', key: 'organisationName' }));
    expect(() => checkBody(bodyFromEditor(apply(state, insertPlaceholder('paymentLink')).doc), catalogueOf('invitation'))).toThrow(/unknown_placeholder/);
  });

  it('a typed brace is text, not a placeholder (ST-22)', () => {
    const parsed = SchemaParser.fromSchema(bodySchema).parse(Object.assign(document.createElement('div'), { innerHTML: '<p>Dear {{recipientName}} and {link}</p>' }));
    expect(bodyFromEditor(parsed)).toEqual(paragraph({ type: 'text', text: 'Dear {{recipientName}} and {link}' }));
  });
});

describe('the toolbar makes only what the format has', () => {
  it('headings, a paragraph again, and lists on and off', () => {
    let state = stateOf({ type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'one' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'two' }] }] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    state = apply(state, setBlock('heading2'));
    expect(toolbarState(state).block).toBe('heading2');
    state = apply(state, setBlock('paragraph'));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2, state.doc.content.size - 2)));
    state = apply(state, toggleList('bulletList'));
    expect(bodyFromEditor(state.doc)).toEqual({ type: 'doc', children: [{ type: 'bulletList', items: [{ type: 'listItem', children: [{ type: 'text', text: 'one' }] }, { type: 'listItem', children: [{ type: 'text', text: 'two' }] }] }] });
    expect(toolbarState(state).list).toBe('bulletList');
    state = apply(state, toggleList('numberedList'));
    expect(bodyFromEditor(state.doc).children[0]!.type).toBe('numberedList');
    state = apply(state, toggleList('numberedList'));
    expect(bodyFromEditor(state.doc)).toEqual({ type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'one' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'two' }] }] });
  });

  it('a typed link and the secure link of the message, and the link off again', () => {
    let state = stateOf(paragraph({ type: 'text', text: 'Set your password' }));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 18)));
    state = apply(state, setLink(SECURE_LINK));
    expect(bodyFromEditor(state.doc)).toEqual(paragraph({ type: 'link', href: { placeholder: 'link' }, children: [{ type: 'text', text: 'Set your password' }] }));
    expect(checkBody(bodyFromEditor(state.doc), catalogueOf('invitation'))).toBeTruthy();
    expect(() => checkBody(bodyFromEditor(state.doc), catalogueOf('security_notice'))).toThrow(/link_placeholder/);
    state = apply(state, setLink('https://example.test/help'));
    expect(bodyFromEditor(state.doc)).toEqual(paragraph({ type: 'link', href: 'https://example.test/help', children: [{ type: 'text', text: 'Set your password' }] }));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));
    state = apply(state, removeLink);
    expect(bodyFromEditor(state.doc)).toEqual(paragraph({ type: 'text', text: 'Set your password' }));
  });

  it('pasted markup keeps only the format: no script link, no http link, no image, no colour', () => {
    const html = '<p style="color:red"><a href="javascript:alert(1)">a</a> <a href="http://example.test/">b</a> <a href="https://example.test/">c</a><img src="x" onerror="alert(1)"><script>alert(1)</script></p><table><tr><td>d</td></tr></table>';
    const parsed = SchemaParser.fromSchema(bodySchema).parse(Object.assign(document.createElement('div'), { innerHTML: html }));
    const body = bodyFromEditor(parsed);
    expect(body).toEqual({
      type: 'doc',
      children: [
        { type: 'paragraph', children: [{ type: 'text', text: 'a b ' }, { type: 'link', href: 'https://example.test/', children: [{ type: 'text', text: 'c' }] }] },
        { type: 'paragraph', children: [{ type: 'text', text: 'd' }] },
      ],
    });
    expect(checkBody(body, catalogueOf('invitation'))).toEqual(body);
  });
});

describe('in a page', () => {
  let element: HTMLElement;
  afterEach(() => element.remove());

  it('the body and the subject mount as labelled text boxes and read back their documents', () => {
    element = document.body.appendChild(document.createElement('div'));
    const template = seeded.templates.find((t) => t.type === 'invitation' && t.language === 'en')!;
    const body = mountBodyEditor(element.appendChild(document.createElement('div')), template.body, { type: 'invitation', label: 'Message', placeholderLabel: (key) => `[${key}]` });
    const subject = mountSubjectEditor(element.appendChild(document.createElement('div')), template.subject, { type: 'invitation', label: 'Subject', placeholderLabel: (key) => `[${key}]` });
    const box = element.querySelector('[role="textbox"][aria-label="Message"]')!;
    expect(box.getAttribute('aria-multiline')).toBe('true');
    expect(element.querySelector('[role="textbox"][aria-label="Subject"]')!.getAttribute('aria-multiline')).toBe('false');
    expect(box.querySelector('[data-placeholder="recipientName"]')!.textContent).toBe('[recipientName]');
    expect(box.querySelector('[data-placeholder="recipientName"]')!.getAttribute('contenteditable')).toBe('false');
    expect(body.read()).toEqual({ ok: true, document: normaliseBody(template.body) });
    expect(subject.read()).toEqual({ ok: true, document: normaliseSubject(template.subject) });
    body.destroy();
    subject.destroy();
  });
});
