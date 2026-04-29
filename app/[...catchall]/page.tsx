import { notFound } from 'next/navigation';

/**
 * Catch-all route — any unmatched URL triggers a proper 404.
 * Delegates to app/not-found.tsx which renders the custom 404 page
 * with the correct HTTP 404 status code.
 */
export default function CatchAllPage() {
  notFound();
}
