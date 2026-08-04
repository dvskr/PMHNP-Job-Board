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

        const res = await llmsFullGet();
        expect(res.headers.get('Content-Type')).toContain('text/plain');
        const body = await res.text();

        // Figures computed by the engine, not typed by hand.
        expect(body).toContain('California | $140,000'); // median of 12 x mid-140k
        expect(body).toContain('Texas | $130,000');      // median of 6 x mid-130k
        expect(body).toContain('Telehealth: $140,000');  // setting median, n=6
        expect(body).toContain('1,234');                 // live posting count
        expect(body).toContain('n=');                    // every figure ships with n
        expect(body).not.toContain('NaN');
        expect(body).toContain('advertised');            // framing rule
        expect(body).not.toMatch(/[–—]/);
    });

    it('omits figures instead of inventing them when the DB is degraded', async () => {
        vi.mocked(prisma.job.findMany).mockRejectedValue(new Error('db down') as never);
        vi.mocked(prisma.job.count).mockRejectedValue(new Error('db down') as never);

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
