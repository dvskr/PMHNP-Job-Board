import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Post a Job | PMHNP Jobs',
    description: 'Post your PMHNP job opening and reach thousands of qualified psychiatric nurse practitioners.',
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
