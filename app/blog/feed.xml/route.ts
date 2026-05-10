import { NextResponse } from 'next/server';
import { getPublishedPosts } from '@/lib/blog';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

/**
 * Blog RSS feed — /blog/feed.xml
 *
 * Serves the 20 most recent published blog posts as an RSS 2.0 feed.
 * Companion to /feed.xml (which serves jobs); together they cover the
 * two indexable content surfaces on the site.
 *
 * Discoverability: linked via <link rel="alternate" type="application/rss+xml">
 * in app/blog/layout.tsx so feed readers (Feedly, Inoreader, NetNewsWire)
 * auto-detect when a user is on any /blog/* page. The static /feed.xml is
 * already linked from the root layout.
 *
 * Cache: 1-hour CDN cache. Editorial cadence is well below this; bumping
 * higher would lag publish-to-feed delivery for subscribers.
 */
export async function GET() {
    try {
        const posts = await getPublishedPosts(1, 20);

        const escape = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const lastBuildDate = posts[0]?.publish_date
            ? new Date(posts[0].publish_date).toUTCString()
            : new Date().toUTCString();

        const items = posts.map((post) => {
            const date = post.publish_date || post.created_at;
            const pubDate = new Date(date).toUTCString();
            const description = (post.meta_description || '').slice(0, 500);
            const url = `${BASE_URL}/blog/${post.slug}`;
            return `    <item>
      <title><![CDATA[${escape(post.title)}]]></title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description><![CDATA[${escape(description)}]]></description>
      <pubDate>${pubDate}</pubDate>
      <category>${escape(post.category || 'PMHNP Career')}</category>
      <author>contact@pmhnphiring.com (PMHNP Hiring)</author>
${post.image_url ? `      <enclosure url="${escape(post.image_url)}" type="image/webp"/>` : ''}
    </item>`;
        }).join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>PMHNP Hiring — Career Blog &amp; Industry Insights</title>
    <link>${BASE_URL}/blog</link>
    <description>PMHNP career guides, salary trends, licensure changes, and industry analysis from the #1 psychiatric nurse practitioner job board.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${BASE_URL}/pmhnp_logo.png</url>
      <title>PMHNP Hiring</title>
      <link>${BASE_URL}/blog</link>
    </image>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;

        return new NextResponse(xml, {
            headers: {
                'Content-Type': 'application/rss+xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            },
        });
    } catch (error) {
        console.error('[blog/feed.xml] Failed to generate feed:', error);
        return NextResponse.json({ error: 'Failed to generate feed' }, { status: 500 });
    }
}
