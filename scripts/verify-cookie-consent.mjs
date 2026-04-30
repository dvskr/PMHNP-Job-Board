import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  extraHTTPHeaders: { 'x-vercel-ip-country': 'DE' },
});
const page = await ctx.newPage();

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Banner should be visible (DE, no prior consent)
const banner = page.getByRole('dialog', { name: 'Cookie consent' });
console.log('banner visible (fresh DE visit):', await banner.isVisible());

// Read all cookies — there should NOT be a pmhnp_consent_v2 yet
const before = await ctx.cookies();
const consentCookieBefore = before.find(c => c.name === 'pmhnp_consent_v2');
console.log('pmhnp_consent_v2 BEFORE accept:', consentCookieBefore || 'absent');

// Accept All — banner should POST /api/consent
await banner.getByRole('button', { name: 'Accept All' }).click();
await page.waitForTimeout(1000);

const after = await ctx.cookies();
const consentCookieAfter = after.find(c => c.name === 'pmhnp_consent_v2');
console.log('pmhnp_consent_v2 AFTER accept:', consentCookieAfter
  ? { httpOnly: consentCookieAfter.httpOnly, sameSite: consentCookieAfter.sameSite, value: consentCookieAfter.value.slice(0, 60) + '...' }
  : 'MISSING');

// Reload — banner should NOT show now (server reads cookie)
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('banner visible after reload:', await banner.isVisible());

// localStorage should be empty (we no longer write there)
const ls = await page.evaluate(() => localStorage.getItem('pmhnp_cookie_consent'));
console.log('localStorage pmhnp_cookie_consent:', ls);

// Cookie Settings reopen → DELETE /api/consent → cookie cleared, banner shows
await page.getByRole('button', { name: 'Cookie Settings' }).click();
await page.waitForTimeout(1000);
const afterReopen = await ctx.cookies();
const consentAfterReopen = afterReopen.find(c => c.name === 'pmhnp_consent_v2');
console.log('pmhnp_consent_v2 AFTER reopen click:', consentAfterReopen?.value ? consentAfterReopen.value.slice(0, 30) : 'cleared');
console.log('banner visible after reopen:', await banner.isVisible());

await browser.close();
