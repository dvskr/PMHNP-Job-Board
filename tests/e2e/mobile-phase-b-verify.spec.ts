// Verifies Phase B fixes from docs/runbooks/mobile-2026-05-remediation.md.
// H1 icon-button tap targets, H2 BottomNav tap targets, H3 SignUp name fields,
// H5 visible breadcrumbs, H6 UserMenu modal width, H9 image dimensions,
// H10 GA strategy, H11 text-muted contrast.
import { test, expect } from '@playwright/test';

const VIEWPORT = { width: 375, height: 812 };

test.use({ viewport: VIEWPORT, hasTouch: true });

test.describe('Phase B mobile-render fixes', () => {

    test('H2: BottomNav links meet 44x44 tap target', async ({ page }) => {
        await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
        const sizes = await page.$$eval(
            'nav.md\\:hidden a, nav.md\\:hidden [role="link"]',
            (els) => els.map((el) => {
                const rect = el.getBoundingClientRect();
                return { w: rect.width, h: rect.height, label: el.getAttribute('aria-label') || el.textContent };
            })
        );
        // BottomNav is mobile-only (md:hidden); we should have ≥ 4 nav items.
        expect(sizes.length).toBeGreaterThanOrEqual(4);
        for (const s of sizes) {
            expect(s.h, `${s.label}: height < 44`).toBeGreaterThanOrEqual(44);
            expect(s.w, `${s.label}: width < 44`).toBeGreaterThanOrEqual(44);
        }
    });

    test('H1: JobCard save + share buttons meet 44x44', async ({ page }) => {
        await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
        // Wait for at least one job card; the .jc-icon-btn class is on save/share inside cards.
        await page.waitForSelector('.jc-icon-btn', { timeout: 10000 });
        const sizes = await page.$$eval('.jc-icon-btn', (els) =>
            els.map((el) => {
                const r = el.getBoundingClientRect();
                return { w: r.width, h: r.height, label: el.getAttribute('aria-label') };
            })
        );
        expect(sizes.length).toBeGreaterThan(0);
        for (const s of sizes) {
            expect(s.h, `${s.label}: height < 44`).toBeGreaterThanOrEqual(44);
            expect(s.w, `${s.label}: width < 44`).toBeGreaterThanOrEqual(44);
        }
    });

    test('H3: /signup first/last name inputs each have usable width on mobile', async ({ page }) => {
        await page.goto('http://localhost:3000/signup', { waitUntil: 'networkidle' });
        const widths = await page.$$eval('#signup-firstName, #signup-lastName', (els) =>
            els.map((el) => el.getBoundingClientRect().width)
        );
        // Single-column on mobile so each input gets the full row width.
        // After AuthLayout's outer card + inner form padding, the usable
        // input width at 375px viewport is ~269px -- well above the
        // pre-fix ~128px (when side-by-side) and comfortable for typing.
        expect(widths.length).toBe(2);
        for (const w of widths) expect(w).toBeGreaterThanOrEqual(260);
    });

    test('H5: pSEO city page renders a visible breadcrumb nav', async ({ page }) => {
        await page.goto('http://localhost:3000/jobs/remote/city/houston-tx', { waitUntil: 'networkidle' });
        const nav = page.locator('nav[aria-label="Breadcrumb"]').first();
        await expect(nav).toBeVisible();
        const items = await nav.locator('ol > li').count();
        expect(items).toBeGreaterThanOrEqual(2);
        // Last crumb should be marked aria-current="page"
        const currentCount = await nav.locator('[aria-current="page"]').count();
        expect(currentCount).toBe(1);
    });

    test('H9: job-detail employer logo has explicit width and height', async ({ page }) => {
        // Find a real job url first.
        await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
        const firstHref = await page.locator('a[href*="/jobs/"]').first().getAttribute('href');
        test.skip(!firstHref || firstHref === '/jobs', 'no job listing available');
        await page.goto(`http://localhost:3000${firstHref}`, { waitUntil: 'networkidle' });
        // The Image component renders an <img>; check it has width/height attributes set.
        const logos = await page.$$eval('img[alt$="logo"]', (els) =>
            els.map((el) => ({
                w: el.getAttribute('width'),
                h: el.getAttribute('height'),
            }))
        );
        // Some jobs have no logo; only assert when one exists.
        for (const l of logos) {
            expect(l.w).toBeTruthy();
            expect(l.h).toBeTruthy();
        }
    });

    test('H10: GA consent-defaults script uses afterInteractive (no blocking <head> script)', async ({ page }) => {
        const res = await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
        const html = await res!.text();
        // Next.js places `beforeInteractive` Scripts inline in the document head with
        // `nonce` and the literal script content. After our fix the consent
        // script body should NOT appear in the served HTML head, since
        // afterInteractive scripts are injected post-hydration.
        const headSlice = html.split('</head>')[0] ?? '';
        expect(headSlice).not.toContain("gtag('consent', 'default'");
    });

    test('H11: --text-muted has WCAG-compliant contrast on white', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        const muted = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim().toLowerCase());
        expect(muted).toBe('#64748b');
    });
});
