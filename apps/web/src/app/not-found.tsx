import type { Metadata } from 'next';

import { EmptyState } from '@confera/ui';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="confera-page">
      <h1 className="ud-sr">Page not found</h1>
      <EmptyState icon="search" title="Page not found" description="This address does not exist. Check the link you followed." />
    </main>
  );
}
