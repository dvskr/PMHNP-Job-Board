import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://pmhnphiring.com';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // daily

/** YouTube video ids are exactly 11 url-safe characters. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** W3C date, the only shape <video:publication_date> accepts. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Generates a video sitemap following Google's video sitemap extension.
 *
 * GSC Fix: Removed static page scroll videos — Google requires videos to be
 * the PRIMARY content of the page. Scroll recordings/animations embedded as
 * secondary content will never pass the "video isn't the main content" filter.
 * Only YouTube blog videos are included — they're on dedicated blog pages
 * where the video IS primary content.
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps
 */
export async function GET() {
    // YouTube blog videos (from database) — on pages where video is primary content
    let blogEntries: string[] = [];
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: posts } = await supabase
            .from('blog_posts')
            .select('slug, title, meta_description, youtube_video_id, publish_date, created_at')
            .eq('status', 'published')
            .not('youtube_video_id', 'is', null);

        if (posts && posts.length > 0) {
            // A video id that is not a YouTube id cannot produce a working
            // player_loc, and an unescaped one ("abc&def") makes the whole
            // document malformed, so Google rejects the SITEMAP, not just the
            // entry. /api/blog stores the value unvalidated, so the shape is
            // checked here at the point of use. Dropped rows are named in the
            // log: a post silently missing from the video sitemap is otherwise
            // invisible until Search Console reports it.
            const malformed = posts.filter((post) => !YOUTUBE_ID.test(post.youtube_video_id ?? ''));
            if (malformed.length > 0) {
                console.error(
                    '[video-sitemap] skipped posts with a malformed youtube_video_id:',
                    malformed.map((post) => `${post.slug}=${post.youtube_video_id}`).join(', '),
                );
            }
            blogEntries = posts
                .filter((post) => YOUTUBE_ID.test(post.youtube_video_id ?? ''))
                .map((post) => {
                    // publication_date must be a W3C datetime. Emitting an
                    // empty element (both dates null) invalidates the entry for
                    // Google's video parser, so omit it instead.
                    const publishedOn = (post.publish_date || post.created_at || '').split('T')[0];
                    const publicationDate = ISO_DATE.test(publishedOn)
                        ? `
      <video:publication_date>${publishedOn}</video:publication_date>`
                        : '';
                    return `  <url>
    <loc>${BASE_URL}/blog/${escapeXml(post.slug)}</loc>
    <video:video>
      <video:thumbnail_loc>https://img.youtube.com/vi/${post.youtube_video_id}/maxresdefault.jpg</video:thumbnail_loc>
      <video:title>${escapeXml(post.title)}</video:title>
      <video:description>${escapeXml(post.meta_description || post.title)}</video:description>
      <video:player_loc allow_embed="yes">https://www.youtube.com/embed/${post.youtube_video_id}</video:player_loc>${publicationDate}
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>`;
                });
        }
    } catch (e) {
        console.error('[video-sitemap] Error fetching blog videos:', e);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${blogEntries.join('\n')}
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
