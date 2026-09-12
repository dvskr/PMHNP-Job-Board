import { brand } from '@/config/brand';
import { config } from '@/lib/config';
import { Metadata } from 'next';

// Title is bare ("Post a Job") because the root layout's title.template
// (`%s | ${brand.name}`) already appends the brand suffix. Including the
// suffix here would render "Post a Job | PMHNP Hiring | PMHNP Hiring".
export const metadata: Metadata = {
    title: 'Post a Job',
    description: `Post your PMHNP job and reach qualified psychiatric nurse practitioners. First post half price at $${config.firstPostPrice}, then $${config.postingPrice} for a ${config.durationDays}-day featured listing.`,
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
