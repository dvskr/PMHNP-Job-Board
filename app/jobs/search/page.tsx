/**
 * /jobs/search — semantic job search entry point.
 *
 * Server component: lightweight wrapper that renders the client search box.
 * The flag check happens server-side on the API route, so this page renders
 * either way; if the flag is off, the search call returns 404 and the
 * component shows a graceful empty state (see SemanticJobSearch).
 */

import type { Metadata } from 'next';
import SemanticJobSearch from '@/components/ai/SemanticJobSearch';

export const metadata: Metadata = {
    title: 'Smart Job Search — PMHNP Hiring',
    description: 'Describe the role you want and find PMHNP jobs that semantically match — no keyword guessing required.',
    robots: { index: false, follow: false }, // Search results pages shouldn't be indexed.
};

export default function SemanticSearchPage(): React.JSX.Element {
    return <SemanticJobSearch />;
}
