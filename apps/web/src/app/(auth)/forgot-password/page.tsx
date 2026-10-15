import type { Metadata } from 'next';

import { ForgotPassword } from '@/admin/ForgotPassword';

export const metadata: Metadata = { title: 'New password' };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
