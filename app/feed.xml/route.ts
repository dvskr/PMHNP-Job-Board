import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/utils';
import { activeIndexableJobWhere } from '@/lib/active-job-filter';

const BASE_URL = 'https://pmhnphiring.com';
const FEED_SIZE = 50;

// XML 1.0 forbids most C0 control characters even inside CDATA (only tab,
// LF, CR are legal); one stray \f or NUL in a scraped title invalidates the
// whole feed for a strict parser. Escapes are written as \uXXXX on purpose.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/**
 * CDATA-wrap scraped text. `]]>` is the only sequence that can terminate a
 * CDATA section early, so split it across two sections.
 */
function cdata(value: string): string {
  return `<![CDATA[${value
    .replace(INVALID_XML_CHARS, '')
    .replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Escape scraped text for plain XML element content (e.g. <category>). */
function xmlEscape(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * RSS Feed — /feed.xml
 *
 * Serves the 50 most recent ACTIVE PMHNP jobs as an RSS 2.0 feed.
 * Used by Google News, Feedly, AI systems, and job aggregators.
 *
 * Distribution audit D4: employer-posted jobs (the paying side) are pinned
 * ahead of the aggregated inventory. Under pure newest-50 ordering an
 * employer post churned out of the feed within hours of ingest cycles,
 * while its paid 30/60-day term had barely started. The where filter also
 * moved from bare isPublished to the shared active-job gate so expired or
 * dead-link jobs can't linger in the feed.
 *
 * The full-inventory aggregator feed lives at /feeds/jobs.xml.
 */
export async function GET() {
  try {
    const where = activeIndexableJobWhere();
    const select = {
      id: true,
      title: true,
      slug: true,
      employer: true,
      location: true,
      city: true,
      state: true,
      description: true,
      descriptionSummary: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      createdAt: true,
      isRemote: true,
    } as const;

    // Employer posts first (all active ones, newest first), then the newest
    // aggregated jobs fill the remainder of the 50 slots. The OR branch on
    // the aggregated query is required because Prisma's `{ not: 'employer' }`
    // on a nullable column excludes NULL rows.
    const [employerJobs, aggregatedJobs] = await Promise.all([
      prisma.job.findMany({
        where: { ...where, sourceType: 'employer' },
        select,
        orderBy: { createdAt: 'desc' },
        take: FEED_SIZE,
      }),
      prisma.job.findMany({
        where: {
          AND: [
            where,
            { OR: [{ sourceType: null }, { sourceType: { not: 'employer' } }] },
          ],
        },
        select,
        orderBy: { createdAt: 'desc' },
        take: FEED_SIZE,
      }),
    ]);

    const jobs = [...employerJobs, ...aggregatedJobs].slice(0, FEED_SIZE);

    // lastBuildDate = newest job in the feed. jobs[0] is no longer the
    // newest (employer pins can be weeks old), so take the max explicitly.
    const newestMs = jobs.reduce((max, j) => Math.max(max, new Date(j.createdAt).getTime()), 0);
    const pubDate = newestMs > 0 ? new Date(newestMs).toUTCString() : new Date().toUTCString();

    const items = jobs.map(job => {
      // Stored slug first, shared slugify fallback — identical to the page
      // canonical and /api/sitemaps/jobs/[batch] (GSC Fix 2026-07 audit,
      // review finding: local slug computation advertised non-canonical URLs).
      const slug = job.slug || slugify(job.title, job.id);
      const salary = job.normalizedMinSalary && job.normalizedMaxSalary
        ? ` | $${Math.round(Number(job.normalizedMinSalary) / 1000)}K-$${Math.round(Number(job.normalizedMaxSalary) / 1000)}K`
        : '';
      const desc = job.descriptionSummary || job.description?.slice(0, 300) || '';
      
      return `    <item>
      <title>${cdata(`${job.title} at ${job.employer}${salary}`)}</title>
      <link>${BASE_URL}/jobs/${slug}</link>
      <guid isPermaLink="true">${BASE_URL}/jobs/${slug}</guid>
      <description>${cdata(desc)}</description>
      <pubDate>${new Date(job.createdAt).toUTCString()}</pubDate>
      <category>${xmlEscape(job.isRemote ? 'Remote' : (job.location || 'United States'))}</category>
      <author>contact@pmhnphiring.com (PMHNP Hiring)</author>
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>PMHNP Hiring: Latest Psychiatric NP Jobs</title>
    <link>${BASE_URL}</link>
    <description>The latest PMHNP job listings from a specialized psychiatric nurse practitioner job board, covering all 50 states and updated daily.</description>
    <language>en-us</language>
    <lastBuildDate>${pubDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${BASE_URL}/pmhnp_logo.png</url>
      <title>PMHNP Hiring</title>
      <link>${BASE_URL}</link>
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
    logger.error('[feed.xml] failed to generate RSS feed:', error);
    return NextResponse.json({ error: 'Failed to generate feed' }, { status: 500 });
  }
}
