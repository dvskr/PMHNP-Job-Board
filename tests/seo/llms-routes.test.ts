/**
 * llms.txt surface locks (distribution audit D2).
 *
 * The old static public/llms.txt and public/llms-full.txt carried fabricated
 * salary tables that contradicted the live stats engine — the exact failure
 * mode lib/salary-report exists to prevent. They are now route handlers:
 * llms.txt is a curated, numbers-free map of the site's answer surfaces;
 * llms-full.txt computes every figure from lib/salary-report at request time.
 *
 * These tests lock:
 *   1. The static files stay deleted (public/ files shadow app routes).
 *   2. Neither route source contains a hardcoded dollar figure.
 *   3. llms-full figures come from the stats engine and render correctly.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { GET as llmsGet } from '@/app/llms.txt/route';
import { GET as llmsFullGet } from '@/app/llms-full.txt/route';

const resolve = (rel: string): string => path.resolve(__dirname, '../../', rel);
const read = (rel: string): string => fs.readFileSync(resolve(rel), 'utf8');

// A literal dollar amount in source ("$155", "$110K") is the banned pattern.
// Interpolated values (`$${...}`) and computed strings do not match.
const HARDCODED_DOLLAR = /\$\d/;

describe('static llms files are gone', () => {
    it('public/llms.txt no longer exists (it would shadow the route handler)', () => {
        expect(fs.existsSync(resolve('public/llms.txt'))).toBe(false);
    });

    it('public/llms-full.txt no longer exists', () => {
        expect(fs.existsSync(resolve('public/llms-full.txt'))).toBe(false);
    });

    it('the replacement route handlers exist', () => {
        expect(fs.existsSync(resolve('app/llms.txt/route.ts'))).toBe(true);
        expect(fs.existsSync(resolve('app/llms-full.txt/route.ts'))).toBe(true);
    });
});

describe('llms.txt route (curated, numbers-free)', () => {
    it('source contains no hardcoded dollar figures', () => {
        expect(read('app/llms.txt/route.ts')).not.toMatch(HARDCODED_DOLLAR);
    });

    it('serves text/plain with the key answer surfaces and no dollar figures', async () => {
        const res = await llmsGet();
        expect(res.headers.get('Content-Type')).toContain('text/plain');
        const body = await res.text();
        expect(body).toContain('/salary-guide');
        expect(body).toContain('/feeds/jobs.xml');
        expect(body).toContain('/resources/multi-state-licensure');
        expect(body).not.toMatch(HARDCODED_DOLLAR);
        // No em/en dashes in user-facing copy (repo copy rule).
        expect(body).not.toMatch(/[–—]/);
    });
});

describe('llms-full.txt route (computed from lib/salary-report)', () => {
    it('source contains no hardcoded dollar figures', () => {
        expect(read('app/llms-full.txt/route.ts')).not.toMatch(HARDCODED_DOLLAR);
    });

    it('lists links in the same llmstxt.org form as llms.txt', () => {
        const src = read('app/llms-full.txt/route.ts');
        // `- [Name](url): description`, not a bare `url : description` line.
        expect(src).toMatch(/- \[Job Board\]\(\$\{BASE_URL\}\/jobs\):/);
        expect(src).toMatch(/- \[Jobs RSS Feed\]\(\$\{BASE_URL\}\/feed\.xml\):/);
        expect(src).not.toMatch(/\$\{BASE_URL\}\/jobs : /);
    });

    it('imports the stats engine and revalidates daily', () => {
        const src = read('app/llms-full.txt/route.ts');
        expect(src).toMatch(/@\/lib\/salary-report\/market-data/);
        expect(src).toMatch(/@\/lib\/salary-report\/stats/);
        expect(src).toMatch(/export const revalidate = 86400/);
    });

    it('computes state medians from live rows through the stats engine', async () => {
        // 12 California rows (full tier) + 6 Texas rows (median tier), all
        // clean per the quarantine gates. Six carry a Telehealth title so
        // the setting section clears its own n >= 5 floor.
        const caRows = Array.from({ length: 12 }, (_, i) => ({
            normalizedMinSalary: 120000,
            normalizedMaxSalary: 160000,
            salaryIsEstimated: false,
            state: 'California',
            isRemote: false,
            isHybrid: false,
            title: i < 6 ? 'Telehealth PMHNP' : 'Outpatient PMHNP',
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
        // Same fixture for every findMany call — the market-data helpers
        // issue separate scans with different selects over the same table.
        vi.mocked(prisma.job.findMany).mockResolvedValue([...caRows, ...txRows] as never);
        vi.mocked(prisma.job.count).mockResolvedValue(1234 as never);
        // The "data as of" stamp reads the newest posting/renewal, the same
        // change signal the salary hub uses for dateModified.
        vi.mocked(prisma.job.aggregate).mockResolvedValue({
            _max: { createdAt: new Date('2026-09-20T10:00:00.000Z'), lastRenewedAt: new Date('2026-09-22T10:00:00.000Z') },
        } as never);

        const res = await llmsFullGet();
        expect(res.headers.get('Content-Type')).toContain('text/plain');
        const body = await res.text();

        // Figures computed by the engine, not typed by hand.
        expect(body).toContain('California | $140,000'); // median of 12 x mid-140k
        expect(body).toContain('Texas | $130,000');      // median of 6 x mid-130k
        expect(body).toContain('Telehealth: $140,000');  // setting median, n=6
        expect(body).toContain('1,234');                 // live posting count
        // Dated from real data movement, not from render time.
        expect(body).toContain('Data as of: 2026-09-22');
        expect(body).toContain('n=');                    // every figure ships with n
        expect(body).not.toContain('NaN');
        expect(body).toContain('advertised');            // framing rule
        expect(body).not.toMatch(/[–—]/);
    });

    it('omits figures instead of inventing them when the DB is degraded', async () => {
        vi.mocked(prisma.job.findMany).mockRejectedValue(new Error('db down') as never);
        vi.mocked(prisma.job.count).mockRejectedValue(new Error('db down') as never);
        vi.mocked(prisma.job.aggregate).mockRejectedValue(new Error('db down') as never);

        const res = await llmsFullGet();
        const body = await res.text();
        expect(res.status).toBe(200);
        expect(body).toContain('temporarily unavailable');
        // Degraded output must not carry any dollar figure other than the
        // methodology's engine-constant quarantine bounds ($50k / $500k).
        const dollarMatches = body.match(/\$\d[\dk,]*/g) || [];
        expect(dollarMatches.every((m) => m === '$50k' || m === '$500k')).toBe(true);
    });
});
/**
 * The same no-fabrication rule, applied to the static entity files.
 *
 * public/humans.txt is linked from every page as <link rel="author">, and
 * public/.well-known/ai-plugin.json is the manifest a model reads to decide
 * what this site is. They claimed "4,135+ cities", "100,000+ indexed content
 * pages" and per-city "cost of living adjustments" while the sitemap was
 * deliberately gated down and those features do not exist. The guard existed
 * but only covered the two route handlers, so the static files drifted.
 */
describe('static entity files carry no invented counts or coverage', () => {
    const HUMANS = 'public/humans.txt';
    const PLUGIN = 'public/.well-known/ai-plugin.json';
    const AI_TXT = 'public/ai.txt';

    // "4,135+", "100,000+", "24 job categories": a bare quantity attached to a
    // coverage noun. Version numbers (Next.js 15, React 19, ES2024) and the
    // "50 US states" constant are not coverage claims.
    const COUNT_CLAIM = /\d{1,3}(,\d{3})+\+?|\d+\+\s*(cities|pages|categories|jobs|employers|states)/i;

    it('humans.txt makes no numeric coverage claim and no dollar figure', () => {
        const body = read(HUMANS);
        expect(body).not.toMatch(COUNT_CLAIM);
        expect(body).not.toMatch(HARDCODED_DOLLAR);
        expect(body).not.toMatch(/[–—]/);
    });

    it('humans.txt drops the superlative positioning llms.txt refuses to make', () => {
        expect(read(HUMANS)).not.toMatch(/most comprehensive/i);
    });

    it('ai-plugin.json promises only capabilities the site actually exposes', () => {
        const json = JSON.parse(read(PLUGIN));
        const model: string = json.description_for_model;
        expect(model).not.toMatch(COUNT_CLAIM);
        expect(model).not.toMatch(/cost of living/i);
        expect(model).not.toMatch(/shortage area/i);
        // The positioning line stays anchored to the one in llms.txt.
        expect(model).toMatch(/specialized job board for Psychiatric Mental Health Nurse Practitioners/);
    });

    it('ai.txt names no data source the site does not attribute, and no stale date', () => {
        const body = read(AI_TXT);
        expect(body).not.toMatch(/Census/i);
        expect(body).not.toMatch(/Last updated:/i);
        // Path rules live in robots.txt only: a second hand-kept copy drifts.
        expect(body).not.toMatch(/^Disallow:/m);
        expect(body).toMatch(/robots\.txt/);
    });
});
