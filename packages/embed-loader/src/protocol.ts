/**
 * What the embed frame and the page around it agree on (ADR-07).
 * The frame tells its parent one thing only: how tall its content is.
 */

/** A form address part: lower-case letters, digits and hyphens. Nothing that could form a scheme, a host or a path. */
export const FORM_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function isFormSlug(value: unknown): value is string {
  return typeof value === 'string' && FORM_SLUG_PATTERN.test(value);
}

/** The only message type. */
export const HEIGHT_MESSAGE = 'confera:height';

/** A frame is never made shorter or taller than this by a message, in CSS pixels. */
export const MIN_FRAME_HEIGHT = 200;
export const MAX_FRAME_HEIGHT = 20000;

/** The whole message: a type and a height. Never form data, never a reference. */
export interface HeightMessage {
  readonly type: typeof HEIGHT_MESSAGE;
  readonly height: number;
}

/** A finite height, rounded and kept inside the bounds; null when the value is not a finite number. */
export function clampHeight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.round(value)));
}

export function heightMessage(height: number): HeightMessage | null {
  const clamped = clampHeight(height);
  return clamped === null ? null : { type: HEIGHT_MESSAGE, height: clamped };
}

/**
 * The frame asks the page around it to bring a part of the form into view (after Send). The whole
 * message: a type and how far down the frame that part starts, in CSS pixels. The snippet reads it
 * only once the product owner has decided that its lines may scroll the frame (decision D1).
 */
export const INTO_VIEW_MESSAGE = 'confera:into-view';

export interface IntoViewMessage {
  readonly type: typeof INTO_VIEW_MESSAGE;
  readonly top: number;
}
