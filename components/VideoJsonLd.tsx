import { jsonLdString } from '@/lib/seo/json-ld';
import { getPageVideoSEO } from '@/lib/video-seo';
import { brand } from '@/config/brand';

interface VideoJsonLdProps {
    pathname: string;
}

/**
 * Resolve a path-or-absolute URL into a fully-qualified URL.
 *
 * GSC Fix: previously we did `${brand.baseUrl}${video.thumbnail}` even when
 * `video.thumbnail` was already an absolute Supabase URL — producing
 * `https://pmhnphiring.comhttps://sggccmqjzuimwlahocmy.supabase.co/...`
 * which GSC flagged as "Invalid URL in field 'thumbnailUrl'" and which
 * disqualified the page from VideoObject rich results.
 */
function absUrl(value: string): string {
    if (/^https?:\/\//i.test(value)) return value;
    return `${brand.baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

/**
 * Normalize a config-provided uploadDate (typically a YYYY-MM-DD literal)
 * to ISO 8601 with a UTC time zone. Schema.org expects a full datetime;
 * GSC reports both "Invalid datetime value" and "missing a time zone"
 * when only a date is supplied.
 */
function toIsoDatetime(value: string): string {
    if (/T\d{2}:\d{2}/.test(value)) return value; // already a datetime
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
    return value;
}

/**
 * Renders a VideoObject JSON-LD script tag for the given page.
 * Returns null if no video is mapped for the route.
 */
export default function VideoJsonLd({ pathname }: VideoJsonLdProps) {
    const video = getPageVideoSEO(pathname);
    if (!video) return null;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: video.title,
        description: video.description,
        thumbnailUrl: absUrl(video.thumbnail),
        contentUrl: absUrl(video.video),
        uploadDate: toIsoDatetime(video.uploadDate),
        duration: `PT${video.duration}S`,
        embedUrl: absUrl(video.video),
        inLanguage: 'en',
        isFamilyFriendly: true,
        potentialAction: {
            '@type': 'WatchAction',
            target: `${brand.baseUrl}${pathname}`,
        },
        publisher: {
            '@type': 'Organization',
            name: brand.name,
            logo: {
                '@type': 'ImageObject',
                url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pmhnp-hiring-logo.webp',
            },
        },
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
        />
    );
}

