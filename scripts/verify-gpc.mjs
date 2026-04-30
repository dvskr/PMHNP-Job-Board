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
      privacy_signal_cookie: cookies['pmhnp_privacy_signal'] || null,
      consent_localStorage: localStorage.getItem('pmhnp_cookie_consent'),
      banner_in_dom: !!banner,
    };
  });
  console.log(`--- ${label} ---`);
  console.log(JSON.stringify(result, null, 2));
  await ctx.close();
}

await run('NO PRIVACY SIGNAL', {});
await run('Sec-GPC: 1', { 'Sec-GPC': '1' });
await run('DNT: 1', { 'DNT': '1' });

await browser.close();
