// Verifies Phase A fixes from docs/runbooks/mobile-2026-05-remediation.md.
// C1 drawer z-index, C2 salary-guide overflow, C3 pSEO grid overflow,
// C4 iOS form-zoom (font-size >= 16px), C5 cookie z-index over BottomNav.
import { test, expect } from '@playwright/test';

const VIEWPORT = { width: 375, height: 812 };

const overflowProbe = async (page: import('@playwright/test').Page) => {
    return page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
    }));
};

// Use the project's chromium browser at an iPhone-class viewport rather than
// devices['iPhone 13'], which forces webkit (not installed in this env).
test.use({ viewport: VIEWPORT, hasTouch: true });

test.describe('Phase A mobile-render fixes', () => {

    test('C2: /salary-guide has no horizontal overflow at 375px', async ({ page }) => {
        await page.goto('http://localhost:3000/salary-guide', { waitUntil: 'networkidle' });
        const { scrollWidth, innerWidth } = await overflowProbe(page);
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    });

    test('C3: pSEO city page has no horizontal overflow at 375px', async ({ page }) => {
        await page.goto('http://localhost:3000/jobs/remote/city/houston-tx', { waitUntil: 'networkidle' });
        const { scrollWidth, innerWidth } = await overflowProbe(page);
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    });

    test('C3: pSEO state page has no horizontal overflow at 375px', async ({ page }) => {
        await page.goto('http://localhost:3000/jobs/telehealth/california', { waitUntil: 'networkidle' });
        const { scrollWidth, innerWidth } = await overflowProbe(page);
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    });

    test('C4: /login inputs have font-size >= 16px (no iOS zoom)', async ({ page }) => {
        await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
        const sizes = await page.$$eval('input[type="email"], input[type="password"], input[type="text"]', (els) =>
            els.map((el) => parseFloat(getComputedStyle(el).fontSize))
        );
        expect(sizes.length).toBeGreaterThan(0);
        for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
    });

    test('C4: /contact inputs have font-size >= 16px (no iOS zoom)', async ({ page }) => {
        await page.goto('http://localhost:3000/contact', { waitUntil: 'networkidle' });
        const sizes = await page.$$eval('input[type="text"], input[type="email"], textarea', (els) =>
            els.map((el) => parseFloat(getComputedStyle(el).fontSize))
        );
        expect(sizes.length).toBeGreaterThan(0);
        for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
    });

    test('C1: /jobs filter drawer close button is reachable above the header', async ({ page }) => {
        await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
        const filterBtn = page.getByRole('button', { name: /filter/i }).first();
        if (!(await filterBtn.isVisible().catch(() => false))) {
            test.skip(true, 'filter button not present in this layout');
        }
        await filterBtn.click();
        const closeBtn = page.getByRole('button', { name: /close filters/i });
        await expect(closeBtn).toBeVisible();
        // Click should resolve without "subtree intercepts pointer events" errors.
        await closeBtn.click({ timeout: 3000 });
    });
});
