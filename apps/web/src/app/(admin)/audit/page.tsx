import type { Metadata } from 'next';

import { Audit } from '@/admin/Audit';

export const metadata: Metadata = { title: 'Audit log' };

export default function AuditPage() {
  return <Audit />;
}
