import { brand } from '@/config/brand';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Job Alerts | PMHNP Jobs',
    description: 'Set up personalized job alerts and get notified when new PMHNP positions match your criteria.',
    alternates: {
        canonical: `${brand.baseUrl}/job-alerts`,
    },
    // Audit 15 thin-pages CRITICAL: page is a bare subscription form
    // (~240 words, mostly UI labels). Two paths the audit offered:
    //   (a) add 300-400 words of editorial content covering alert
    //       frequency / coverage / audience, OR
    //   (b) noindex and remove from sitemap.
    // Going with (b) for now since users discover this page via the
    // footer link on every page, not via SERP. Switch to (a) if branded
    // "PMHNP job alerts" queries become valuable to rank for.
    robots: { index: false, follow: true },
};

export default function JobAlertsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
