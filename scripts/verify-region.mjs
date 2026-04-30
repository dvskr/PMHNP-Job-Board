import { chromium } from 'playwright';

const browser = await chromium.launch();

async function run(label, headers) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: headers,
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => { try { localStorage.removeItem('pmhnp_cookie_consent'); } catch {} });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const result = await page.evaluate(() => {
    const cookies = document.cookie.split('; ').reduce((acc, c) => {
      const [k, v] = c.split('=');
      if (k) acc[k] = v;
      return acc;
    }, {});
    const banner = Array.from(document.querySelectorAll('div'))
      .find(d => d.textContent?.includes('We use cookies for analytics') && d.querySelector('button'));
    return {
      consent_region_cookie: cookies['pmhnp_consent_region'] || null,
      privacy_signal_cookie: cookies['pmhnp_privacy_signal'] || null,
      consent_localStorage: localStorage.getItem('pmhnp_cookie_consent'),
      banner_in_dom: !!banner,
    };
  });
  console.log(`--- ${label} ---`);
  console.log(JSON.stringify(result, null, 2));
  await ctx.close();
}

// Defaults to strict in dev (no x-vercel-ip-country header)
await run('No country header (dev fallback → strict)', {});

// EU country → strict
await run('x-vercel-ip-country: DE (Germany → strict)', { 'x-vercel-ip-country': 'DE' });

// UK → strict
await run('x-vercel-ip-country: GB (UK → strict)', { 'x-vercel-ip-country': 'GB' });

// Canada → strict
await run('x-vercel-ip-country: CA (Canada → strict)', { 'x-vercel-ip-country': 'CA' });

// US → implied (auto-grant)
await run('x-vercel-ip-country: US (United States → implied)', { 'x-vercel-ip-country': 'US' });

// JP → implied
await run('x-vercel-ip-country: JP (Japan → implied)', { 'x-vercel-ip-country': 'JP' });

// US + GPC → still denied (signal trumps region)
await run('US + Sec-GPC (signal trumps implied)', {
  'x-vercel-ip-country': 'US',
  'Sec-GPC': '1',
});

await browser.close();
