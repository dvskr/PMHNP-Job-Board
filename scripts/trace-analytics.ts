/**
 * Playwright trace for the employer analytics dashboard.
 *   npx tsx scripts/trace-analytics.ts
 *
 * Requires the dev server running on http://localhost:3000.
 */
import { chromium } from 'playwright';

const EMAIL = 'test@pmhnphiring.com';
const PASSWORD = '1729@Akari';
const BASE = 'http://localhost:3000';

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();

    // 1. Log in
    await page.goto(`${BASE}/employer/login`);
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await Promise.all([
        page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }),
        page.click('button[type=submit]'),
    ]);

    // 2. Navigate to analytics
    await page.goto(`${BASE}/employer/analytics`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    console.log(`[url] ${page.url()}`);

    // 3. Check for summary cards
    const totalViewsLabel = await page.locator('text="Total views"').first().count();
    const applyClicksLabel = await page.locator('text="Apply clicks"').first().count();
    const ctrLabel = await page.locator('text="CTR"').first().count();
    console.log(`[summary-cards] views=${totalViewsLabel} clicks=${applyClicksLabel} ctr=${ctrLabel}`);

    // Capture summary values
    const summaryCards = await page.locator('span').filter({ hasText: /^[\d,.]+%?$/ }).allTextContents();
    console.log(`[summary-values-sample] ${summaryCards.slice(0, 6).join(' | ')}`);

    // 4. Check for table / empty state
    const tableExists = await page.locator('table').count();
    const emptyState = await page.locator('text=/No job activity yet|empty/i').count();
    console.log(`[table] count=${tableExists}  empty=${emptyState}`);

    if (tableExists > 0) {
        const rowCount = await page.locator('table tbody tr').count();
        console.log(`[table-rows] ${rowCount}`);

        // First row preview
        const firstRow = await page.locator('table tbody tr').first().textContent();
        console.log(`[first-row] ${firstRow}`);

        // 5. Test sort buttons
        const sortButtons = page.locator('button:has-text("Views"), button:has-text("Clicks"), button:has-text("CTR")');
        console.log(`[sort-buttons] ${await sortButtons.count()}`);
        // Click "Clicks" to change sort
        const clicksBtn = page.locator('button:has-text("Clicks")').first();
        if (await clicksBtn.count() > 0) {
            const beforeFirstRow = await page.locator('table tbody tr').first().textContent();
            await clicksBtn.click();
            await page.waitForTimeout(400);
            const afterFirstRow = await page.locator('table tbody tr').first().textContent();
            console.log(`[sort-by-clicks] same-as-before=${beforeFirstRow === afterFirstRow}`);
        }

        // 6. CSV download
        const downloadBtn = page.locator('button:has-text("Download"), button:has-text("Export"), button:has(svg.lucide-download)').first();
        if (await downloadBtn.count() > 0) {
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
                downloadBtn.click(),
            ]);
            if (download) {
                console.log(`[csv-download] suggested=${download.suggestedFilename()}`);
            } else {
                console.log('[csv-download] no download event fired');
            }
        } else {
            console.log('[csv-download] no download button found');
        }
    }

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
