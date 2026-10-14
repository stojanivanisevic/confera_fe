/**
 * /dev/render-error: a page that fails while it is rendered, so that a test can see what the
 * framework's error page carries: like every page response, the header set of its kind
 * (ADR-28, ST-12; e2e/security-headers.spec.ts). This file is a page only in a test build
 * (`--dev-pages`); a production build does not contain it.
 */
export const dynamic = 'force-dynamic';

export default function RenderErrorPage(): never {
  throw new Error('This page fails on purpose (test build only).');
}
