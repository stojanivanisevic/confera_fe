import type { Metadata } from 'next';

import { Home } from '@/admin/Home';

export const metadata: Metadata = { title: 'Home' };

/** The admin home: who is signed in, and whether Confera reaches its server. The dashboard arrives later. */
export default function AdminHomePage() {
  return <Home />;
}
