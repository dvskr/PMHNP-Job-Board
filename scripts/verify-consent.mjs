import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

const externalRequests = [];
page.on('request', (req) => {
  const url = req.url();
  if (url.startsWith('http') && !url.startsWith('http://localhost')) {
    externalRequests.push({ url, type: req.resourceType() });
  }
});

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(() => { try { localStorage.removeItem('pmhnp_cookie_consent'); } catch {} });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Snapshot pre-consent external requests, then clear list before second load
const preConsentSnapshot = [...externalRequests];
externalRequests.length = 0;

// Inspect dataLayer for consent default
const initial = await page.evaluate(() => {
  const dl = (window).dataLayer || [];
  const consentEntries = dl.filter((e) =>
    Array.isArray(e) && e[0] === 'consent'
  );
  return {
    dataLayerLength: dl.length,
    consentEntries,
    storedConsent: localStorage.getItem('pmhnp_cookie_consent'),
  };
});

console.log('--- INITIAL (no user choice yet) ---');
console.log(JSON.stringify(initial, null, 2));

const isTelemetry = (u) =>
  u.includes('vercel-insights') ||
  u.includes('vitals.vercel') ||
  u.includes('google-analytics.com/g/collect') ||
  u.includes('googletagmanager.com') ||
  u.includes('sentry');

const preConsentExternal = preConsentSnapshot.filter(r => isTelemetry(r.url));
console.log('--- PRE-CONSENT external telemetry hits ---');
console.log(JSON.stringify(preConsentExternal, null, 2));

// Click Accept All
await page.click('button:has-text("Accept All")');
await page.waitForTimeout(2000);

const afterAccept = await page.evaluate(() => {
  const dl = (window).dataLayer || [];
  const consentEntries = dl.filter((e) =>
    Array.isArray(e) && e[0] === 'consent'
  );
  return {
    dataLayerLength: dl.length,
    consentEntries,
    storedConsent: localStorage.getItem('pmhnp_cookie_consent'),
  };
});

console.log('--- AFTER ACCEPT ---');
console.log(JSON.stringify(afterAccept, null, 2));

const postConsentExternal = externalRequests.filter(r => isTelemetry(r.url));
console.log('--- POST-ACCEPT telemetry hits (should appear in prod build) ---');
console.log(JSON.stringify(postConsentExternal, null, 2));

// Verify Vercel Speed Insights DOES mount in DOM after accept (script tag check)
const speedInsightsScript = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('script')).some(
    s => s.src.includes('_vercel/insights') || s.src.includes('vercel-insights')
  );
});
console.log('--- Vercel Speed Insights script tag present after accept? ---');
console.log(speedInsightsScript);

await browser.close();
