import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'https://pmhnphiring.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const STATIC = [
  '/', '/jobs', '/companies', '/blog', '/salary-guide', '/about', '/contact',
  '/pricing', '/for-employers', '/for-job-seekers', '/for-programs', '/resources',
  '/post-job', '/faq', '/privacy', '/terms', '/security', '/login', '/signup',
  '/job-alerts', '/sub-processors', '/do-not-sell', '/data-request',
];
const CATS = ['remote','telehealth','inpatient','outpatient','travel','full-time','part-time','contract','addiction','child-adolescent','substance-abuse','new-grad','per-diem','locum-tenens','correctional','1099','behavioral-health','entry-level','mid-career','senior','hospital','private-practice','community-health','va','geriatric','veterans','lgbtq','crisis'];
const STATES = ['california','texas','florida','new-york','washington','arizona','illinois','georgia','colorado','ohio'];
const METROS = ['new-york-ny','los-angeles-ca','chicago-il','dallas-tx','phoenix-az','seattle-wa','atlanta-ga','tampa-fl'];

const seed = new Set();
STATIC.forEach(u => seed.add(u));
CATS.forEach(c => seed.add('/jobs/' + c));
seed.add('/jobs/city'); seed.add('/jobs/locations'); seed.add('/jobs/state');
STATES.forEach(s => seed.add('/jobs/state/' + s));
['california','texas','florida'].forEach(s => { seed.add('/jobs/remote/' + s); seed.add('/jobs/full-time/' + s); seed.add('/jobs/telehealth/' + s); });
METROS.forEach(m => seed.add('/jobs/metro/' + m));
seed.add('/jobs/this-page-does-not-exist-xyz'); // 404/410 probe
seed.add('/jobs/remote/city/not-a-real-city-zzz'); // pSEO 410 probe

const results = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });

async function audit(path) {
  const url = path.startsWith('http') ? path : BASE + path;
  const page = await ctx.newPage();
  const consoleErrors = [], pageErrors = [], failedReq = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  page.on('requestfailed', r => { const u = r.url(); if (!u.includes('analytics') && !u.includes('vitals')) failedReq.push(u.slice(0,160) + ' :: ' + (r.failure()?.errorText||'')); });
  const t0 = Date.now();
  let rec = { path, url };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    rec.status = resp ? resp.status() : null;
    rec.finalUrl = page.url();
    rec.redirected = page.url() !== url;
    rec.ms = Date.now() - t0;
    const data = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const metaDesc = q('meta[name="description"]')?.content || null;
      const canonical = q('link[rel="canonical"]')?.href || null;
      const robotsMeta = q('meta[name="robots"]')?.content || null;
      const ogTitle = q('meta[property="og:title"]')?.content || null;
      const ogImage = q('meta[property="og:image"]')?.content || null;
      const h1s = [...document.querySelectorAll('h1')].map(h => h.textContent.trim());
      let jsonLdTypes = [];
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { const j = JSON.parse(s.textContent); const arr = Array.isArray(j) ? j : (j['@graph'] || [j]); for (const o of arr) if (o && o['@type']) jsonLdTypes.push(o['@type']); } catch { jsonLdTypes.push('PARSE_ERROR'); }
      }
      const internalLinks = [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href'));
      const imgs = [...document.querySelectorAll('img')];
      const imgsNoAlt = imgs.filter(i => !i.getAttribute('alt')).length;
      const bodyText = (document.body?.innerText || '').trim();
      const jobCards = document.querySelectorAll('[data-testid="job-card"], [class*="JobCard"], article a[href*="/jobs/"]').length;
      return { metaDesc, canonical, robotsMeta, ogTitle, ogImage, h1s, jsonLdTypes, internalLinks, imgCount: imgs.length, imgsNoAlt, bodyLen: bodyText.length, jobCards, title: document.title };
    });
    rec = { ...rec, title: data.title, metaDescLen: data.metaDesc ? data.metaDesc.length : 0, metaDesc: data.metaDesc?.slice(0,80), canonical: data.canonical, robotsMeta: data.robotsMeta, ogTitle: !!data.ogTitle, ogImage: !!data.ogImage, h1count: data.h1s.length, h1: data.h1s[0]?.slice(0,80), jsonLdTypes: [...new Set(data.jsonLdTypes)], internalLinkCount: data.internalLinks.length, imgCount: data.imgCount, imgsNoAlt: data.imgsNoAlt, bodyLen: data.bodyLen, jobCards: data.jobCards, consoleErrors, pageErrors, failedReq };
    rec._links = data.internalLinks;
  } catch (e) {
    rec.error = String(e).slice(0, 200);
    rec.consoleErrors = consoleErrors; rec.pageErrors = pageErrors;
  }
  await page.close();
  const links = rec._links; delete rec._links;
  results.push(rec);
  const flag = [];
  if (rec.status && rec.status >= 400) flag.push('HTTP' + rec.status);
  if (rec.error) flag.push('NAVERR');
  if (rec.pageErrors?.length) flag.push('PAGEERR' + rec.pageErrors.length);
  if (rec.consoleErrors?.length) flag.push('CONERR' + rec.consoleErrors.length);
  if (rec.status === 200 && !rec.canonical) flag.push('NOCANON');
  if (rec.status === 200 && !rec.metaDescLen) flag.push('NODESC');
  if (rec.status === 200 && rec.h1count !== 1) flag.push('H1=' + rec.h1count);
  if (rec.status === 200 && rec.bodyLen < 400) flag.push('THIN' + rec.bodyLen);
  console.log(`[${results.length}] ${rec.status||'ERR'} ${rec.ms||'-'}ms ${path}  ${flag.join(' ')}`);
  return links || [];
}

// Phase 1: seed
const seedArr = [...seed];
const discovered = new Set();
for (const p of seedArr) {
  const links = await audit(p);
  // discovery from key index pages
  if (p === '/jobs') links.filter(h => /^\/jobs\/[a-z0-9-]+$/i.test(h) && !CATS.includes(h.split('/')[2]) && !['city','state','metro','locations','edit'].includes(h.split('/')[2])).slice(0,8).forEach(h => discovered.add(h));
  if (p === '/jobs/city') links.filter(h => /^\/jobs\/city\/[a-z-]+$/.test(h)).slice(0,10).forEach(h => discovered.add(h));
  if (p === '/jobs/remote') links.filter(h => /^\/jobs\/remote\/(city\/)?[a-z-]+$/.test(h)).slice(0,6).forEach(h => discovered.add(h));
  if (p === '/companies') links.filter(h => /^\/companies\/[a-z0-9-]+$/i.test(h)).slice(0,5).forEach(h => discovered.add(h));
  if (p === '/blog') links.filter(h => /^\/blog\/[a-z0-9-]+$/i.test(h)).slice(0,5).forEach(h => discovered.add(h));
}
// Phase 2: discovered detail/child pages
for (const p of discovered) { if (!seed.has(p)) await audit(p); }

writeFileSync('tmp/audit/crawl-results.json', JSON.stringify(results, null, 2));

// summary
const non200 = results.filter(r => !(r.status >= 200 && r.status < 400) && !r.error);
const errs = results.filter(r => r.error);
const conerr = results.filter(r => r.consoleErrors?.length);
const pageerr = results.filter(r => r.pageErrors?.length);
const noCanon = results.filter(r => r.status === 200 && !r.canonical);
const noDesc = results.filter(r => r.status === 200 && !r.metaDescLen);
const badH1 = results.filter(r => r.status === 200 && r.h1count !== 1);
const thin = results.filter(r => r.status === 200 && r.bodyLen < 600);
const failedReqs = results.filter(r => r.failedReq?.length);
console.log('\n================ CRAWL SUMMARY ================');
console.log('total pages:', results.length);
console.log('non-2xx/3xx:', non200.map(r => `${r.status} ${r.path}`).join(' | ') || 'none');
console.log('nav errors:', errs.map(r => `${r.path} (${r.error})`).join(' | ') || 'none');
console.log('pages w/ pageerror:', pageerr.map(r => r.path).join(', ') || 'none');
console.log('pages w/ console errors:', conerr.length, conerr.slice(0,8).map(r=>r.path).join(', '));
console.log('missing canonical:', noCanon.map(r => r.path).join(', ') || 'none');
console.log('missing meta desc:', noDesc.map(r => r.path).join(', ') || 'none');
console.log('h1 != 1:', badH1.map(r => `${r.path}(${r.h1count})`).join(', ') || 'none');
console.log('thin (<600 chars):', thin.map(r => `${r.path}(${r.bodyLen})`).join(', ') || 'none');
console.log('pages w/ failed requests:', failedReqs.map(r => r.path).join(', ') || 'none');
await browser.close();
console.log('WROTE tmp/audit/crawl-results.json');
