import { NextResponse } from 'next/server';
import { getAllPageVideos } from '@/lib/video-seo';

const BASE_URL = 'https://pmhnphiring.com';

export const dynamic = 'force-static';
export const revalidate = 86400; // daily

/**
 * Generates a video sitemap following Google's video sitemap extension.
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps
 */
export function GET() {
    const videos = getAllPageVideos();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${videos
            .map(
                (entry) => `  <url>
    <loc>${BASE_URL}${entry.url}</loc>
    <video:video>
      <video:thumbnail_loc>${BASE_URL}${entry.thumbnail}</video:thumbnail_loc>
      <video:title>${escapeXml(entry.title)}</video:title>
      <video:description>${escapeXml(entry.description)}</video:description>
      <video:content_loc>${BASE_URL}${entry.video}</video:content_loc>
      <video:duration>${entry.duration}</video:duration>
      <video:publication_date>${entry.uploadDate}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>`
            )
            .join('\n')}
</urlset>`;

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
    });
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
