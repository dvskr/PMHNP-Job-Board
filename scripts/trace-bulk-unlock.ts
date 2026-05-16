/**
 * Playwright trace for the new file-manager-style bulk-unlock UX.
 * Selects 3 cards, hits "Unlock", verifies counter drops.
 *
 *   npx tsx scripts/trace-bulk-unlock.ts
 */
import { chromium } from 'playwright';

const EMAIL = 'test@pmhnphiring.com';
const PASSWORD = '1729@Akari';
const BASE = 'http://localhost:3000';

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Log in
    await page.goto(`${BASE}/employer/login`);
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await Promise.all([
        page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }),
        page.click('button[type=submit]'),
    ]);

    // Talent pool
    await page.goto(`${BASE}/employer/candidates`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Capture credits before
    const beforeCounter = await page.locator('text=/\\d+\\/\\d+ unlocks/').first().textContent().catch(() => null);
    console.log(`[counter-before] ${beforeCounter}`);

    // Click 3 select checkboxes (clay-card-select-btn)
    const selectBtns = page.locator('button.clay-card-select-btn');
    const count = await selectBtns.count();
    console.log(`[selectable-cards] ${count}`);
    if (count < 3) {
        console.error('Not enough selectable cards');
        await browser.close();
        return;
    }
    for (let i = 0; i < 3; i += 1) {
        await selectBtns.nth(i).click();
        await page.waitForTimeout(150);
    }

    // Toolbar should now show "3 selected"
    const toolbar = await page.locator('text=/\\d+ selected/').first().textContent().catch(() => null);
    console.log(`[toolbar] ${toolbar}`);

    // Click "Unlock N profiles"
    const unlockBtn = page.locator('button:has-text("Unlock ")').first();
    await unlockBtn.click();
    await page.waitForTimeout(3000);

    // Counter after
    const afterCounter = await page.locator('text=/\\d+\\/\\d+ unlocks/').first().textContent().catch(() => null);
    console.log(`[counter-after] ${afterCounter}`);

    // Number of "Viewed" badges visible
    const viewedCount = await page.locator('text=/^Viewed$|✓ Viewed/').count();
    console.log(`[viewed-badges-after] ${viewedCount}`);

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
