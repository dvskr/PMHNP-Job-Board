// Read-only post-deploy smoke check against prod. Real Chromium (passes Vercel
// challenge mode). Verifies the non-destructive fixes only — no payments, no
// account deletion, no email sends.
import { chromium } from 'playwright';

const BASE = 'https://pmhnphiring.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const out = {};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });

// 1) Deploy-live + P1: sub-processors must now list OpenAI / Upstash / Inngest.
try {
  const page = await ctx.newPage();
  const resp = await page.goto(BASE + '/sub-processors', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  const body = (await page.content()).toLowerCase();
  out.subProcessors = {
    httpStatus: resp?.status(),
    hasOpenAI: body.includes('openai'),
    hasUpstash: body.includes('upstash'),
    hasInngest: body.includes('inngest'),
  };
  await page.close();
} catch (e) { out.subProcessors = { error: String(e).slice(0, 200) }; }

// 2) S1 soft-404: a garbage job slug must return real HTTP 404.
try {
  const page = await ctx.newPage();
  const resp = await page.goto(BASE + '/jobs/this-is-a-garbage-slug-that-cannot-exist-xyz', { waitUntil: 'domcontentloaded', timeout: 45000 });
  out.soft404 = { httpStatus: resp?.status(), pass: resp?.status() === 404 };
  await page.close();
} catch (e) { out.soft404 = { error: String(e).slice(0, 200) }; }

// 3) S5 hydration #418: /jobs must load with no hydration console error.
try {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  const resp = await page.goto(BASE + '/jobs', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const hydrationErr = errs.find((t) => /#418|hydrat|did not match|server.*client/i.test(t));
  // 4) C1 + AI search: hit the semantic endpoint from inside the page (passes challenge).
  let semantic = null;
  try {
    semantic = await page.evaluate(async () => {
      const r = await fetch('/api/jobs/search/semantic?q=' + encodeURIComponent('telehealth child psychiatry remote') + '&k=5');
      let jobs = null, degraded = null;
      if (r.ok) { const j = await r.json(); jobs = Array.isArray(j.jobs) ? j.jobs.length : null; degraded = j.degraded ?? null; }
      return { status: r.status, jobs, degraded };
    });
  } catch (e) { semantic = { evalError: String(e).slice(0, 160) }; }
  out.jobsPage = { httpStatus: resp?.status(), hydrationError: hydrationErr || null, totalConsoleErrors: errs.length };
  out.aiSearch = semantic;
  await page.close();
} catch (e) { out.jobsPage = { error: String(e).slice(0, 200) }; }

await browser.close();
console.log(JSON.stringify(out, null, 2));
