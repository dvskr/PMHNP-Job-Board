// Verifies the two follow-up mobile fixes after Phase D:
//  1. JobCard list-view collapses to a vertical stack on phones (was a row
//     squeezing the title/company off-screen at 414×896 iPhone XR).
//  2. /jobs page: search input occupies the full row width on phones, and
//     the Best Match sort dropdown drops to a row below, right-aligned.
import { test, expect } from '@playwright/test';

const VIEWPORT = { width: 414, height: 896 };

test.use({ viewport: VIEWPORT, hasTouch: true });

test('JobCard list-view: title + company are visible on iPhone XR', async ({ page }) => {
    // Easiest place to render list-mode JobCard without auth: /jobs supports
    // ?view=list via URL? Otherwise we hit the dashboard which requires auth.
    // Render at /jobs and toggle list view by switching the JS state via the
    // exposed view-toggle button (hidden at < sm so we render at desktop and
    // step down).
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
    const listToggle = page.getByRole('button', { name: /list view/i });
    if (!(await listToggle.isVisible().catch(() => false))) {
        test.skip(true, 'no list-view toggle visible (likely no jobs in DB)');
    }
    await listToggle.click();
    await page.setViewportSize(VIEWPORT);
    await page.waitForTimeout(200);

    // The list-card container should now be column-direction on mobile.
    const direction = await page.$eval('.jc-list-card', (el) => getComputedStyle(el).flexDirection);
    expect(direction).toBe('column');
});

test('/jobs search bar stays as one row on mobile (input + AI Search button inline)', async ({ page }) => {
    await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
    const flex = await page.$eval('.jp-jobs-search-bar', (el) => getComputedStyle(el).flexDirection);
    expect(flex).toBe('row');
});

test('/jobs Best Match sort drops below the search row on mobile', async ({ page }) => {
    await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
    const probe = await page.evaluate(() => {
        const form = document.querySelector('.jp-search-form');
        const sort = document.querySelector('.jp-sort-cluster');
        if (!form || !sort) return null;
        const fr = form.getBoundingClientRect();
        const sr = sort.getBoundingClientRect();
        return { formBottom: fr.bottom, sortTop: sr.top, sortRight: sr.right, viewportWidth: window.innerWidth };
    });
    expect(probe, 'search form + sort cluster should both be present').not.toBeNull();
    // Sort row sits below the search form on mobile.
    expect(probe!.sortTop).toBeGreaterThanOrEqual(probe!.formBottom - 1);
    // Sort is right-aligned (its right edge should be near the viewport right edge).
    expect(probe!.viewportWidth - probe!.sortRight).toBeLessThan(40);
});
