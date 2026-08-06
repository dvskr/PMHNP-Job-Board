import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getHubStateSummaries } from '@/lib/salary-report/market-data';
import { roundDisplayDollars } from '@/lib/salary-report/stats';

/**
 * /data/pmhnp-advertised-salaries.csv — public, machine-readable export of
 * the state-level advertised-pay dataset (organic audit 2026-08, D2).
 *
 * This is the DataDownload target of the Dataset JSON-LD on /salary-guide.
 * Every value is serialized from the SAME tier-gated engine the pages render
 * (lib/salary-report via getHubStateSummaries): states below the median tier
 * are omitted entirely, p25/p75 stay blank until a state clears the full
 * tier, and dollar values carry the same display rounding as the pages, so
 * this file can never contradict the visible tables.
 *
 * No auth, no tokens: the point is citability by AI systems, journalists,
 * and researchers. Degraded DB serves a 503, never a fabricated or partial
 * file.
 */

export const revalidate = 86400; // refresh daily, matching the salary pages

const CSV_HEADER = [
    'state',
    'sample_size_n',
    'median_advertised_annual_usd',
    'p25_advertised_annual_usd',
    'p75_advertised_annual_usd',
].join(',');

/** RFC 4180: quote fields containing commas, quotes, or newlines. */
function csvField(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET() {
    try {
        const states = await getHubStateSummaries();

        const rows = states.map((s) =>
            [
                csvField(s.state),
                String(s.n),
                String(roundDisplayDollars(s.median)),
                s.p25 != null ? String(roundDisplayDollars(s.p25)) : '',
                s.p75 != null ? String(roundDisplayDollars(s.p75)) : '',
            ].join(',')
        );

        const body = [CSV_HEADER, ...rows].join('\n') + '\n';

        return new NextResponse(body, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'inline; filename="pmhnp-advertised-salaries.csv"',
                'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            },
        });
    } catch (error) {
        logger.error('[salary-csv] dataset serialization failed:', error);
        return new NextResponse('Dataset temporarily unavailable.\n', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}
