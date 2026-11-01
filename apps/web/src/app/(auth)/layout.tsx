import type { ReactNode } from 'react';

import { AuthFrame } from '@/admin/AuthFrame';
import { StagingBanner } from '@/server/staging';

/** The pages a person reaches without a session: sign-in, a new password, the pages of the links. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <StagingBanner />
      <AuthFrame>{children}</AuthFrame>
    </>
  );
}
