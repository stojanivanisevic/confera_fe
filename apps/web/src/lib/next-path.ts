/**
 * The `next` rule (ADR-20, ST-26): after sign-in the browser goes to `next` only when it is
 * a path of this same origin. A full address, a protocol-relative one (`//evil`), a backslash
 * (which a browser reads as a slash), a control character or anything that is not a path from
 * the root is ignored, and the person lands on the home page.
 */
export const HOME_PATH = '/';

/** Where the sign-in page may send a person afterwards: a same-origin path, or the home page. */
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== 'string' || next === '') return HOME_PATH;
  // A path from the root, and not a second slash or a backslash after it.
  if (!next.startsWith('/') || /^\/[/\\]/.test(next)) return HOME_PATH;
  // No scheme, no backslash anywhere, no control or whitespace character, no fragment to a page of sign-in itself.
  if (/[\\\s\u0000-\u001f\u007f]/.test(next) || /^\/[^?#]*:/.test(next)) return HOME_PATH;
  // What a browser would make of it must stay on this origin and keep the path; an encoded slash or
  // backslash right after the first one is refused too, so that nothing can read as another host.
  try {
    const url = new URL(next, 'https://confera.invalid');
    if (url.origin !== 'https://confera.invalid' || `${url.pathname}${url.search}${url.hash}` !== next) return HOME_PATH;
    if (/^\/(?:%2f|%5c)/i.test(next) || /^\/[/\\]/.test(decodeURIComponent(url.pathname))) return HOME_PATH;
  } catch {
    return HOME_PATH;
  }
  // The auth pages themselves are never a destination (a loop); the home page is.
  if (/^\/(sign-in|forgot-password|invitations|password-resets|email-changes)(\/|\?|#|$)/.test(next)) return HOME_PATH;
  return next;
}

/** The sign-in address that comes back to `path` afterwards (when `path` is a safe destination). */
export function signInHref(path: string): string {
  const next = safeNextPath(path);
  return next === HOME_PATH ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`;
}
