import type { Metadata } from 'next';

import { PageHeader } from '@confera/ui';

import { ApiStatus } from '@/components/ApiStatus';

export const metadata: Metadata = { title: 'Admin' };

/** Admin home of 0.1.0: the foundation page. The dashboard arrives with 0.2.0. */
export default function AdminHomePage() {
  return (
    <main className="confera-page">
      <PageHeader title="Confera" description="Conferences and membership of UdEkoM Balkans. Release 0.1.0: foundations." />
      <ApiStatus />
    </main>
  );
}
