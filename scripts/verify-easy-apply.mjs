import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Skip the consent banner in implied region for cleaner screenshots
  extraHTTPHeaders: { 'x-vercel-ip-country': 'US' },
});
const page = await ctx.newPage();

// Capture the actual JSON the page received from /api/jobs
let capturedJobsResp = null;
page.on('response', async (resp) => {
  if (resp.url().includes('/api/jobs?')) {
    try { capturedJobsResp = await resp.json(); } catch {}
  }
});

// 1. Use the search flag so we get an applyOnPlatform job into the first page
await page.goto('http://localhost:3000/jobs?q=Claritiv', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);

const sample = capturedJobsResp?.jobs?.find(j => /Claritiv/i.test(j.employer));
console.log('Captured Claritiv job from network response:');
console.log(sample ? JSON.stringify({ employer: sample.employer, applyOnPlatform: sample.applyOnPlatform, fields: Object.keys(sample) }, null, 2) : 'NOT FOUND');

const easyApplyButtons = await page.locator('button:has-text("Easy Apply")').count();
console.log('Easy Apply buttons on /jobs?q=Claritiv:', easyApplyButtons);

const allCards = await page.locator('a[href^="/jobs/"]').count();
console.log('Job card links on page:', allCards);

const cardSample = await page.evaluate(() => {
  // Filter to actual job-detail cards (have a UUID-style slug)
  const cards = Array.from(document.querySelectorAll('a[href^="/jobs/"]')).filter(c => {
    const h = c.getAttribute('href') || '';
    return /[a-f0-9]{8}-[a-f0-9]{4}/.test(h);
  });
  return cards.slice(0, 2).map((c) => ({
    href: c.getAttribute('href'),
    fullText: c.textContent,
    hasEasyApplyClass: !!c.querySelector('.jc-easy-apply-btn'),
    hasApplyClass: !!c.querySelector('.jc-apply-btn'),
    hasDirectClass: !!c.querySelector('.jc-direct-apply-btn'),
    buttonsInside: Array.from(c.querySelectorAll('button')).map(b => ({
      cls: b.className,
      text: b.textContent?.slice(0, 30),
    })),
  }));
});
console.log('Job-detail cards:', JSON.stringify(cardSample, null, 2));

// Inspect the network response for Claritiv directly
const apiResp = await page.evaluate(async () => {
  const r = await fetch('/api/jobs?q=Claritiv&limit=3');
  const d = await r.json();
  const j = (d.jobs || [])[0] || null;
  return j ? { employer: j.employer, applyOnPlatform: j.applyOnPlatform, hasField: 'applyOnPlatform' in j } : null;
});
console.log('Direct API check:', JSON.stringify(apiResp, null, 2));

if (easyApplyButtons > 0) {
  // Screenshot the first card with Easy Apply visible
  const firstBtn = page.locator('button:has-text("Easy Apply")').first();
  const card = firstBtn.locator('xpath=ancestor::a[1]');
  await card.screenshot({ path: 'scripts/easy-apply-card.png' });
  console.log('Card screenshot saved: scripts/easy-apply-card.png');

  // Get the card href to drive direct nav with ?apply=1
  const href = await card.getAttribute('href');
  console.log('Card href:', href);

  // Click Easy Apply → should land on detail with ?apply=1
  await firstBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('URL after Easy Apply click:', page.url());

  // Auth gate is expected if not logged in — that's fine. Screenshot top viewport.
  await page.screenshot({
    path: 'scripts/easy-apply-popup.png',
    clip: { x: 0, y: 0, width: 1440, height: 600 },
  });
  console.log('Popup-area screenshot saved: scripts/easy-apply-popup.png');

  // Inspect z-indexes
  const zIndexes = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('header, [class*="z-["]'));
    return els.slice(0, 8).map((el) => ({
      tag: el.tagName,
      cls: el.className?.toString().slice(0, 80),
      computedZ: window.getComputedStyle(el).zIndex,
      pos: window.getComputedStyle(el).position,
    }));
  });
  console.log('z-index inspection:');
  console.log(JSON.stringify(zIndexes, null, 2));
}

await browser.close();
