import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  extraHTTPHeaders: { 'x-vercel-ip-country': 'US' },
});
const page = await ctx.newPage();

await page.goto('http://localhost:3000/jobs', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);

// Check classification of cards on the listing page
const buttonStats = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('a[href^="/jobs/"]')).filter(c => {
    const h = c.getAttribute('href') || '';
    return /[a-f0-9]{8}-[a-f0-9]{4}/.test(h);
  });
  const counts = { easy: 0, direct: 0, plain: 0, none: 0 };
  for (const c of cards) {
    if (c.querySelector('.jc-easy-apply-btn')) counts.easy++;
    else if (c.querySelector('.jc-direct-apply-btn')) counts.direct++;
    else if (c.querySelector('.jc-apply-btn')) counts.plain++;
    else counts.none++;
  }
  return { total: cards.length, ...counts };
});
console.log('Card button breakdown on /jobs:', JSON.stringify(buttonStats, null, 2));

// Sample 3 cards with each button type to confirm visual treatment
const samples = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('a[href^="/jobs/"]')).filter(c => {
    const h = c.getAttribute('href') || '';
    return /[a-f0-9]{8}-[a-f0-9]{4}/.test(h);
  });
  const sample = (selector) => {
    const card = cards.find(c => c.querySelector(selector));
    if (!card) return null;
    const employer = card.querySelector('p, span')?.parentElement?.textContent?.slice(0, 60) || '';
    return { href: card.getAttribute('href'), employer: employer.slice(0, 60) };
  };
  return {
    easy: sample('.jc-easy-apply-btn'),
    direct: sample('.jc-direct-apply-btn'),
    plain: sample('.jc-apply-btn'),
  };
});
console.log('Sample cards:', JSON.stringify(samples, null, 2));

// Screenshot a Direct Apply card
const directCard = page.locator('a:has(.jc-direct-apply-btn)').first();
if (await directCard.count()) {
  await directCard.screenshot({ path: 'scripts/direct-apply-card.png' });
  console.log('Direct Apply card screenshot: scripts/direct-apply-card.png');
}

await browser.close();
