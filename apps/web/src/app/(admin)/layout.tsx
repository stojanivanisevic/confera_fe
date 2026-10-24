import type { ReactNode } from 'react';

import { AdminShell } from '@/admin/AdminShell';
import { isStaging, StagingNotice } from '@/server/staging';

/**
 * The screens behind sign-in share the admin shell (ADR-20: client components that never cache).
 * On a staging instance the banner leads the page and the shell's sticky top bar keeps a mark (UX4-27).
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const staging = await isStaging();
  return (
    <>
      {staging ? <StagingNotice /> : null}
      <AdminShell staging={staging}>{children}</AdminShell>
    </>
  );
}
