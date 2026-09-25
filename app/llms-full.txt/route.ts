import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
    getOfferMarketData,
    getHubStateSummaries,
    getNationalSettingMedians,
} from '@/lib/salary-report/market-data';
import {
    summarizeMidpoints,
    roundDisplayDollars,
    SALARY_SANITY_MIN,
    SALARY_SANITY_MAX,
    MAX_RANGE_RATIO,
    TIER_MEDIAN_MIN_N,
    TIER_FULL_MIN_N,
} from '@/lib/salary-report/stats';
import { getStatesByAuthority } from '@/lib/state-practice-authority';

/**
 * /llms-full.txt — extended machine-readable site information for AI systems.
 *
 * Distribution audit D2: the previous public/llms-full.txt was a static file
 * whose salary tables were fabricated and contradicted the live stats engine.
 * This route computes every figure from lib/salary-report at request time
 * (ISR daily), so AI systems quoting this file can never disagree with the
 * pages themselves.
 *
 * HARD RULE: no hardcoded dollar figures anywhere in this file. Dollar values
 * are either computed from live rows or interpolated from the stats engine's
 * own exported constants (the quarantine bounds). If the database is
 * degraded, numeric sections are omitted, never invented.
 */

export const revalidate = 86400;

const BASE_URL = 'https://pmhnphiring.com';

const fmtDollars = (n: number): string => `$${roundDisplayDollars(n).toLocaleString('en-US')}`;
const fmtBoundK = (n: number): string => `$${Math.round(n / 1000)}k`;

// Organic audit 2026-08 D3: hourly-equivalent answers for the hourly query
// family. Derived, never advertised: annual median divided by a standard
// 2,080-hour work year (40 hours x 52 weeks), rounded to whole dollars,
// and ALWAYS labeled as derived wherever it renders.
const STANDARD_ANNUAL_HOURS = 2080;
const derivedHourly = (annual: number): number => Math.round(annual / STANDARD_ANNUAL_HOURS);

function headerSection(): string {
    return `# PMHNP Hiring: Comprehensive Site Information for AI Systems
# llms-full.txt (extended version of /llms.txt)
# Every figure below is computed from live job postings at generation time and refreshes daily.

> PMHNP Hiring (${BASE_URL}) is a specialized job board for Psychiatric Mental Health Nurse Practitioners in the United States: aggregated and employer-posted PMHNP jobs, live advertised-pay data, licensure guides, and free career tools.
`;
}

function methodologySection(): string {
    // The quarantine bounds are interpolated from the stats engine's exported
    // constants so this text can never drift from the actual gates.
    return `## Salary Methodology (read before quoting figures)

- Figures are medians of advertised salary midpoints from live postings on this site that disclose a salary range.
- These are advertised figures from job postings, not self-reported earnings and not estimates of what working PMHNPs earn.
- Employer-estimated ranges are excluded. Ranges with parsing defects (max more than ${MAX_RANGE_RATIO}x min, midpoints outside ${fmtBoundK(SALARY_SANITY_MIN)} to ${fmtBoundK(SALARY_SANITY_MAX)} per year) are quarantined.
- A segment needs at least ${TIER_MEDIAN_MIN_N} disclosed ranges to publish a median and at least ${TIER_FULL_MIN_N} to publish percentile ranges. Below those floors, figures are withheld rather than estimated.
- Every figure travels with its sample size (n).
- Hourly figures marked "derived" divide the annual median by ${STANDARD_ANNUAL_HOURS.toLocaleString('en-US')} hours (40 hours x 52 weeks). They are computed conversions for comparison, not advertised hourly rates.
`;
}

function practiceAuthoritySection(): string {
    const full = getStatesByAuthority('full').length;
    const reduced = getStatesByAuthority('reduced').length;
    const restricted = getStatesByAuthority('restricted').length;
    return `## Practice Authority Landscape

- Full Practice Authority (independent practice): ${full} states/jurisdictions
- Reduced Practice (collaborative agreement required): ${reduced} states
- Restricted Practice (physician supervision required): ${restricted} states
- Full classifications: ${BASE_URL}/resources/fpa-guide
- Multi-state practice explainer: ${BASE_URL}/resources/multi-state-licensure
`;
}

function keyPagesSection(): string {
    // Link lines follow the same llmstxt.org form llms.txt uses,
    // `- [Name](absolute-url): description`. The two files were listing the
    // same site in two different shapes, and a bare "url : description" line
    // is not part of the spec.
    return `## Key Pages

- [Job Board](${BASE_URL}/jobs): Live job board
- [Salary Guide](${BASE_URL}/salary-guide): National and state advertised-pay data
- [State Salary Pages](${BASE_URL}/salary-guide/california): Per-state pay pages; every state follows /salary-guide/{state-name-slug}
- [Career Resources](${BASE_URL}/resources): Career resources and state licensure guides
- [Career Tools](${BASE_URL}/tools): Free career tools (offer analyzer, salary converter, practice authority map)
- [Post a Job](${BASE_URL}/post-job): Employers: post a PMHNP job

## Machine-Readable Feeds

- [Jobs RSS Feed](${BASE_URL}/feed.xml): Recent jobs, employer-posted first
- [Full Jobs Feed](${BASE_URL}/feeds/jobs.xml): Full active inventory for aggregators
- [Salary Dataset CSV](${BASE_URL}/data/pmhnp-advertised-salaries.csv): State-level advertised pay (state, sample size, median, percentiles)
- [Sitemap Index](${BASE_URL}/api/sitemaps/index): Sitemap index

## Contact

- Website: ${BASE_URL}
- Email: contact@pmhnphiring.com
- Privacy: ${BASE_URL}/privacy
- Terms: ${BASE_URL}/terms
`;
}

/**
 * When the data this file reports last moved: the newest posting to enter the
 * dataset, or the newest employer renewal. The same signal the salary hub uses
 * for dateModified, and for the same reasons: never render time, which would
 * be a fabricated freshness stamp, and never updatedAt, which churns daily on
 * view counts. Without it the file says "right now" with nothing saying when
 * "now" was.
 *
 * The stamp is decorative and the figures are the payload, so a failure here
 * is logged and drops the line rather than costing the whole section.
 */
async function latestDataChange(): Promise<Date | null> {
    try {
        const agg = await prisma.job.aggregate({
            where: { isPublished: true },
            _max: { createdAt: true, lastRenewedAt: true },
        });
        const candidates = [agg?._max?.createdAt, agg?._max?.lastRenewedAt]
            .filter((d): d is Date => d instanceof Date);
        if (candidates.length === 0) return null;
        return new Date(Math.max(...candidates.map((d) => d.getTime())));
    } catch (err) {
        logger.error('[llms-full.txt] could not read the data-as-of signal, omitting the line', err);
        return null;
    }
}

async function liveFiguresSections(): Promise<string> {
    const [market, hubStates, settingMedians, totalPublished, dataAsOf] = await Promise.all([
        getOfferMarketData(),
        getHubStateSummaries(),
        getNationalSettingMedians(),
        prisma.job.count({ where: { isPublished: true } }),
        latestDataChange(),
    ]);

    const lines: string[] = [];

    lines.push('## Live Market Snapshot');
    lines.push('');
    if (dataAsOf) {
        lines.push(`- Data as of: ${dataAsOf.toISOString().split('T')[0]} (most recent posting or renewal in the dataset)`);
    }
    lines.push(`- Live published postings: ${totalPublished.toLocaleString('en-US')}`);
    lines.push(`- States currently publishing salary data: ${hubStates.length}`);
    lines.push('');

    const national = summarizeMidpoints(market.national);
    lines.push('## National Advertised Pay (computed from live postings)');
    lines.push('');
    if (national.tier === 'full') {
        lines.push(`- Median advertised salary: ${fmtDollars(national.median)} per year (n=${national.n.toLocaleString('en-US')})`);
        lines.push(`- Middle 50% of postings advertise: ${fmtDollars(national.p25)} to ${fmtDollars(national.p75)}`);
    } else if (national.tier === 'median') {
        lines.push(`- Median advertised salary: ${fmtDollars(national.median)} per year (n=${national.n})`);
    } else {
        lines.push('- Not enough postings currently disclose a range to publish national figures.');
    }
    if (national.tier === 'full' || national.tier === 'median') {
        lines.push(`- Hourly equivalent of the national median (derived: annual median divided by ${STANDARD_ANNUAL_HOURS.toLocaleString('en-US')} hours; not an advertised hourly rate): $${derivedHourly(national.median)} per hour`);
    }
    const remote = summarizeMidpoints(market.remote);
    if (remote.tier === 'full' || remote.tier === 'median') {
        lines.push(`- Fully remote postings, median advertised: ${fmtDollars(remote.median)} per year (n=${remote.n})`);
    }
    lines.push('');

    if (hubStates.length > 0) {
        lines.push('## Advertised Pay by State (median of advertised midpoints, ranked)');
        lines.push('');
        lines.push('State | Median (annual) | Hourly (derived) | Middle 50% | n');
        for (const s of hubStates) {
            const range = s.p25 != null && s.p75 != null
                ? `${fmtDollars(s.p25)} to ${fmtDollars(s.p75)}`
                : 'median only';
            lines.push(`${s.state} | ${fmtDollars(s.median)} | $${derivedHourly(s.median)}/hr | ${range} | ${s.n}`);
        }
        lines.push('');
        lines.push(`Hourly (derived) = annual median divided by ${STANDARD_ANNUAL_HOURS.toLocaleString('en-US')} hours; a computed conversion, not an advertised rate.`);
        lines.push(`Per-state detail pages: ${BASE_URL}/salary-guide/{state-slug}`);
        lines.push(`Machine-readable dataset (CSV): ${BASE_URL}/data/pmhnp-advertised-salaries.csv`);
        lines.push('');
    }

    if (settingMedians.length > 0) {
        lines.push('## Advertised Pay by Practice Setting (national medians)');
        lines.push('');
        for (const s of settingMedians) {
            lines.push(`- ${s.setting}: ${fmtDollars(s.median)} per year (n=${s.n})`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

export async function GET() {
    let live = '';
    try {
        live = await liveFiguresSections();
    } catch (error) {
        logger.error('[llms-full.txt] live figure computation failed, serving qualitative sections only:', error);
        live = `## Live Figures

Live computed figures are temporarily unavailable. Current numbers are always published at ${BASE_URL}/salary-guide.
`;
    }

    const body = [
        headerSection(),
        methodologySection(),
        live,
        practiceAuthoritySection(),
        keyPagesSection(),
    ].join('\n');

    return new NextResponse(body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
    });
}
