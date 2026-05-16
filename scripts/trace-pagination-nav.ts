/**
 * Playwright trace for the talent-pool pagination + back-nav bug.
 * Logs URL at each step so we can see exactly where state is lost.
 *
 *   npx tsx scripts/trace-pagination-nav.ts
 *
 * Requires the dev server running on http://localhost:3000.
 */
import { chromium, type Page } from 'playwright';

const EMAIL = 'test@pmhnphiring.com';
const PASSWORD = '1729@Akari';
const BASE = 'http://localhost:3000';

async function logUrl(page: Page, label: string): Promise<void> {
    console.log(`[${label}] ${page.url()}`);
}

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: false, slowMo: 250 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.startsWith('[setPage]')) {
            console.log('  >> ' + text.replace(/\n/g, ' | '));
        }
    });

    // 1. Log in
    await page.goto(`${BASE}/employer/login`);
    await logUrl(page, 'after-login-nav');
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await Promise.all([
        page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }),
        page.click('button[type=submit]'),
    ]);
    await logUrl(page, 'after-login-submit');

    // 2. Navigate to talent pool — clear sessionStorage first so we start
    //    fresh (the previous run might have left talentPool_page=2).
    await page.goto(`${BASE}/employer/candidates`);
    await page.evaluate(() => sessionStorage.removeItem('talentPool_page'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await logUrl(page, 'talent-pool-initial');

    // 3. Click "Next" to go to page 2 — wait for it to appear after candidates load
    await page.waitForSelector('a:has-text("Next"), button:has-text("Next")', { timeout: 20000 }).catch(() => null);
    const nextBtn = page.locator('a:has-text("Next"), button:has-text("Next")').first();
    if (await nextBtn.count() === 0) {
        console.error('No Next button found — only one page of candidates?');
        await browser.close();
        return;
    }
    await nextBtn.click();
    // Wait until URL actually changes to include ?page=2
    await page.waitForURL((u) => u.toString().includes('page=2'), { timeout: 10000 });
    await page.waitForTimeout(500);
    await logUrl(page, 'after-clicking-next-once');

    console.log(`[history-length-on-page2] ${await page.evaluate(() => window.history.length)}`);
    console.log(`[history-state-on-page2] ${JSON.stringify(await page.evaluate(() => window.history.state))}`);

    // 4. Click a candidate card (the Unlock Profile / View Profile button)
    // Wait for cards to load after page navigation
    await page.waitForSelector('a:has-text("Unlock Profile"), a:has-text("View Profile")', { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(800);
    const cardLink = page.locator('a:has-text("Unlock Profile"), a:has-text("View Profile")').first();
    if (await cardLink.count() === 0) {
        console.error('No candidate card link found');
        await browser.close();
        return;
    }
    await cardLink.click();
    // Wait until URL changes to a profile URL
    await page.waitForURL((u) => /\/employer\/candidates\/[a-f0-9-]{36}/.test(u.toString()), { timeout: 10000 });
    await page.waitForTimeout(800);
    await logUrl(page, 'on-profile-page');

    console.log(`[history-length-on-profile] ${await page.evaluate(() => window.history.length)}`);

    // 5. Browser back
    await page.goBack();
    await page.waitForTimeout(100);
    await logUrl(page, 'back-immediate');
    await page.waitForTimeout(500);
    await logUrl(page, 'back-after-500ms');
    await page.waitForTimeout(1000);
    await logUrl(page, 'back-after-1500ms');
    await page.waitForTimeout(2000);
    await logUrl(page, 'back-after-3500ms');
    console.log(`[history-state-after-back] ${JSON.stringify(await page.evaluate(() => window.history.state))}`);
    // Verify the visible page indicator on the talent pool
    const pageIndicator = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
    console.log(`[visible-page-indicator] ${pageIndicator}`);
    const storedPage = await page.evaluate(() => sessionStorage.getItem('talentPool_page'));
    console.log(`[sessionStorage.talentPool_page] ${storedPage}`);

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
