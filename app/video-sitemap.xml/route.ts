import { NextResponse } from 'next/server';
import { getAllPageVideos } from '@/lib/video-seo';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://pmhnphiring.com';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // daily

/**
 * Generates a video sitemap following Google's video sitemap extension.
 * Includes both static page scroll videos and dynamic YouTube blog videos.
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps
 */
export async function GET() {
    // 1. Static page videos (scroll recordings)
    const pageVideos = getAllPageVideos();
    const staticEntries = pageVideos.map(
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
    );

    // 2. Dynamic YouTube blog videos (from database)
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
            blogEntries = posts.map(
                (post) => `  <url>
    <loc>${BASE_URL}/blog/${post.slug}</loc>
    <video:video>
      <video:thumbnail_loc>https://img.youtube.com/vi/${post.youtube_video_id}/maxresdefault.jpg</video:thumbnail_loc>
      <video:title>${escapeXml(post.title)}</video:title>
      <video:description>${escapeXml(post.meta_description || post.title)}</video:description>
      <video:player_loc allow_embed="yes">https://www.youtube.com/embed/${post.youtube_video_id}</video:player_loc>
      <video:publication_date>${(post.publish_date || post.created_at || '').split('T')[0]}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>`
            );
        }
    } catch (e) {
        console.error('[video-sitemap] Error fetching blog videos:', e);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${[...staticEntries, ...blogEntries].join('\n')}
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
