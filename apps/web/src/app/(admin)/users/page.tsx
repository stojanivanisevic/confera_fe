import type { Metadata } from 'next';

import { Users } from '@/admin/Users';

export const metadata: Metadata = { title: 'Users' };

export default function UsersPage() {
  return <Users />;
}
