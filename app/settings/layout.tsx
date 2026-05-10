import type { Metadata } from 'next';

// Settings page itself is 'use client' (heavy stateful UI), so metadata
// has to live in a server-component layout. Page is auth-gated and
// noindexed regardless — this just gives the route a stable title +
// canonical so inbound link variants don't splinter.
export const metadata: Metadata = {
    title: 'Account Settings | PMHNP Hiring',
    description: 'Manage your PMHNP Hiring account — profile, resume, job preferences, alerts, and notifications.',
    alternates: { canonical: 'https://pmhnphiring.com/settings' },
    robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
