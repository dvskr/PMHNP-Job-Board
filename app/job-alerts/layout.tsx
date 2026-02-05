import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Job Alerts | PMHNP Jobs',
    description: 'Set up personalized job alerts and get notified when new PMHNP positions match your criteria.',
    alternates: {
        canonical: '/job-alerts',
    },
};

export default function JobAlertsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
