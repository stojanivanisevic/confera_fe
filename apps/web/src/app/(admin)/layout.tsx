import type { ReactNode } from 'react';

import { AdminShell } from '@/admin/AdminShell';

/** The screens behind sign-in share the admin shell (ADR-20: client components that never cache). */
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
