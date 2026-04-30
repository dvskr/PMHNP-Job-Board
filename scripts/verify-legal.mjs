import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  extraHTTPHeaders: { 'x-vercel-ip-country': 'US' },
});
const page = await ctx.newPage();

const pages = [
  { url: 'http://localhost:3000/sub-processors', mustContain: ['Sub-processors', 'Vercel', 'Stripe', 'Resend', 'Standard Contractual Clauses'] },
  { url: 'http://localhost:3000/data-request', mustContain: ['Data Request', 'Access my data', 'Delete my account', 'jurisdiction', 'Submit Request'] },
  { url: 'http://localhost:3000/do-not-sell', mustContain: ['Do Not Sell', 'Global Privacy Control', 'Opt Out'] },
  { url: 'http://localhost:3000/privacy', mustContain: ['Sub-processors', 'Google Analytics', 'Data Retention', 'Sensitive Information', 'Do Not Sell or Share My Personal Information'] },
];

for (const p of pages) {
  await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const html = await page.content();
  const missing = p.mustContain.filter(needle => !html.includes(needle));
  console.log(`${p.url}: ${missing.length === 0 ? 'OK' : 'MISSING ' + JSON.stringify(missing)}`);
}

// Footer links present?
await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const footerLinks = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('footer a, footer button')).map(el => el.textContent?.trim());
  return links.filter(t => t && /Privacy|Terms|Sub-processors|Data Request|Do Not Sell|Cookie Settings/i.test(t));
});
console.log('Footer legal links:', JSON.stringify(footerLinks));

await browser.close();
