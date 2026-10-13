import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin' };

/** Admin home. The real dashboard arrives with 0.2.0; this is the 0.1.0 foundation page. */
export default function AdminHomePage() {
  return (
    <main>
      <h1>Confera</h1>
      <p>Foundations 0.1.0.</p>
    </main>
  );
}
