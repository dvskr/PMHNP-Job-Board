/**
 * AEO + salary-surface locks (organic audit 2026-08, workstream D).
 *
 *   D1 — state salary pages: metadata leads with the LIVE median, the
 *        FAQPage items render visibly, and dateModified comes from a real
 *        change signal, never render time.
 *   D2 — Dataset citability: /salary-guide emits Dataset JSON-LD pointing
 *        at the public CSV, and the CSV serializes from the SAME tier-gated
 *        engine (no hand-typed dollar figures anywhere in the route).
 *   D3 — hourly answers are derived (annual / 2080) and labeled as such.
 *   D4 — llms.txt list lines are absolute markdown links per llmstxt.org.
 *   D7 — /tools pages get autoLink patterns and job-detail related links.
 *
 * Source-reading regression locks in the tests/api/renewal-cta.test.ts
 * style, plus functional assertions against the real route handlers with
 * the globally-mocked prisma.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { GET as llmsGet } from '@/app/llms.txt/route';
import { GET as llmsFullGet } from '@/app/llms-full.txt/route';
import { GET as salaryCsvGet } from '@/app/data/pmhnp-advertised-salaries.csv/route';
import { autoLinkCategories, getJobRelatedResources } from '@/lib/autoLink';

const resolve = (rel: string): string => path.resolve(__dirname, '../../', rel);
const read = (rel: string): string => fs.readFileSync(resolve(rel), 'utf8');

// A literal dollar amount in source ("$155", "$110K") is the banned pattern.
// Interpolated values (`$${...}`) do not match.
const HARDCODED_DOLLAR = /\$\d/;

/**
 * Fixture: 12 clean California rows (full tier, midpoint $140k) and 6 clean
 * Texas rows (median tier, midpoint $130k). Every dollar the surfaces emit
 * must be computed from these rows by the engine, never typed by hand.
 */
function mockMarketRows() {
    const caRows = Array.from({ length: 12 }, () => ({
        normalizedMinSalary: 120000,
        normalizedMaxSalary: 160000,
        salaryIsEstimated: false,
        state: 'California',
        isRemote: false,
        isHybrid: false,
        title: 'Outpatient PMHNP',
        jobType: 'Full-Time',
    }));
    const txRows = Array.from({ length: 6 }, () => ({
        normalizedMinSalary: 110000,
        normalizedMaxSalary: 150000,
        salaryIsEstimated: false,
        state: 'Texas',
        isRemote: false,
        isHybrid: false,
        title: 'PMHNP',
        jobType: 'Full-Time',
    }));
    vi.mocked(prisma.job.findMany).mockResolvedValue([...caRows, ...txRows] as never);
    vi.mocked(prisma.job.count).mockResolvedValue(18 as never);
}

// ── D2: public CSV dataset route ─────────────────────────────────────────

describe('D2 — /data/pmhnp-advertised-salaries.csv', () => {
    it('route exists, serializes from the tier-gated engine, revalidates daily, no auth', () => {
        const src = read('app/data/pmhnp-advertised-salaries.csv/route.ts');
        expect(src).toMatch(/@\/lib\/salary-report\/market-data/);
        expect(src).toMatch(/getHubStateSummaries/);
        expect(src).toMatch(/roundDisplayDollars/);
        expect(src).toMatch(/export const revalidate = 86400/);
        expect(src).not.toMatch(HARDCODED_DOLLAR);
        expect(src).not.toMatch(/getCurrentUser|requireAuth|CRON_SECRET|x-api-key|Authorization/);
    });

    it('CSV values are computed by the engine (parity), below-tier percentiles stay blank', async () => {
        mockMarketRows();
        const res = await salaryCsvGet();
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
        const body = await res.text();
        const lines = body.trim().split('\n');
        expect(lines[0]).toBe(
            'state,sample_size_n,median_advertised_annual_usd,p25_advertised_annual_usd,p75_advertised_annual_usd'
        );
        // Median of 12 identical $140k midpoints — full tier, p25 = p75 = median.
        expect(lines).toContain('California,12,140000,140000,140000');
        // 6 rows is median tier: percentile columns must stay empty, not estimated.
        expect(lines).toContain('Texas,6,130000,,');
        // Only the 2 states that clear the tier gate plus the header.
        expect(lines.length).toBe(3);
    });

    it('serves 503 when the DB is degraded, never a fabricated file', async () => {
        vi.mocked(prisma.job.findMany).mockRejectedValue(new Error('db down') as never);
        const res = await salaryCsvGet();
        expect(res.status).toBe(503);
        const body = await res.text();
        expect(body).not.toMatch(/\d{5,}/); // no salary-shaped numbers
    });
});

describe('D2 — Dataset JSON-LD on /salary-guide', () => {
    const hub = read('app/salary-guide/page.tsx');

    it('emits Dataset schema through jsonLdString pointing at the CSV', () => {
        expect(hub).toMatch(/"@type":\s*"Dataset"/);
        expect(hub).toMatch(/jsonLdString\(datasetSchema\)/);
        expect(hub).toContain('/data/pmhnp-advertised-salaries.csv');
        expect(hub).toMatch(/"encodingFormat":\s*"text\/csv"/);
    });

    it('hub dateModified comes from a real change signal, never render time', () => {
        expect(hub).not.toMatch(/dateModified["']?\s*:\s*new Date\(\)\.toISOString\(\)/);
        expect(hub).toMatch(/latestChangeAt/);
        expect(hub).toMatch(/lastRenewedAt/);
    });

    it('links the BLS and HRSA mentions to their STAT_SOURCES.sourceUrl values (D5)', () => {
        expect(hub).toMatch(/STAT_SOURCES\.blsGrowthProjection\.sourceUrl/);
        expect(hub).toMatch(/STAT_SOURCES\.hrsaShortagePopulation\.sourceUrl/);
        // The figures route through STAT_SOURCES too — no re-hardcoded stat.
        expect(hub).toMatch(/STAT_SOURCES\.blsGrowthProjection\.formatted/);
        expect(hub).toMatch(/STAT_SOURCES\.hrsaShortagePopulation\.formatted/);
    });
});

// ── D3: hourly answers are derived and labeled ───────────────────────────

describe('D3 — hourly equivalents', () => {
    it('salary-guide hub derives hourly from the annual median and labels it', () => {
        const hub = read('app/salary-guide/page.tsx');
        expect(hub).toMatch(/STANDARD_ANNUAL_HOURS = 2080/);
        expect(hub).toMatch(/derivedHourly/);
        expect(hub).toMatch(/derived/i);
        // No hand-typed hourly dollar figure anywhere near the feature.
        expect(hub).not.toMatch(/\$\d+\s*(?:per hour|\/hr)/i);
    });

    it('llms-full.txt derives hourly from the annual median and labels it', () => {
        const src = read('app/llms-full.txt/route.ts');
        expect(src).toMatch(/STANDARD_ANNUAL_HOURS = 2080/);
        expect(src).toMatch(/derivedHourly/);
        expect(src).not.toMatch(HARDCODED_DOLLAR);
    });

    it('llms-full.txt renders the derived hourly column computed by the engine', async () => {
        mockMarketRows();
        const res = await llmsFullGet();
        const body = await res.text();
        expect(body).toContain('Hourly (derived)');
        // 140000 / 2080 = 67.3 → 67; computed, not typed.
        expect(body).toContain('California | $140,000 | $67/hr');
        expect(body).toMatch(/derived: annual median divided by 2,080 hours/);
        expect(body).toMatch(/not an advertised hourly rate/);
        expect(body).toContain('/data/pmhnp-advertised-salaries.csv');
    });
});

// ── D4: llms.txt markdown-link format ────────────────────────────────────

describe('D4 — llms.txt list lines are absolute markdown links', () => {
    it('every list line in the link sections follows [name](absolute-url): notes', async () => {
        const res = await llmsGet();
        const body = await res.text();
        const start = body.indexOf('## Answer Surfaces');
        const end = body.indexOf('## Data Practices');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const listLines = body
            .slice(start, end)
            .split('\n')
            .filter((l) => l.startsWith('- '));
        expect(listLines.length).toBeGreaterThan(15);
        for (const line of listLines) {
            expect(line).toMatch(/^- \[[^\]]+\]\(https:\/\/pmhnphiring\.com[^\s)]*\): .+/);
        }
    });

    it('advertises the public salary dataset CSV and stays numbers-free', async () => {
        const res = await llmsGet();
        const body = await res.text();
        expect(body).toContain('https://pmhnphiring.com/data/pmhnp-advertised-salaries.csv');
        expect(body).not.toMatch(HARDCODED_DOLLAR);
    });
});

// ── D1: state salary pages ───────────────────────────────────────────────

describe('D1 — state salary page honesty', () => {
    const src = read('app/salary-guide/[state]/page.tsx');

    it('metadata leads with the live median from the tier-gated engine', () => {
        // The literal title template — degrades to a count-free title, never
        // an invented figure.
        expect(src).toMatch(/\$\$\{medK\}K Median/);
        expect(src).toMatch(/getOfferMarketData/);
        expect(src).toMatch(/summarizeMidpoints/);
        // No hardcoded year in titles — computed each render.
        expect(src).not.toMatch(/: 2026 Pay & Jobs/);
    });

    it('dateModified is a real change signal, never render time, with a datePublished', () => {
        expect(src).not.toMatch(/dateModified:\s*new Date\(\)\.toISOString\(\)/);
        expect(src).toMatch(/latestChangeAt/);
        expect(src).toMatch(/datePublished/);
        // The signal must not be job.updatedAt (daily churn from view counts).
        expect(src).not.toMatch(/_max:\s*\{[^}]*updatedAt/);
    });

    it('renders the FAQPage items visibly (schema + visible content, same data)', () => {
        const mapCalls = (src.match(/faqItems\.map/g) || []).length;
        expect(mapCalls).toBeGreaterThanOrEqual(2);
        expect(src).toMatch(/<details/);
        expect(src).toMatch(/Frequently Asked Questions/);
    });
});

// ── D7: internal linking for the /tools push ─────────────────────────────

describe('D7 — tools internal linking', () => {
    it('autoLinkCategories links tool mentions in blog HTML', () => {
        expect(
            autoLinkCategories('<p>Run the numbers through the offer analyzer before countering.</p>')
        ).toContain('href="/tools/offer-analyzer"');
        expect(
            autoLinkCategories('<p>See the practice authority map for your state.</p>')
        ).toContain('href="/tools/practice-authority-map"');
        expect(
            autoLinkCategories('<p>Use a 1099 vs W-2 calculator to compare the packages.</p>')
        ).toContain('href="/tools/1099-vs-w2-calculator"');
        expect(
            autoLinkCategories('<p>Try the salary converter on any hourly quote.</p>')
        ).toContain('href="/tools/salary-converter"');
    });

    it('every job gets the Offer Analyzer in related resources', () => {
        const links = getJobRelatedResources({ state: 'Texas', title: 'PMHNP' });
        expect(links.some((l) => l.href === '/tools/offer-analyzer')).toBe(true);
    });

    it('hourly-quoted job types add the converter and the 1099 calculator', () => {
        const links = getJobRelatedResources({ jobType: 'Travel', title: 'PMHNP' });
        expect(links.some((l) => l.href === '/tools/salary-converter')).toBe(true);
        expect(links.some((l) => l.href === '/tools/1099-vs-w2-calculator')).toBe(true);
    });

    it('salary-guide label year is computed, never hardcoded', () => {
        const links = getJobRelatedResources({ title: 'PMHNP' });
        const sg = links.find((l) => l.href === '/salary-guide');
        expect(sg?.label).toBe(`${new Date().getFullYear()} PMHNP Salary Guide`);
        expect(read('lib/autoLink.ts')).not.toMatch(/'2026 PMHNP Salary Guide'/);
    });
});
