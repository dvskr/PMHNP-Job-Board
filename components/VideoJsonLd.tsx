import { getPageVideoSEO } from '@/lib/video-seo';
import { brand } from '@/config/brand';

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

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: video.title,
        description: video.description,
        thumbnailUrl: `${brand.baseUrl}${video.thumbnail}`,
        contentUrl: `${brand.baseUrl}${video.video}`,
        uploadDate: video.uploadDate,
        duration: `PT${video.duration}S`,
        embedUrl: `${brand.baseUrl}${video.video}`,
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
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}

