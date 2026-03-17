import { Metadata } from 'next';

export const metadata: Metadata = {
    title: {
        template: '%s — PMHNP Hiring',
        default: 'Employer Portal — PMHNP Hiring',
    },
    robots: { index: false, follow: false },
};

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
    return children;
}
