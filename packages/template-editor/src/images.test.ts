// @vitest-environment jsdom
// M4-FE-03: images in the template editor, and what a paste may bring (ADR-12; ST-59, ST-60).
//   - an email image is a block of the format ({ type: 'image', fileId, alt }) that loads and saves unchanged;
//   - the format takes images only with a catalogue of 0.4.0, at most 5, with one line of words;
//   - a pasted remote image, an embedded data: image and any <img> of a web page are dropped, and the
//     page is told; only an image this editor put on the clipboard is read back; a pasted image file
//     goes to the page to upload, never into the document;
//   - a stored document with hostile strings runs nothing in the editor: every string is text.
import { DOMParser as SchemaParser } from 'prosemirror-model';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogueOf, checkBody, DocumentError, renderBody, type Catalogue, type DocNode } from '@confera/api-client';
import { bodyFromEditor, bodySchema, bodyToEditor, insertImage, mountBodyEditor, normaliseBody } from './index';

const ID = '0e2e9000-0000-4000-8000-000000000001';
const catalogue: Catalogue = { placeholders: new Set(['authorName']), conditions: new Set(['hasMessage']), images: true };
const withImage: DocNode = { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Dobrodošli' }] }, { type: 'image', fileId: ID, alt: 'Logo konferencije' }] };

const parseHtml = (html: string) => {
  return bodyFromEditor(SchemaParser.fromSchema(bodySchema).parse(Object.assign(document.createElement('div'), { innerHTML: html })));
};

let element: HTMLElement | null = null;
afterEach(() => {
  element?.remove();
  element = null;
});

describe('an email image in the format (ADR-12)', () => {
  it('loads into the editor and saves as the same document, which the check takes with a catalogue of 0.4.0', () => {
    expect(bodyFromEditor(bodyToEditor(withImage))).toEqual(normaliseBody(withImage));
    expect(checkBody(withImage, catalogue)).toEqual(withImage);
  });

  it('is refused by the vendored catalogue of 0.3.0, and beyond 5, with a bad id or words on two lines', () => {
    const code = (doc: unknown, with_: Catalogue = catalogue) => {
      try {
        checkBody(doc, with_);
        return 'taken';
      } catch (error) {
        return error instanceof DocumentError ? error.code : 'other';
      }
    };
    expect(code(withImage, catalogueOf('invitation'))).toBe('unknown_node');
    expect(code({ type: 'doc', children: Array.from({ length: 6 }, () => ({ type: 'image', fileId: ID, alt: 'x' })) })).toBe('too_many_images');
    expect(code({ type: 'doc', children: [{ type: 'image', fileId: 'https://evil.test/x.png', alt: 'x' }] })).toBe('wrong_attribute');
    expect(code({ type: 'doc', children: [{ type: 'image', fileId: ID, alt: 'a\nb' }] })).toBe('text_control_character');
    expect(code({ type: 'doc', children: [{ type: 'image', fileId: ID, alt: 'x', src: 'https://evil.test' }] })).toBe('unknown_attribute');
  });

  it('is inserted after the block of the cursor, never inside a list', () => {
    const element_ = document.createElement('div');
    document.body.append(element_);
    element = element_;
    const doc: DocNode = { type: 'doc', children: [{ type: 'bulletList', items: [{ type: 'listItem', children: [{ type: 'text', text: 'jedan' }] }] }] };
    const handle = mountBodyEditor(element_, doc, { type: 'x', label: 'Message', placeholderLabel: (key) => key, catalogue, imageSrc: (id) => `/api/v1/mail-images/${id}` });
    handle.run(insertImage(ID, 'Logo'));
    const read = handle.read();
    expect(read.ok && read.document.children.map((block) => block.type)).toEqual(['bulletList', 'image']);
    // In the page: the picture from the API's address behind the session, with its words.
    const img = element_.querySelector('figure[data-confera-image] img')!;
    expect(img.getAttribute('src')).toBe(`/api/v1/mail-images/${ID}`);
    expect(img.getAttribute('alt')).toBe('Logo');
    handle.destroy();
  });

  it('the client renders it by its id only (the server puts it into the message)', () => {
    const { html, text } = renderBody(withImage, { values: {}, conditions: new Set() });
    expect(html).toContain(`<img src="cid:${ID}" alt="Logo konferencije">`);
    expect(text).toContain('[Logo konferencije]');
  });
});

describe('what a paste may bring (ST-60)', () => {
  it('a remote image, an embedded data: image and a tracking pixel are dropped; the text stays', () => {
    const doc = parseHtml('<p>Pre <img src="https://evil.test/pixel.gif"> posle</p><img src="data:image/png;base64,iVBORw0KGgo="><p><img src="cid:x" onerror="alert(1)">kraj</p>');
    expect(JSON.stringify(doc)).not.toContain('image');
    expect(JSON.stringify(doc)).toContain('Pre ');
    expect(JSON.stringify(doc)).toContain('kraj');
  });

  it('only an image of this editor is read back, and only with an id of the format', () => {
    expect(parseHtml(`<figure data-confera-image="${ID}" data-alt="Logo"></figure>`).children).toEqual([{ type: 'image', fileId: ID, alt: 'Logo' }]);
    expect(JSON.stringify(parseHtml('<figure data-confera-image="https://evil.test/x.png" data-alt="Logo"></figure>'))).not.toContain('image');
  });

  it('the page is told when images of a web page were dropped, and an image file goes to the page to upload', () => {
    const element_ = document.createElement('div');
    document.body.append(element_);
    element = element_;
    const onImagesDropped = vi.fn();
    const onImageFile = vi.fn();
    const handle = mountBodyEditor(element_, { type: 'doc', children: [{ type: 'paragraph', children: [] }] }, { type: 'x', label: 'Message', placeholderLabel: (key) => key, catalogue, onImagesDropped, onImageFile, imageSrc: () => '' });
    const paste = (data: { html?: string; files?: File[] }) => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      const files = data.files ?? [];
      Object.defineProperty(event, 'clipboardData', {
        value: { files, types: data.html ? ['text/html'] : files.length > 0 ? ['Files'] : [], getData: (type: string) => (type === 'text/html' ? (data.html ?? '') : ''), items: [] },
      });
      handle.view.dom.dispatchEvent(event);
    };
    paste({ html: '<p>Tekst <img src="https://evil.test/a.png"></p>' });
    expect(onImagesDropped).toHaveBeenCalledTimes(1);
    const read = handle.read();
    expect(read.ok && JSON.stringify(read.document)).not.toContain('image');
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'slika.png', { type: 'image/png' });
    paste({ files: [file] });
    expect(onImageFile).toHaveBeenCalledWith(file);
    handle.destroy();
  });
});

describe('a stored document with hostile strings runs nothing in the editor (ST-59)', () => {
  it('every string is text: no element, no handler, no address is made of it', () => {
    const hostile = '<script>parent.document.body.dataset.pwned="editor"</script><img src=x onerror="document.body.dataset.pwned=1"> {{constructor}} javascript:alert(1)';
    const doc: DocNode = { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text: hostile }] }, { type: 'heading', level: 2, children: [{ type: 'text', text: '"><svg onload=alert(1)>' }] }] };
    const element_ = document.createElement('div');
    document.body.append(element_);
    element = element_;
    const handle = mountBodyEditor(element_, doc, { type: 'x', label: 'Message', placeholderLabel: (key) => key, catalogue });
    expect(element_.querySelector('script, img, svg, iframe, [onerror], [onload]')).toBeNull();
    expect(element_.textContent).toContain(hostile);
    expect(document.body.dataset.pwned).toBeUndefined();
    const read = handle.read();
    expect(read.ok && read.document).toEqual(doc);
    handle.destroy();
  });
});
