import type { Metadata } from 'next';

import { Organisation } from '@/admin/Organisation';

export const metadata: Metadata = { title: 'Organisation' };

export default function OrganisationPage() {
  return <Organisation />;
}
