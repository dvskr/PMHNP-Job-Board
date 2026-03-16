import { NextResponse } from 'next/server';
import { getAllPageImages } from '@/lib/image-seo';

const BASE_URL = 'https://pmhnphiring.com';

export const dynamic = 'force-static';
export const revalidate = 86400; // daily

/**
 * Generates an image sitemap following Google's image sitemap extension.
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
 */
export function GET() {
    const images = getAllPageImages();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${images
            .map(
                (entry) => `  <url>
    <loc>${BASE_URL}${entry.url}</loc>
    <image:image>
      <image:loc>${BASE_URL}${entry.image}</image:loc>
      <image:title>${escapeXml(entry.title)}</image:title>
      <image:caption>${escapeXml(entry.caption)}</image:caption>
    </image:image>
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
