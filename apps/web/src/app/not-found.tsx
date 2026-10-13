import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>This address does not exist.</p>
    </main>
  );
}
