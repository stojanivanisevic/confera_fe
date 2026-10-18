// The template editor in a page (M2-FE-05): a ProseMirror view on an element of the page,
// with the schema of the format. The toolbar is the page's (design-system components); it
// calls `run` and reads `toolbar()`. What leaves the editor is a document of the format,
// checked as the API checks it.
import type { Node as EditorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, type Command } from 'prosemirror-state';
import { EditorView, type NodeView } from 'prosemirror-view';

import { catalogueOf, checkBody, checkSubject, DocumentError, type Catalogue, type DocNode, type SubjectNode } from '@confera/api-client';

import { bodyKeys, subjectKeys, toolbarState, type ToolbarState } from './commands';
import { bodyFromEditor, bodyToEditor, subjectFromEditor, subjectToEditor } from './convert';
import { bodySchema, subjectSchema } from './schema';

export interface EditorOptions {
  /** The template type: its catalogue decides which placeholders and conditions exist. */
  readonly type: string;
  /** The accessible name of the editable area. */
  readonly label: string;
  /** The id of the text that describes the editable area. */
  readonly describedBy?: string;
  /** The name a placeholder shows, by key ("Recipient's name"). */
  readonly placeholderLabel: (key: string) => string;
  /** Every change, and every move of the cursor. */
  readonly onChange?: () => void;
  /** The catalogue of the type as the API gives it (0.4.0); without one, the vendored one of the format. */
  readonly catalogue?: Catalogue;
  /** Where the page shows an email image (the API's address of it, read with the session). */
  readonly imageSrc?: (fileId: string) => string;
  /** An image file pasted or dropped into the body: the page uploads it and inserts it (ADR-12). */
  readonly onImageFile?: (file: File) => void;
  /** A paste held images of a web page (a remote address, an embedded data: image): they were dropped (ADR-12). */
  readonly onImagesDropped?: () => void;
}

export type Checked<T> = { readonly ok: true; readonly document: T } | { readonly ok: false; readonly code: string; readonly path: string };

export interface EditorHandle<T> {
  readonly view: EditorView;
  /** Runs a command of commands.ts on the editor and gives the focus back to it. */
  run(command: Command): boolean;
  /** Whether a command applies now (for the toolbar's disabled state). */
  can(command: Command): boolean;
  toolbar(): ToolbarState;
  /** The document of the format, checked against the format and the type's catalogue. */
  read(): Checked<T>;
  focus(): void;
  destroy(): void;
}

/** A placeholder in the page: one object with its name, not editable, selected and deleted as a whole. */
function placeholderView(label: (key: string) => string) {
  return (node: EditorNode): NodeView => {
    const dom = document.createElement('span');
    dom.dataset.placeholder = node.attrs.key as string;
    dom.setAttribute('contenteditable', 'false');
    dom.textContent = label(node.attrs.key as string);
    return {
      dom,
      selectNode: () => dom.classList.add('is-selected'),
      deselectNode: () => dom.classList.remove('is-selected'),
      ignoreMutation: () => true,
      stopEvent: () => false,
    };
  };
}

/** An email image in the page: the picture with its words, not editable, selected and deleted as a whole. */
function imageView(src: (fileId: string) => string) {
  return (node: EditorNode): NodeView => {
    const dom = document.createElement('figure');
    dom.dataset.conferaImage = node.attrs.fileId as string;
    dom.setAttribute('contenteditable', 'false');
    const img = document.createElement('img');
    img.src = src(node.attrs.fileId as string);
    img.alt = node.attrs.alt as string;
    img.draggable = false;
    dom.append(img);
    return {
      dom,
      selectNode: () => dom.classList.add('is-selected'),
      deselectNode: () => dom.classList.remove('is-selected'),
      ignoreMutation: () => true,
      stopEvent: () => false,
    };
  };
}

/** The image files of a paste or a drop. */
const imageFiles = (data: DataTransfer | null): File[] => [...(data?.files ?? [])].filter((file) => /^image\//.test(file.type));

function mount<T>(element: HTMLElement, doc: EditorNode, plugins: EditorState['plugins'], options: EditorOptions, read: (doc: EditorNode) => T, check: (value: T) => T, multiline: boolean, transformPastedText?: (text: string) => string): EditorHandle<T> {
  const state = EditorState.create({ doc, plugins });
  const view = new EditorView(element, {
    state,
    attributes: {
      role: 'textbox',
      'aria-multiline': multiline ? 'true' : 'false',
      'aria-label': options.label,
      ...(options.describedBy ? { 'aria-describedby': options.describedBy } : {}),
      spellcheck: 'true',
    },
    nodeViews: { placeholder: placeholderView(options.placeholderLabel), ...(multiline && options.imageSrc ? { image: imageView(options.imageSrc) } : {}) },
    // A pasted or dropped image file is uploaded by the page, never put in as data (ADR-12, ST-60).
    handlePaste: (_view, event) => {
      const files = imageFiles(event.clipboardData);
      if (files.length === 0) return false;
      if (multiline && options.onImageFile) for (const file of files) options.onImageFile(file);
      return true;
    },
    // Pasted markup keeps what the schema has; an image of a web page is never taken over, and the page says so.
    transformPastedHTML: (html) => {
      if (multiline && /<img[\s>](?![^>]*data-confera-image)/i.test(html)) options.onImagesDropped?.();
      return html;
    },
    handleDrop: (_view, event) => {
      const files = imageFiles((event).dataTransfer);
      if (files.length === 0) return false;
      if (multiline && options.onImageFile) for (const file of files) options.onImageFile(file);
      return true;
    },
    // Pasted markup keeps only what the schema has; a line of the subject stays one line.
    ...(transformPastedText ? { transformPastedText } : {}),
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction));
      options.onChange?.();
    },
  });
  return {
    view,
    run(command) {
      const done = command(view.state, view.dispatch, view);
      view.focus();
      return done;
    },
    can: (command) => command(view.state),
    toolbar: () => toolbarState(view.state),
    read() {
      try {
        return { ok: true, document: check(read(view.state.doc)) };
      } catch (error) {
        if (error instanceof DocumentError) return { ok: false, code: error.code, path: error.path };
        throw error;
      }
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

/** The body editor of a template of `options.type`, with `body` loaded. */
export function mountBodyEditor(element: HTMLElement, body: DocNode, options: EditorOptions): EditorHandle<DocNode> {
  const catalogue = options.catalogue ?? catalogueOf(options.type);
  return mount(element, bodyToEditor(body), bodyKeys(), options, bodyFromEditor, (value) => checkBody(value, catalogue), true);
}

/** The subject editor: one line of text and placeholders. */
export function mountSubjectEditor(element: HTMLElement, subject: SubjectNode, options: EditorOptions): EditorHandle<SubjectNode> {
  const catalogue = options.catalogue ?? catalogueOf(options.type);
  return mount(element, subjectToEditor(subject), subjectKeys(), options, subjectFromEditor, (value) => checkSubject(value, catalogue), false, (text) => text.replace(/\s+/g, ' '));
}

/** Whether the selection is one placeholder (the toolbar can say "Placeholder: Recipient's name"). */
export function selectedPlaceholder(handle: EditorHandle<unknown>): string | null {
  const selection = handle.view.state.selection;
  return selection instanceof NodeSelection && selection.node.type.name === 'placeholder' ? (selection.node.attrs.key as string) : null;
}

export { bodySchema, subjectSchema };
