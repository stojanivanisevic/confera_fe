import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { FORM_TEXTS } from '@confera/form-renderer';
import { EmptyState } from '@confera/ui';

import { getConfig } from '@/config/env';

export const metadata: Metadata = { title: 'Page not found' };

/**
 * "Not found". On the public host it is reached from a form link, by an author: it says so in both
 * languages of the forms, with the way back (UX-M1-19). On the admin host it leads home (UXUI-M2-29).
 * The same page answers an unknown path and a path of the other host, so the two cannot be told apart.
 */
export default async function NotFound() {
  const host = (await headers()).get('host')?.toLowerCase() ?? '';
  if (host === getConfig().publicHost) {
    return (
      <main className="confera-page" data-confera-not-found="public">
        <h1 className="ud-sr">{FORM_TEXTS.en.page.notFoundTitle}</h1>
        <EmptyState icon="search" title={FORM_TEXTS.en.page.notFoundTitle} description={FORM_TEXTS.en.page.notFoundText} />
        <div lang="sr">
          <EmptyState icon="search" title={FORM_TEXTS.sr.page.notFoundTitle} description={FORM_TEXTS.sr.page.notFoundText} />
        </div>
      </main>
    );
  }
  return (
    <main className="confera-page" data-confera-not-found="admin">
      <h1 className="ud-sr">Page not found</h1>
      <EmptyState
        icon="search"
        title="Page not found"
        description="This address does not exist. Check the link you followed."
        action={
          <a className="ud-link" href="/">
            Go to Confera
          </a>
        }
      />
    </main>
  );
}
