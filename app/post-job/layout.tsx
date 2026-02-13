import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Post a Job | PMHNP Hiring',
    description: 'Post your PMHNP job opening for free and reach thousands of qualified psychiatric nurse practitioners. Standard and featured listings with email alerts to subscribers.',
    alternates: {
        canonical: 'https://pmhnphiring.com/post-job',
    },
};

export default function PostJobLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
