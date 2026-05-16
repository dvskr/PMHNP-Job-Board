/**
 * /employer/analytics — Phase 4 #18.
 *
 * Lightweight dashboard wrapping the existing /api/employer/analytics
 * endpoint. Surfaces per-JD views, clicks, and CTR with a CSV export
 * link (handled by /api/employer/analytics/csv when present).
 *
 * Why a thin client component (vs. a richer chart library):
 *   - Keeps bundle weight low. The numbers are the value; sparklines
 *     can come later behind a feature flag if the data is interesting
 *     enough to chart.
 *   - The analytics API already returns ready-to-render aggregates, so
 *     there is no second-aggregation work to do in the browser.
 */
import { requireEmployer } from '@/lib/auth/protect';
import EmployerAnalyticsClient from './EmployerAnalyticsClient';

export const metadata = {
  title: 'Job Analytics | PMHNP Hiring',
  description: 'Per-job views, apply clicks, and CTR for your active and historical PMHNP postings.',
};

export default async function EmployerAnalyticsPage() {
  await requireEmployer();
  return <EmployerAnalyticsClient />;
}
