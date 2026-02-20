import { getPageVideoSEO } from '@/lib/video-seo';

interface VideoJsonLdProps {
    pathname: string;
}

/**
 * Renders a VideoObject JSON-LD script tag for the given page.
 * Returns null if no video is mapped for the route.
 */
export default function VideoJsonLd({ pathname }: VideoJsonLdProps) {
    const video = getPageVideoSEO(pathname);
    if (!video) return null;

    const BASE_URL = 'https://pmhnphiring.com';

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: video.title,
        description: video.description,
        thumbnailUrl: `${BASE_URL}${video.thumbnail}`,
        contentUrl: `${BASE_URL}${video.video}`,
        uploadDate: video.uploadDate,
        duration: `PT${video.duration}S`,
        embedUrl: `${BASE_URL}${video.video}`,
        publisher: {
            '@type': 'Organization',
            name: 'PMHNP Hiring',
            logo: {
                '@type': 'ImageObject',
                url: `${BASE_URL}/images/pmhnp-hiring-logo.webp`,
            },
        },
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}
