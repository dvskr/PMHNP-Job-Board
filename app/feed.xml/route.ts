import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BASE_URL = 'https://pmhnphiring.com';

/**
 * RSS Feed — /feed.xml
 * 
 * Serves the 50 most recent published PMHNP jobs as an RSS 2.0 feed.
 * Used by Google News, Feedly, AI systems, and job aggregators.
 */
export async function GET() {
  try {
    const jobs = await prisma.job.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        title: true,
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
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const pubDate = jobs[0]?.createdAt
      ? new Date(jobs[0].createdAt).toUTCString()
      : new Date().toUTCString();

    const items = jobs.map(job => {
      const slug = `${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}-${job.id}`;
      const salary = job.normalizedMinSalary && job.normalizedMaxSalary
        ? ` | $${Math.round(Number(job.normalizedMinSalary) / 1000)}K-$${Math.round(Number(job.normalizedMaxSalary) / 1000)}K`
        : '';
      const desc = job.descriptionSummary || job.description?.slice(0, 300) || '';
      
      return `    <item>
      <title><![CDATA[${job.title} at ${job.employer}${salary}]]></title>
      <link>${BASE_URL}/jobs/${slug}</link>
      <guid isPermaLink="true">${BASE_URL}/jobs/${slug}</guid>
      <description><![CDATA[${desc}]]></description>
      <pubDate>${new Date(job.createdAt).toUTCString()}</pubDate>
      <category>${job.isRemote ? 'Remote' : (job.location || 'United States')}</category>
      <author>contact@pmhnphiring.com (PMHNP Hiring)</author>
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>PMHNP Hiring — Latest Psychiatric NP Jobs</title>
    <link>${BASE_URL}</link>
    <description>The latest PMHNP job listings from the #1 psychiatric nurse practitioner job board. 10,000+ positions across all 50 states, updated daily.</description>
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
    return NextResponse.json({ error: 'Failed to generate feed' }, { status: 500 });
  }
}
