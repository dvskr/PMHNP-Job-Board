import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  extraHTTPHeaders: { 'x-vercel-ip-country': 'US' },
});
const page = await ctx.newPage();

await page.goto('http://localhost:3000/security', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const html = await page.content();
const checks = [
  'Security & ',  // hero
  'Encryption everywhere',
  'Resume & file safety',
  'Privacy by default',
  'Authentication & access',
  'Incident response',
  'GDPR / UK GDPR',
  'CCPA / CPRA',
  'PCI-DSS',
  'security@pmhnphiring.com',
  'privacy@pmhnphiring.com',
];
const missing = checks.filter(c => !html.includes(c));
console.log('/security missing strings:', missing.length === 0 ? 'NONE' : JSON.stringify(missing));

// Footer link present
await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const footerLinks = await page.evaluate(() =>
  Array.from(document.querySelectorAll('footer a')).map(a => a.textContent?.trim())
);
console.log('Security in footer:', footerLinks.includes('Security'));

await browser.close();
