import type { ReactNode } from 'react';

import { AuthFrame } from '@/admin/AuthFrame';

/** The pages a person reaches without a session: sign-in, a new password, the pages of the links. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AuthFrame>{children}</AuthFrame>;
}
