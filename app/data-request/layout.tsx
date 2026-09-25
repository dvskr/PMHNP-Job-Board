import { brand } from '@/config/brand';
import { Metadata } from 'next';

/**
 * app/data-request/page.tsx is a client component, so it cannot export
 * metadata. Without this layout the DSAR form inherited the ROOT title,
 * description and og:url: a privacy request form that told crawlers it was
 * the homepage job board, byte-identical to it in the SERP.
 *
 * Utility form, no search intent, linked from the footer of every page:
 * noindex + follow, matching the /job-alerts decision. middleware.ts sends
 * the matching X-Robots-Tag so the header and the meta tag agree.
 */
export const metadata: Metadata = {
    title: 'Privacy Data Request',
    description: 'Request a copy, correction, or deletion of the personal information PMHNP Hiring holds about you.',
    alternates: {
        canonical: `${brand.baseUrl}/data-request`,
    },
    robots: { index: false, follow: true },
};

export default function DataRequestLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
