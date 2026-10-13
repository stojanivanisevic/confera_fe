import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { sandboxedDocument, SandboxedMarkupFrame } from './SandboxedMarkupFrame';

describe('SandboxedMarkupFrame: the one reviewed place for stored markup (ADR-20)', () => {
  const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="https://example.test">link</a>';
  const html = renderToStaticMarkup(<SandboxedMarkupFrame title="Email body" markup={hostile} />);

  it('renders a frame with an empty sandbox: no scripts, no same origin, no forms', () => {
    expect(html).toMatch(/^<iframe /);
    expect(html).toContain('sandbox=""');
    expect(html).not.toMatch(/allow-(scripts|same-origin|forms|popups|top-navigation)/);
  });

  it('never puts the stored markup into the application document itself', () => {
    // The markup is present only as the escaped value of srcdoc.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('has an accessible name and sends no referrer', () => {
    expect(html).toContain('title="Email body"');
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });

  it('gives the framed document a policy that loads nothing, placed before the markup', () => {
    const doc = sandboxedDocument(hostile);
    const policy = doc.indexOf('Content-Security-Policy');
    expect(policy).toBeGreaterThan(0);
    expect(policy).toBeLessThan(doc.indexOf(hostile));
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toMatch(/script-src|'unsafe-eval'|connect-src [^']/);
  });
});
