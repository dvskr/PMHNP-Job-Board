/**
 * Feed shape locks (distribution audit D4).
 *
 * Two audited failures:
 *   - No outbound syndication feed existed for aggregators, so the paying
 *     employer inventory had no machine-readable distribution channel.
 *   - /feed.xml served newest-50 by createdAt, so employer posts churned
 *     out of the feed within hours while their paid term had weeks left.
 *
 * Locks: /feeds/jobs.xml serves the aggregator shape with employer posts
 * first and salary only when real; /feed.xml pins employer posts ahead of
 * the scraped churn.
 */
import { describe, it, expect, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as jobsXmlGet } from '@/app/feeds/jobs.xml/route';
import { GET as feedXmlGet } from '@/app/feed.xml/route';

const employerJob = {
    id: 'emp-0001',
    title: 'Employer Posted PMHNP',
    slug: 'employer-posted-pmhnp-emp-0001',
    employer: 'Acme Behavioral Health',
    location: 'Austin, TX',
    city: 'Austin',
    state: 'Texas',
    isRemote: false,
    description: 'An employer-posted psychiatric NP role.',
    descriptionSummary: 'Employer-posted psychiatric NP role.',
    normalizedMinSalary: 140000,
    normalizedMaxSalary: 180000,
    salaryIsEstimated: false,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    originalPostedAt: new Date('2026-07-01T00:00:00Z'),
    expiresAt: new Date('2026-08-30T00:00:00Z'),
    sourceType: 'employer',
};

const scrapedFresh = {
    id: 'agg-0001',
    title: 'Aggregated PMHNP Fresh',
    slug: 'aggregated-pmhnp-fresh-agg-0001',
    employer: 'Fictional Health System',
    location: 'Denver, CO',
    city: 'Denver',
    state: 'Colorado',
    isRemote: true,
    description: 'An aggregated role scraped yesterday.',
    descriptionSummary: null,
    normalizedMinSalary: 120000,
    normalizedMaxSalary: 150000,
    salaryIsEstimated: true, // estimated — salary must be OMITTED in jobs.xml
    createdAt: new Date('2026-08-03T00:00:00Z'),
    originalPostedAt: null,
    expiresAt: null,
    sourceType: 'scraped',
};

const scrapedNoSalary = {
    ...scrapedFresh,
    id: 'agg-0002',
    title: 'Aggregated PMHNP No Salary',
    slug: 'aggregated-pmhnp-no-salary-agg-0002',
    normalizedMinSalary: null,
    normalizedMaxSalary: null,
    salaryIsEstimated: false,
    createdAt: new Date('2026-08-02T00:00:00Z'),
};

// Hostile scraped content: CDATA breakout attempt, raw ampersands, and an
// XML-1.0-illegal control character (\f). One such job must not be able to
// invalidate the whole feed. Fictional fixture.
const scrapedHostile = {
    ...scrapedFresh,
    id: 'agg-hostile',
    title: 'Psych NP ]]><evil/> Role',
    slug: 'psych-np-role-agg-hostile',
    employer: 'Fictional & Sons Behavioral',
    location: 'Dallas & Fort Worth, TX',
    isRemote: false,
    description: 'Line one.\fThen a ]]> breakout attempt & an ampersand.',
    descriptionSummary: null,
    normalizedMinSalary: null,
    normalizedMaxSalary: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
};

// Tab, LF, CR are the only C0 controls XML 1.0 allows.
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

describe('/feeds/jobs.xml — outbound syndication feed', () => {
    it('serves the aggregator shape with employer posts first', async () => {
        // First findMany call = employer query, second = aggregated query
        // (Promise.all preserves construction order).
        vi.mocked(prisma.job.findMany)
            .mockResolvedValueOnce([employerJob] as never)
            .mockResolvedValueOnce([scrapedFresh, scrapedNoSalary] as never);

        const res = await jobsXmlGet();
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('xml');
        const xml = await res.text();

        expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
        expect(xml).toContain('<source>');
        expect(xml).toContain('<publisher>PMHNP Hiring</publisher>');

        // Employer post is pinned FIRST even though the scraped jobs are newer.
        const employerIdx = xml.indexOf('Employer Posted PMHNP');
        const scrapedIdx = xml.indexOf('Aggregated PMHNP Fresh');
        expect(employerIdx).toBeGreaterThan(-1);
        expect(scrapedIdx).toBeGreaterThan(-1);
        expect(employerIdx).toBeLessThan(scrapedIdx);

        // Employer flag on both kinds.
        expect(xml).toContain('<employer_posted>true</employer_posted>');
        expect(xml).toContain('<employer_posted>false</employer_posted>');

        // Canonical URL + stable reference id.
        expect(xml).toContain('https://pmhnphiring.com/jobs/employer-posted-pmhnp-emp-0001');
        expect(xml).toContain('<referencenumber>emp-0001</referencenumber>');

        // Expiry surfaces for the employer post.
        expect(xml).toContain('<expirationdate>');
    });

    it('emits salary ONLY when real (both bounds present, not estimated)', async () => {
        vi.mocked(prisma.job.findMany)
            .mockResolvedValueOnce([employerJob] as never)
            .mockResolvedValueOnce([scrapedFresh, scrapedNoSalary] as never);

        const xml = await (await jobsXmlGet()).text();

        // The employer job's real range is the ONLY salary in the feed:
        // scrapedFresh is estimated, scrapedNoSalary has no bounds.
        expect(xml.match(/<salary_min_annual_usd>/g)).toHaveLength(1);
        expect(xml).toContain('<salary_min_annual_usd>140000</salary_min_annual_usd>');
        expect(xml).toContain('<salary_max_annual_usd>180000</salary_max_annual_usd>');
        expect(xml).not.toContain('120000');
    });

    it('returns 500 (not a fabricated feed) when the DB fails', async () => {
        vi.mocked(prisma.job.findMany).mockRejectedValue(new Error('db down') as never);
        const res = await jobsXmlGet();
        expect(res.status).toBe(500);
    });

    it('neutralizes CDATA breakouts and strips XML-illegal control chars', async () => {
        vi.mocked(prisma.job.findMany)
            .mockResolvedValueOnce([] as never)
            .mockResolvedValueOnce([scrapedHostile] as never);

        const xml = await (await jobsXmlGet()).text();

        // The `]]>` in the title must not terminate the CDATA section: the
        // literal `<evil/>` element must never appear outside CDATA. The
        // split leaves `]]]]><![CDATA[><evil/>` — inert on parse.
        expect(xml).not.toContain(']]><evil/>');
        expect(xml).toContain(']]]]><![CDATA[>');

        // The \f in the description would invalidate the ENTIRE feed for a
        // strict XML 1.0 parser; it must be stripped.
        expect(xml).not.toMatch(ILLEGAL_XML_CHARS);
    });
});

describe('/feed.xml — RSS with employer posts pinned', () => {
    it('pins employer posts ahead of newer scraped jobs', async () => {
        vi.mocked(prisma.job.findMany)
            .mockResolvedValueOnce([employerJob] as never)
            .mockResolvedValueOnce([scrapedFresh, scrapedNoSalary] as never);

        const res = await feedXmlGet();
        expect(res.status).toBe(200);
        const xml = await res.text();

        expect(xml).toContain('<rss version="2.0"');

        const employerIdx = xml.indexOf('Employer Posted PMHNP');
        const scrapedIdx = xml.indexOf('Aggregated PMHNP Fresh');
        expect(employerIdx).toBeGreaterThan(-1);
        expect(scrapedIdx).toBeGreaterThan(-1);
        expect(employerIdx).toBeLessThan(scrapedIdx);

        // lastBuildDate reflects the NEWEST job in the feed, not the pinned
        // (older) employer post at index 0.
        expect(xml).toContain(`<lastBuildDate>${scrapedFresh.createdAt.toUTCString()}</lastBuildDate>`);
    });

    it('caps the feed at 50 items with employer posts surviving the cut', async () => {
        const manyScraped = Array.from({ length: 80 }, (_, i) => ({
            ...scrapedFresh,
            id: `agg-bulk-${i}`,
            slug: `aggregated-bulk-${i}`,
            title: `Aggregated Bulk ${i}`,
        }));
        vi.mocked(prisma.job.findMany)
            .mockResolvedValueOnce([employerJob] as never)
            .mockResolvedValueOnce(manyScraped as never);

        const xml = await (await feedXmlGet()).text();
        const itemCount = (xml.match(/<item>/g) || []).length;
        expect(itemCount).toBe(50);
        expect(xml).toContain('Employer Posted PMHNP');
    });

    it('escapes scraped titles, locations, and control chars (review fix)', async () => {
        vi.mocked(prisma.job.findMany)
            .mockResolvedValueOnce([] as never)
            .mockResolvedValueOnce([scrapedHostile] as never);

        const xml = await (await feedXmlGet()).text();

        // Title CDATA breakout neutralized (split, not passed through raw).
        expect(xml).not.toContain(']]><evil/>');
        expect(xml).toContain(']]]]><![CDATA[>');

        // <category> holds the raw location for non-remote jobs; its
        // ampersand must be entity-escaped or the whole feed is invalid XML.
        expect(xml).toContain('<category>Dallas &amp; Fort Worth, TX</category>');

        // The \f control character must be stripped, not emitted.
        expect(xml).not.toMatch(ILLEGAL_XML_CHARS);
    });
});
