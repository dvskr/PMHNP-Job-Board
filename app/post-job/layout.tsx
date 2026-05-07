import { brand } from '@/config/brand';
import { Metadata } from 'next';

// Title is bare ("Post a Job") because the root layout's title.template
// (`%s | ${brand.name}`) already appends the brand suffix. Including the
// suffix here would render "Post a Job | PMHNP Hiring | PMHNP Hiring".
export const metadata: Metadata = {
    title: 'Post a Job',
    description: 'Post your PMHNP job opening and reach thousands of qualified psychiatric nurse practitioners. Starter, Growth, and Premium listings with email alerts to subscribers.',
    alternates: {
        canonical: `${brand.baseUrl}/post-job`,
    },
};

export default function PostJobLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
