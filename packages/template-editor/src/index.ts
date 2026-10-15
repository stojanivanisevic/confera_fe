// @confera/template-editor: the rich-text editor of mail templates (ADR-12, M2-FE-05 spike).
// ProseMirror with a schema that is the closed format of confera_be and nothing else; the
// toolbar is built in the page from design-system components. What the editor gives is a
// document of the format, checked by @confera/api-client as the API checks it.
export { bodySchema, subjectSchema, SECURE_LINK } from './schema';
export { bodyFromEditor, bodyToEditor, normaliseBody, normaliseSubject, subjectFromEditor, subjectToEditor } from './convert';
export {
  insertHardBreak,
  insertPlaceholder,
  liftOutOfCondition,
  redo,
  removeLink,
  setBlock,
  setLink,
  toggleList,
  toggleTextMark,
  toolbarState,
  undo,
  wrapInCondition,
  type BlockKind,
  type ListKind,
  type TextMark,
  type ToolbarState,
} from './commands';
export { mountBodyEditor, mountSubjectEditor, selectedPlaceholder, type Checked, type EditorHandle, type EditorOptions } from './editor';
