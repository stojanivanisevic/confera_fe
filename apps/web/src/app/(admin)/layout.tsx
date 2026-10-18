import type { ReactNode } from 'react';

import { AdminShell } from '@/admin/AdminShell';
import { StagingBanner } from '@/server/staging';

/** The screens behind sign-in share the admin shell (ADR-20: client components that never cache). */
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <StagingBanner />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
