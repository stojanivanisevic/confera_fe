// The schemas of the template editor (ADR-12, M2-FE-05): the closed format of confera_be as
// ProseMirror nodes and marks, and nothing else. What the format does not have cannot be
// made, typed or pasted: an image, a table, a colour, a link to `http:` or `javascript:`.
//
//   format             editor
//   paragraph          paragraph               a textblock
//   heading 1-3        heading { level }       a textblock
//   bulletList         bulletList > listItem   a list item holds inline content, as in the format
//   numberedList       numberedList > listItem
//   conditional        conditional { key }     blocks shown only when the condition holds
//   text + marks       text + bold/italic/underline
//   link               a link mark { href | the secure link } on text only
//   hardBreak          hardBreak
//   placeholder        placeholder { key }     ONE indivisible object: an atom, no text inside,
//                                              no mark, deleted and moved as a whole
//   image              image { fileId, alt }   an email image of the organisation (0.4.0): an atom
//                                              block. Only an image this editor put on the clipboard
//                                              is read back from a paste; any other <img>, a remote
//                                              address or an embedded data: image, is dropped (ADR-12)
// The subject is one line of text and placeholders, without marks.
import { Schema, type DOMOutputSpec, type MarkSpec, type NodeSpec } from 'prosemirror-model';

import { isTypedLink } from '@confera/api-client';

/** The address a link mark carries for the secure link of the message (`{ placeholder: 'link' }` in the format). */
export const SECURE_LINK = 'confera:secure-link';

/** The id of an email image, as the format has it. */
export const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const placeholder: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: '',
  attrs: { key: { validate: 'string' } },
  toDOM: (node): DOMOutputSpec => ['span', { 'data-placeholder': node.attrs.key as string, contenteditable: 'false' }, `{${node.attrs.key as string}}`],
  parseDOM: [{ tag: 'span[data-placeholder]', getAttrs: (dom) => ({ key: (dom).dataset.placeholder ?? '' }) }],
  leafText: (node) => `{${node.attrs.key as string}}`,
};

const text: NodeSpec = { group: 'inline' };

export const bodySchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }, { tag: 'div', priority: 10 }] },
    heading: {
      group: 'block',
      content: 'inline*',
      defining: true,
      attrs: { level: { default: 1, validate: (value: unknown) => value === 1 || value === 2 || value === 3 } },
      toDOM: (node): DOMOutputSpec => [`h${String(node.attrs.level)}`, 0],
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
      ],
    },
    bulletList: { group: 'block', content: 'listItem+', toDOM: () => ['ul', 0], parseDOM: [{ tag: 'ul' }] },
    numberedList: { group: 'block', content: 'listItem+', toDOM: () => ['ol', 0], parseDOM: [{ tag: 'ol' }] },
    listItem: { content: 'inline*', defining: true, toDOM: () => ['li', 0], parseDOM: [{ tag: 'li' }] },
    conditional: {
      group: 'block',
      content: 'block*',
      defining: true,
      attrs: { key: { validate: 'string' } },
      toDOM: (node): DOMOutputSpec => ['section', { 'data-condition': node.attrs.key as string }, 0],
      parseDOM: [{ tag: 'section[data-condition]', getAttrs: (dom) => ({ key: (dom).dataset.condition ?? '' }) }],
    },
    text,
    hardBreak: { group: 'inline', inline: true, selectable: false, marks: '', toDOM: () => ['br'], parseDOM: [{ tag: 'br' }] },
    placeholder,
    image: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: { fileId: { validate: 'string' }, alt: { default: '', validate: 'string' } },
      // On the clipboard it is named by its id only, with no address: a paste elsewhere shows nothing to load.
      toDOM: (node): DOMOutputSpec => ['figure', { 'data-confera-image': node.attrs.fileId as string, 'data-alt': node.attrs.alt as string }],
      parseDOM: [{ tag: 'figure[data-confera-image]', getAttrs: (dom) => (IMAGE_ID.test(dom.dataset.conferaImage ?? '') ? { fileId: dom.dataset.conferaImage, alt: dom.dataset.alt ?? '' } : false) }],
    },
  },
  marks: {
    // The order here is the order of the marks in a saved text node: bold, italic, underline.
    bold: { toDOM: () => ['strong', 0], parseDOM: [{ tag: 'strong' }, { tag: 'b' }] } satisfies MarkSpec,
    italic: { toDOM: () => ['em', 0], parseDOM: [{ tag: 'em' }, { tag: 'i' }] } satisfies MarkSpec,
    underline: { toDOM: () => ['u', 0], parseDOM: [{ tag: 'u' }] } satisfies MarkSpec,
    link: {
      attrs: { href: { validate: 'string' } },
      inclusive: false,
      toDOM: (mark): DOMOutputSpec => ['a', { href: mark.attrs.href === SECURE_LINK ? '#secure-link' : (mark.attrs.href as string), 'data-secure-link': mark.attrs.href === SECURE_LINK ? 'true' : null, rel: 'noopener noreferrer' }, 0],
      // Only an `https:` or `mailto:` address survives a paste; any other link is kept as its text.
      parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => (isTypedLink((dom).getAttribute('href') ?? '') ? { href: (dom).getAttribute('href') } : false) }],
    } satisfies MarkSpec,
  },
});

export const subjectSchema = new Schema({
  nodes: {
    doc: { content: 'inline*' },
    text,
    placeholder,
  },
  marks: {},
});
