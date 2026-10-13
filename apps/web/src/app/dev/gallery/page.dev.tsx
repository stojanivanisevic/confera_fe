import type { Metadata } from 'next';

import { Gallery } from '@confera/ui/gallery';

export const metadata: Metadata = { title: 'Design system gallery' };

/**
 * /dev/gallery: every component of the design system, rendered on the server
 * and hydrated. This file is a page only in a test build (`--dev-pages`); a
 * production build does not contain it (ADR-20, ADR-24).
 */
export default function GalleryPage() {
  return <Gallery />;
}
