// Lab Core Web Vitals via Playwright + CDP (mobile emulation: 4x CPU, ~Slow-4G).
// Real measured LCP / CLS / FCP / TTFB + JS weight per page type. Single-run lab numbers
// (not field/CrUX) but real, throttled, and comparable. See docs/AUDIT_RUNBOOK.md.
import { chromium } from 'playwright';
const BASE = process.env.AUDIT_BASE_URL || 'https://pmhnphiring.com';
const UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const PAGES = [
  ['/', 'home'],
  ['/jobs', 'jobs-listing'],
  ['/jobs/pmhnp-ketamine-infusion-c5b72f4a-dec2-4a60-bf63-7427df40d88f', 'job-detail'],
  ['/jobs/remote', 'pseo-category'],
  ['/jobs/state/california', 'pseo-state'],
];

const OBS = `
  window.__v = { cls: 0, lcp: 0, fcp: 0 };
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__v.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
`;

const browser = await chromium.launch({ headless: true });
const grade = (v, good, poor) => v <= good ? '🟢' : v <= poor ? '🟡' : '🔴';
const rows = [];
for (const [path, name] of PAGES) {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(OBS);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let jsBytes = 0, totalBytes = 0;
  page.on('response', async r => { try { const h = await r.allHeaders(); const len = +(h['content-length'] || 0); totalBytes += len; if (/javascript/.test(h['content-type'] || '')) jsBytes += len; } catch {} });
  try {
    await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000); // let LCP/CLS settle
    const v = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      return { ttfb: nav.responseStart || 0, dcl: nav.domContentLoadedEventEnd || 0, load: nav.loadEventEnd || 0, ...window.__v, nodes: document.querySelectorAll('*').length };
    });
    rows.push({ name, ...v, jsKB: Math.round(jsBytes / 1024), totalKB: Math.round(totalBytes / 1024) });
    console.log(`[${name}]  LCP ${(v.lcp/1000).toFixed(2)}s ${grade(v.lcp,2500,4000)}  FCP ${(v.fcp/1000).toFixed(2)}s ${grade(v.fcp,1800,3000)}  CLS ${v.cls.toFixed(3)} ${grade(v.cls,0.1,0.25)}  TTFB ${(v.ttfb/1000).toFixed(2)}s ${grade(v.ttfb,800,1800)}  JS ${Math.round(jsBytes/1024)}KB  nodes ${v.nodes}`);
  } catch (e) { console.log(`[${name}] ERR ${String(e).slice(0, 80)}`); }
  await ctx.close();
}
console.log('\nThresholds: LCP 🟢<2.5s 🔴>4s | FCP 🟢<1.8s 🔴>3s | CLS 🟢<0.1 🔴>0.25 | TTFB 🟢<0.8s 🔴>1.8s');
console.log('Note: lab numbers — mobile-emulated (4x CPU, ~Slow 4G), single run. Field/CrUX may differ.');
await browser.close();
