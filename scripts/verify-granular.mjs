import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Strict region so the banner appears
  extraHTTPHeaders: { 'x-vercel-ip-country': 'DE' },
});
const page = await ctx.newPage();

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(() => { try { localStorage.removeItem('pmhnp_cookie_consent'); } catch {} });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const banner = page.getByRole('dialog', { name: 'Cookie consent' });

const expand = async () => {
  await banner.getByRole('button', { name: /Customize/ }).click();
  await page.waitForTimeout(200);
};

const readStored = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem('pmhnp_cookie_consent');
    try { return raw ? JSON.parse(raw) : null; } catch { return raw; }
  });

const switchState = (label) =>
  banner.getByRole('switch', { name: undefined })
    .nth({ Essential: 0, Analytics: 1, Marketing: 2 }[label])
    .getAttribute('aria-checked');

// Phase 1: banner visible, Customize panel hidden by default
console.log('--- Phase 1: initial banner ---');
console.log('banner visible:', await banner.isVisible());
const accordionBefore = await page.locator('#cookie-consent-categories').count();
console.log('categories panel mounted before expand:', accordionBefore);

// Phase 2: click Customize, all switches present, defaults all-denied
await expand();
console.log('--- Phase 2: expanded panel ---');
const switches = await banner.getByRole('switch').all();
console.log('switch count:', switches.length);
for (let i = 0; i < switches.length; i++) {
  console.log(`switch[${i}] aria-checked:`, await switches[i].getAttribute('aria-checked'));
  console.log(`switch[${i}] aria-disabled:`, await switches[i].getAttribute('aria-disabled'));
}

// Phase 3: enable only Analytics, save preferences
console.log('--- Phase 3: analytics-only via toggle ---');
await switches[1].click(); // Analytics
await page.waitForTimeout(150);
console.log('Analytics aria-checked after click:', await switches[1].getAttribute('aria-checked'));
console.log('Marketing aria-checked (should be unchecked):', await switches[2].getAttribute('aria-checked'));
await banner.getByRole('button', { name: 'Save Preferences' }).click();
await page.waitForTimeout(500);
const stored = await readStored();
console.log('storage after save:', JSON.stringify(stored));
console.log('banner visible after save:', await banner.isVisible());

// Phase 4: reopen via footer, toggles pre-populated
console.log('--- Phase 4: reopen pre-populates current state ---');
await page.getByRole('button', { name: 'Cookie Settings' }).click();
await page.waitForTimeout(500);
console.log('banner visible after reopen:', await banner.isVisible());
await expand();
const switchesReopen = await banner.getByRole('switch').all();
console.log('Essential:', await switchesReopen[0].getAttribute('aria-checked'));
console.log('Analytics:', await switchesReopen[1].getAttribute('aria-checked'));
console.log('Marketing:', await switchesReopen[2].getAttribute('aria-checked'));

// Phase 5: Accept All from collapsed mode
console.log('--- Phase 5: Accept All ---');
await banner.getByRole('button', { name: 'Accept All' }).click();
await page.waitForTimeout(500);
console.log('storage after Accept All:', JSON.stringify(await readStored()));

// Phase 6: Reopen, Decline All
console.log('--- Phase 6: Decline All ---');
await page.getByRole('button', { name: 'Cookie Settings' }).click();
await page.waitForTimeout(500);
await banner.getByRole('button', { name: 'Decline', exact: true }).click();
await page.waitForTimeout(500);
console.log('storage after Decline:', JSON.stringify(await readStored()));

await browser.close();
