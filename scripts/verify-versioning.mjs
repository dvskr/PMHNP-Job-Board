import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Strict region so banner shows
  extraHTTPHeaders: { 'x-vercel-ip-country': 'DE' },
});
const page = await ctx.newPage();

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(() => { try { localStorage.removeItem('pmhnp_cookie_consent'); } catch {} });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const bannerLocator = () => page.locator('div').filter({ hasText: 'We use cookies for analytics' }).first();

// Phase 1: banner shows on fresh DE visit, click Accept
console.log('--- Phase 1: fresh DE visit ---');
console.log('banner visible:', await bannerLocator().isVisible());

await page.click('button:has-text("Accept All")');
await page.waitForTimeout(800);

const afterAccept = await page.evaluate(() => localStorage.getItem('pmhnp_cookie_consent'));
console.log('stored after accept:', afterAccept);

// Phase 2: simulate stale-version (old bare-string consent → should re-prompt)
console.log('--- Phase 2: legacy bare-string consent ---');
await page.evaluate(() => localStorage.setItem('pmhnp_cookie_consent', 'accepted'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('banner visible after legacy bare-string:', await bannerLocator().isVisible());

// Phase 3: simulate prior version mismatch (version: '0' → should re-prompt)
console.log('--- Phase 3: version mismatch ---');
await page.evaluate(() => {
  localStorage.setItem(
    'pmhnp_cookie_consent',
    JSON.stringify({ value: 'accepted', version: '0', ts: Date.now() })
  );
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('banner visible after version mismatch:', await bannerLocator().isVisible());

// Phase 4: current-version consent → no banner
console.log('--- Phase 4: current-version consent ---');
await page.click('button:has-text("Accept All")');
await page.waitForTimeout(800);
const stored = await page.evaluate(() => localStorage.getItem('pmhnp_cookie_consent'));
console.log('stored:', stored);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('banner visible on revisit with current version:', await bannerLocator().isVisible());

// Phase 5: click "Cookie Settings" footer button → banner re-opens
console.log('--- Phase 5: Cookie Settings footer link ---');
const footerBtn = page.locator('button:has-text("Cookie Settings")').first();
console.log('footer button visible:', await footerBtn.isVisible());
await footerBtn.click();
await page.waitForTimeout(500);
console.log('banner visible after clicking Cookie Settings:', await bannerLocator().isVisible());
const storedAfterReopen = await page.evaluate(() => localStorage.getItem('pmhnp_cookie_consent'));
console.log('storage cleared by reopen:', storedAfterReopen);

await browser.close();
