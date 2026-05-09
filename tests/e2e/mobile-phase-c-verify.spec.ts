// Verifies Phase C fixes from docs/runbooks/mobile-2026-05-remediation.md.
// M2 Header logo sizes, M3 pSEO Image sizes, M4 BottomNav SSR, M5 FeedbackWidget,
// M9 Breadcrumb truncation, L1 401 console quiet on anonymous pages.
import { test, expect } from '@playwright/test';

const VIEWPORT = { width: 375, height: 812 };

test.use({ viewport: VIEWPORT, hasTouch: true });

test.describe('Phase C mobile-render fixes', () => {

    test('M2: Header logo has sizes="56px"', async ({ page }) => {
        const res = await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
        const html = await res!.text();
        // Confirm the preload-link signals 56px (not 100vw).
        expect(html).toMatch(/imageSizes="56px"/);
    });

    test('M3: pSEO bento Images have sizes attribute', async ({ page }) => {
        await page.goto('http://localhost:3000/jobs/remote/city/houston-tx', { waitUntil: 'networkidle' });
        // Heuristic: at least one bento Image should advertise responsive sizes,
        // not the next/image default of 100vw on a non-fill image.
        const sizesAttrs = await page.$$eval('main img[srcset]', (els) =>
            els.map((el) => el.getAttribute('sizes')).filter(Boolean)
        );
        // At minimum the bento + explore-card icons should render with sizes.
        expect(sizesAttrs.length).toBeGreaterThan(0);
    });

    test('M4: BottomNav is server-rendered (present in initial HTML)', async ({ page }) => {
        const res = await page.goto('http://localhost:3000/jobs', { waitUntil: 'domcontentloaded' });
        const html = await res!.text();
        // Static-rendered BottomNav: the 4 nav labels should appear in the SSR HTML.
        // (Previously dynamic({ssr:false}) meant they were absent until hydration.)
        expect(html).toContain('Saved');
        expect(html).toContain('Messages');
        expect(html).toContain('Briefcase'); // not the icon name; the className wouldn't appear
        // Stronger check: nav with md:hidden class is in the initial markup.
        expect(html).toMatch(/<nav[^>]*md:hidden/);
    });

    // M5 has no runtime E2E coverage: FeedbackWidget renders nothing until a
    // logged-in user reaches their 3rd visit AND idles for 60 seconds. The
    // class change is a single-line className verified by source diff.

    test('M9: Breadcrumb current-page max-width tighter on mobile', async ({ page }) => {
        // /jobs/[slug] uses Breadcrumbs. Find a real job url first.
        await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
        const firstHref = await page.locator('a[href*="/jobs/"]').first().getAttribute('href');
        test.skip(!firstHref || firstHref === '/jobs', 'no job listing available');
        await page.goto(`http://localhost:3000${firstHref}`, { waitUntil: 'networkidle' });
        const html = await page.content();
        // The truncate cap should be 140px on mobile (was 200px before fix).
        expect(html).toMatch(/max-w-\[140px\] sm:max-w-none/);
    });

    test('L1: anonymous home + jobs do NOT trigger 401 to /api/applications or /api/saved-jobs', async ({ page }) => {
        // Capture 401s for the two endpoints during initial load.
        const failures: string[] = [];
        page.on('response', (resp) => {
            const u = resp.url();
            if ((u.includes('/api/applications') || u.includes('/api/saved-jobs')) && resp.status() === 401) {
                failures.push(`${resp.status()} ${u}`);
            }
        });
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
        // We are anonymous (no Supabase cookie); the new auth-cookie heuristic
        // should skip the fetch entirely.
        expect(failures).toEqual([]);
    });
});
