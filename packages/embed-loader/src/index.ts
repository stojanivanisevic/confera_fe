// @confera/embed-loader: the snippet for conference sites and the frame's
// height reporter (ADR-07). With the snippet form of G2-17 (a) there is no
// remote loader script: what runs in a conference site is the few inline
// lines of the snippet itself.
export { clampHeight, FORM_SLUG_PATTERN, HEIGHT_MESSAGE, heightMessage, INTO_VIEW_MESSAGE, isFormSlug, MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT } from './protocol';
export type { HeightMessage, IntoViewMessage } from './protocol';
export { buildEmbedSnippet, EmbedSnippetError, frameId, listenerSource } from './snippet';
export type { EmbedSnippetOptions } from './snippet';
export { requestIntoView, startHeightReporter } from './frame';
export type { HeightReporterOptions, IntoViewOptions } from './frame';
