import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '@confera/ui/styles';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Confera', template: '%s · Confera' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Every HTML response carries a per-response script nonce and is never cached
// (ADR-28, SEC-A-51), so nothing is rendered at build time.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
