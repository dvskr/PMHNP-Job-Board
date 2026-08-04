import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/utils';
import { activeIndexableJobWhere } from '@/lib/active-job-filter';

/**
 * Outbound syndication feed — /feeds/jobs.xml (distribution audit D4).
 *
 * The full ACTIVE job inventory in a generic aggregator-friendly XML shape
 * (Indeed-style <source><job> elements), for job aggregators, vertical
 * search engines, and AI systems. /feed.xml stays the human-facing RSS of
 * recent jobs; this feed is the machine-facing full inventory.
 *
 * Employer-posted jobs (the paying side) are emitted FIRST, ahead of the
 * aggregated inventory, and carry an explicit <employer_posted> flag so
 * downstream consumers can prioritize them.
 *
 * Size bounds: descriptions are summaries or truncated, and the item count
 * is hard-capped, so the response stays a few MB even if ingest volume
 * spikes.
 */

export const revalidate = 3600;

const BASE_URL = 'https://pmhnphiring.com';
const MAX_FEED_JOBS = 5000;
const MAX_DESCRIPTION_CHARS = 600;

const JOB_SELECT = {
    id: true,
    title: true,
    slug: true,
    employer: true,
    city: true,
    state: true,
    isRemote: true,
    description: true,
    descriptionSummary: true,
    normalizedMinSalary: true,
    normalizedMaxSalary: true,
    salaryIsEstimated: true,
    createdAt: true,
    originalPostedAt: true,
    expiresAt: true,
    sourceType: true,
} as const;

interface FeedJob {
    id: string;
    title: string;
    slug: string | null;
    employer: string;
    city: string | null;
    state: string | null;
    isRemote: boolean;
    description: string;
    descriptionSummary: string | null;
    normalizedMinSalary: number | null;
    normalizedMaxSalary: number | null;
    salaryIsEstimated: boolean;
    createdAt: Date;
    originalPostedAt: Date | null;
    expiresAt: Date | null;
    sourceType: string | null;
}

/**
 * XML 1.0 forbids most C0 control characters even inside CDATA (only tab,
 * LF, CR are legal). Scraped titles/descriptions occasionally carry stray
 * \f, \v, or NULs, and ONE such character makes a strict parser reject the
 * whole feed, so they are stripped before serialization.
 */
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/**
 * CDATA-wrap arbitrary text. The only sequence that can break out of a
 * CDATA section is `]]>`; split it across two sections so aggregator-
 * supplied text stays inert.
 */
function cdata(value: string): string {
    return `<![CDATA[${value
        .replace(INVALID_XML_CHARS, '')
        .replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Escape text for use in plain XML element content (URLs, dates, flags). */
function xmlEscape(value: string): string {
    return value
        .replace(INVALID_XML_CHARS, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Truncate without splitting a surrogate pair: cutting an emoji in half
 * leaves a lone surrogate that serializes as U+FFFD garbage in the feed.
 */
function truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    let end = max;
    const lastCode = value.charCodeAt(end - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;
    return value.slice(0, end);
}

function jobToXml(job: FeedJob): string {
    const slug = job.slug || slugify(job.title, job.id);
    const url = `${BASE_URL}/jobs/${slug}`;
    const isEmployerPosted = job.sourceType === 'employer';
    const posted = (job.originalPostedAt ?? job.createdAt).toUTCString();
    const description = truncate(job.descriptionSummary || job.description || '', MAX_DESCRIPTION_CHARS);

    const parts: string[] = [
        '  <job>',
        `    <title>${cdata(job.title)}</title>`,
        `    <company>${cdata(job.employer)}</company>`,
        `    <url>${xmlEscape(url)}</url>`,
        `    <referencenumber>${xmlEscape(job.id)}</referencenumber>`,
        `    <city>${cdata(job.city || '')}</city>`,
        `    <state>${cdata(job.state || '')}</state>`,
        '    <country>US</country>',
        `    <remote>${job.isRemote ? 'true' : 'false'}</remote>`,
        `    <description>${cdata(description)}</description>`,
        `    <date>${xmlEscape(posted)}</date>`,
    ];
    if (job.expiresAt) {
        parts.push(`    <expirationdate>${xmlEscape(job.expiresAt.toUTCString())}</expirationdate>`);
    }
    // Salary only when REAL: both normalized annual bounds present and not
    // an estimate. Estimated or partial ranges are omitted entirely — same
    // contract as lib/salary-report (never publish invented pay).
    if (job.normalizedMinSalary != null && job.normalizedMaxSalary != null && !job.salaryIsEstimated) {
        parts.push(`    <salary_min_annual_usd>${job.normalizedMinSalary}</salary_min_annual_usd>`);
        parts.push(`    <salary_max_annual_usd>${job.normalizedMaxSalary}</salary_max_annual_usd>`);
    }
    parts.push(`    <employer_posted>${isEmployerPosted ? 'true' : 'false'}</employer_posted>`);
    parts.push('  </job>');
    return parts.join('\n');
}

export async function GET() {
    try {
        const where = activeIndexableJobWhere();

        // Two queries so employer posts are pinned first regardless of age.
        // The non-employer branch uses an explicit OR because Prisma's
        // `{ not: 'employer' }` on a nullable column excludes NULL rows,
        // and aggregated jobs may carry a NULL sourceType.
        const [employerJobs, aggregatedJobs] = await Promise.all([
            prisma.job.findMany({
                where: { ...where, sourceType: 'employer' },
                select: JOB_SELECT,
                orderBy: { createdAt: 'desc' },
                take: MAX_FEED_JOBS,
            }),
            prisma.job.findMany({
                where: {
                    AND: [
                        where,
                        { OR: [{ sourceType: null }, { sourceType: { not: 'employer' } }] },
                    ],
                },
                select: JOB_SELECT,
                orderBy: { createdAt: 'desc' },
                take: MAX_FEED_JOBS,
            }),
        ]);

        const jobs = [...employerJobs, ...aggregatedJobs].slice(0, MAX_FEED_JOBS) as FeedJob[];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <publisher>PMHNP Hiring</publisher>
  <publisherurl>${BASE_URL}</publisherurl>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${jobs.map(jobToXml).join('\n')}
</source>`;

        return new NextResponse(xml, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            },
        });
    } catch (error) {
        logger.error('[feeds/jobs.xml] failed to generate syndication feed:', error);
        return NextResponse.json({ error: 'Failed to generate feed' }, { status: 500 });
    }
}
