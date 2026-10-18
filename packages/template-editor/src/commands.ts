// What the toolbar and the keys of the template editor do (M2-FE-05). Each command is a
// ProseMirror command: it says whether it applies, and changes the document only through a
// transaction, so undo and redo cover every change.
import { baseKeymap, chainCommands, setBlockType, splitBlock, toggleMark, wrapIn, lift } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { MarkType, Node as EditorNode, NodeType, Schema } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Command, type EditorState, type Plugin } from 'prosemirror-state';

import { bodySchema, SECURE_LINK, subjectSchema } from './schema';

const nodes = bodySchema.nodes;
const marks = bodySchema.marks;

export type TextMark = 'bold' | 'italic' | 'underline';
export type BlockKind = 'paragraph' | 'heading1' | 'heading2' | 'heading3';
export type ListKind = 'bulletList' | 'numberedList';

export const toggleTextMark = (mark: TextMark): Command => toggleMark(marks[mark]);

export const setBlock = (kind: BlockKind): Command =>
  kind === 'paragraph' ? setBlockType(nodes.paragraph) : setBlockType(nodes.heading, { level: Number(kind.slice(-1)) });

/** The list around the cursor: its node and position, when the cursor is in a list item. */
function listAround(state: EditorState): { node: EditorNode; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type === nodes.bulletList || node.type === nodes.numberedList) return { node, pos: $from.before(depth) };
  }
  return null;
}

/**
 * A list on or off. In a list of this kind: its items become paragraphs again. In a list of the
 * other kind: it changes its kind. Elsewhere: the selected paragraphs and headings become items.
 */
export const toggleList =
  (kind: ListKind): Command =>
  (state, dispatch) => {
    const listType = nodes[kind];
    const around = listAround(state);
    if (around) {
      if (dispatch) {
        const tr = state.tr;
        if (around.node.type === listType) {
          const paragraphs: EditorNode[] = [];
          around.node.forEach((item) => paragraphs.push((nodes.paragraph).create(null, item.content)));
          tr.replaceWith(around.pos, around.pos + around.node.nodeSize, paragraphs);
        } else {
          tr.setNodeMarkup(around.pos, listType);
        }
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) return false;
    const blocks: EditorNode[] = [];
    for (let index = range.startIndex; index < range.endIndex; index++) blocks.push(range.parent.child(index));
    if (blocks.length === 0 || !blocks.every((block) => block.isTextblock)) return false;
    if (dispatch) {
      const list = listType.create(
        null,
        blocks.map((block) => (nodes.listItem).create(null, block.content)),
      );
      const tr = state.tr.replaceWith(range.start, range.end, list);
      tr.setSelection(TextSelection.near(tr.doc.resolve(range.start + 2)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/** Enter in an empty list item: the item leaves the list as a paragraph after it. */
const leaveEmptyItem: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== nodes.listItem || $from.parent.content.size > 0) return false;
  const around = listAround(state);
  if (!around) return false;
  if (dispatch) {
    const itemStart = $from.before();
    const tr = state.tr.delete(itemStart, itemStart + $from.parent.nodeSize);
    const list = tr.doc.nodeAt(around.pos);
    const after = list ? around.pos + list.nodeSize : around.pos;
    if (list && list.childCount === 0) tr.delete(around.pos, after);
    const at = list && list.childCount === 0 ? around.pos : after;
    tr.insert(at, (nodes.paragraph).create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** A placeholder at the cursor: one object, never text. */
export const insertPlaceholder =
  (key: string, schema: Schema = bodySchema): Command =>
  (state, dispatch) => {
    const type = schema.nodes.placeholder as NodeType;
    const { $from } = state.selection;
    if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) return false;
    if (dispatch) dispatch(state.tr.replaceSelectionWith(type.create({ key }), false).scrollIntoView());
    return true;
  };

/** An email image as a block of its own, after the block of the cursor (ADR-12). */
export const insertImage =
  (fileId: string, alt: string): Command =>
  (state, dispatch) => {
    const type = nodes.image;
    const { $from } = state.selection;
    // After the block of the cursor that sits in the body or in a condition (never inside a list).
    let depth = $from.depth;
    while (depth > 1 && $from.node(depth - 1).type !== nodes.conditional) depth--;
    const at = $from.depth === 0 ? $from.pos : $from.after(depth);
    if (dispatch) {
      const tr = state.tr.insert(at, type.create({ fileId, alt }));
      tr.setSelection(NodeSelection.create(tr.doc, at));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

export const insertHardBreak: Command = (state, dispatch) => {
  const type = nodes.hardBreak;
  const { $from } = state.selection;
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(type.create(), false).scrollIntoView());
  return true;
};

/**
 * A link on the selected text: a typed `https:`/`mailto:` address, or `SECURE_LINK` for the
 * secure link of the message. With nothing selected, `label` is inserted with the link on it.
 */
export const setLink =
  (href: string, label?: string): Command =>
  (state, dispatch) => {
    const linkType = marks.link;
    const { from, to, empty } = state.selection;
    if (empty && !label) return false;
    if (dispatch) {
      const mark = linkType.create({ href });
      const tr = empty ? state.tr.insert(from, bodySchema.text(label ?? '', [mark])) : state.tr.removeMark(from, to, linkType).addMark(from, to, mark);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/** The link off, on the selection or on the whole link around the cursor. */
export const removeLink: Command = (state, dispatch) => {
  const linkType = marks.link;
  const { $from, from, to, empty } = state.selection;
  if (!empty) {
    if (!state.doc.rangeHasMark(from, to, linkType)) return false;
    if (dispatch) dispatch(state.tr.removeMark(from, to, linkType));
    return true;
  }
  const link = linkType.isInSet($from.marks());
  if (!link) return false;
  let start = $from.pos;
  let end = $from.pos;
  const parent = $from.parent;
  const offset = $from.start();
  parent.forEach((child, childOffset) => {
    if (link.isInSet(child.marks)) {
      const childStart = offset + childOffset;
      const childEnd = childStart + child.nodeSize;
      if (childEnd >= start && childStart <= end) {
        start = Math.min(start, childStart);
        end = Math.max(end, childEnd);
      }
    }
  });
  if (dispatch) dispatch(state.tr.removeMark(start, end, linkType));
  return true;
};

/** The selected blocks shown only when a condition holds (a type with conditions only). */
export const wrapInCondition = (key: string): Command => wrapIn(nodes.conditional, { key });
export const liftOutOfCondition: Command = lift;

export { undo, redo };

/** What the toolbar shows as on, off or unavailable. */
export interface ToolbarState {
  readonly marks: Readonly<Record<TextMark, boolean>>;
  readonly block: BlockKind | 'list' | 'mixed';
  readonly list: ListKind | null;
  readonly link: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function toolbarState(state: EditorState): ToolbarState {
  const { $from, from, to, empty } = state.selection;
  const has = (type: MarkType) => (empty ? Boolean(type.isInSet(state.storedMarks ?? $from.marks())) : state.doc.rangeHasMark(from, to, type));
  const parent = $from.parent;
  const list = listAround(state);
  const block: ToolbarState['block'] = list ? 'list' : parent.type === nodes.heading ? (`heading${String(parent.attrs.level)}` as BlockKind) : parent.type === nodes.paragraph ? 'paragraph' : 'mixed';
  const link = (marks.link).isInSet($from.marks());
  return {
    marks: { bold: has(marks.bold), italic: has(marks.italic), underline: has(marks.underline) },
    block,
    list: list ? (list.node.type.name as ListKind) : null,
    link: link ? (link.attrs.href as string) : null,
    canUndo: undo(state),
    canRedo: redo(state),
  };
}

/** The keys of the body: marks, undo, a line break with Shift+Enter, Enter that leaves an empty list item. */
export function bodyKeys(): Plugin[] {
  return [
    history(),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      'Mod-b': toggleTextMark('bold'),
      'Mod-i': toggleTextMark('italic'),
      'Mod-u': toggleTextMark('underline'),
      'Shift-Enter': insertHardBreak,
      Enter: chainCommands(leaveEmptyItem, splitBlock),
    }),
    keymap(baseKeymap),
  ];
}

/** The keys of the subject: one line, so Enter does nothing. */
export function subjectKeys(): Plugin[] {
  const none: Command = () => true;
  return [history(), keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo, Enter: none, 'Shift-Enter': none }), keymap(baseKeymap)];
}

export { SECURE_LINK, subjectSchema };
