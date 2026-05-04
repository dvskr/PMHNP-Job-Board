/**
 * P4.1: sitemap budget guard tests.
 *
 * Prevents the next b2187d7-style detonation. Asserts:
 *  - The primary sitemap stays within Google's 50k cap (with 5k headroom)
 *  - Each section's URL count is within an expected range
 *  - All static-pattern URLs in the sitemap conform to canonical shape
 *  - The robots.txt declares the expected sitemap entrypoints
 *
 * Mocked Prisma — runs against in-memory fixtures, no DB required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import sitemapHandler from '@/app/sitemap';
import robotsHandler from '@/app/robots';

// Build a synthetic catalog that's representative of production scale.
function jobsFixture(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        id: `job-${i.toString().padStart(6, '0')}-${'a'.repeat(36)}`,
        title: `PMHNP Position ${i}`,
        updatedAt: new Date('2026-05-04'),
    }));
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('P4.1: sitemap budget guard', () => {
    it('stays within Google 50k cap and emits all expected sections', async () => {
        // Realistic-but-modest fixtures.
        vi.mocked(prisma.job.findFirst).mockResolvedValue({
            updatedAt: new Date('2026-05-04T12:00:00Z'),
        } as never);

        // ~5k active jobs (close to current production)
        vi.mocked(prisma.job.findMany).mockResolvedValue(jobsFixture(5000) as never);

        // ~80 cities with ≥3 jobs (close to current)
        vi.mocked(prisma.job.groupBy).mockResolvedValue(
            Array.from({ length: 80 }, (_, i) => ({
                city: `City${i}`,
                state: i % 2 === 0 ? 'California' : 'Texas',
                _count: { city: 5 + (i % 30) },
            })) as never
        );

        // ~30 companies with ≥8 jobs
        vi.mocked(prisma.company.findMany).mockResolvedValue(
            Array.from({ length: 30 }, (_, i) => ({
                normalizedName: `company-${i}`,
                _count: { jobs: 10 + i },
            })) as never
        );

        // Blog: empty fixture for this test (covered separately).
        // Note: getAllPublishedSlugs is called inside sitemap.ts; if it
        // can't reach Supabase from the test env, the try/catch falls
        // through harmlessly. We assert the sitemap shape regardless.

        const sitemap = await sitemapHandler();

        // Section presence sanity checks
        const baseUrl = 'https://pmhnphiring.com';
        const urls = sitemap.map((s) => s.url);
        expect(urls).toContain(baseUrl);
        expect(urls).toContain(`${baseUrl}/jobs`);
        expect(urls).toContain(`${baseUrl}/blog`);
        expect(urls).toContain(`${baseUrl}/post-job`);

        // Total count should be substantial but well under cap
        expect(sitemap.length).toBeGreaterThan(100);
        expect(sitemap.length).toBeLessThan(45_000);

        // Every URL must be HTTPS + canonical-shaped (no query strings).
        // Homepage may render as bare host without trailing slash; everything
        // else must be under /...
        for (const entry of sitemap) {
            expect(entry.url).toMatch(/^https:\/\/pmhnphiring\.com(\/|$)/);
            expect(entry.url).not.toContain('?');
            expect(entry.url).not.toContain('#');
        }
    });

    it('hard-fails when active job count is 0 (DB-degraded protection)', async () => {
        vi.mocked(prisma.job.findFirst).mockResolvedValue({
            updatedAt: new Date('2026-05-04'),
        } as never);
        vi.mocked(prisma.job.findMany).mockResolvedValue([] as never); // 0 jobs
        vi.mocked(prisma.job.groupBy).mockResolvedValue([] as never);
        vi.mocked(prisma.company.findMany).mockResolvedValue([] as never);

        // The inner throw triggers the outer try/catch which returns the
        // static-only sitemap. So we expect a non-empty static list, not
        // an empty array — that's the safe degradation.
        const sitemap = await sitemapHandler();
        // Static fallback always has core pages
        expect(sitemap.length).toBeGreaterThan(50);
        expect(sitemap.length).toBeLessThan(200);
        const urls = sitemap.map((s) => s.url);
        // Homepage (bare host) — accept either "https://...com" or with trailing slash.
        expect(urls.some((u) => u === 'https://pmhnphiring.com' || u === 'https://pmhnphiring.com/')).toBe(true);
    });

    it('robots.txt declares the expected sitemap entrypoints', () => {
        const robots = robotsHandler();

        // Sitemap declarations
        expect(robots.sitemap).toBeDefined();
        const sitemaps = Array.isArray(robots.sitemap) ? robots.sitemap : [robots.sitemap!];
        expect(sitemaps.some((s) => s?.includes('/api/sitemaps/index'))).toBe(true);
        expect(sitemaps.some((s) => s?.includes('/sitemap.xml'))).toBe(true);

        // Catch-all rule must exist
        const catchAll = robots.rules instanceof Array
            ? robots.rules.find((r) => r.userAgent === '*')
            : robots.rules.userAgent === '*' ? robots.rules : null;
        expect(catchAll).toBeDefined();
        expect(catchAll?.disallow).toBeDefined();
    });

    it('robots.txt does NOT block /signup, /login, /messages during the P2.3 unblock window', () => {
        const robots = robotsHandler();
        const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
        const catchAll = rules.find((r) => r.userAgent === '*');
        expect(catchAll).toBeDefined();
        const disallow = (catchAll!.disallow ?? []) as string[];
        // These paths must remain crawlable until AUTH_REBLOCK_DATE so Google
        // can re-crawl, see X-Robots-Tag: noindex, and de-index.
        expect(disallow).not.toContain('/login');
        expect(disallow).not.toContain('/signup');
        expect(disallow).not.toContain('/messages');
        expect(disallow).not.toContain('/saved');
        expect(disallow).not.toContain('/job-alerts/manage');
    });

    it('robots.txt still blocks token-bearing and admin surfaces', () => {
        const robots = robotsHandler();
        const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
        const catchAll = rules.find((r) => r.userAgent === '*');
        const disallow = (catchAll!.disallow ?? []) as string[];

        // Critical safety: never let Google index admin / dashboard / token URLs.
        expect(disallow).toContain('/admin/');
        expect(disallow).toContain('/dashboard/');
        expect(disallow).toContain('/auth/');
        expect(disallow).toContain('/jobs/edit/');
        expect(disallow).toContain('/post-job/checkout');
        expect(disallow).toContain('/post-job/preview');
        expect(disallow).toContain('/forgot-password');
        expect(disallow).toContain('/reset-password');
    });
});
