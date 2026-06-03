// Authenticated-flow + authorization (IDOR) probe for the audit runbook.
// READ-ONLY navigation: never submits applications/jobs/messages/payments.
// See docs/AUDIT_RUNBOOK.md.
//
// Creds via env (do NOT hardcode):
//   AUDIT_SEEKER_EMAIL / AUDIT_SEEKER_PASS
//   AUDIT_EMPLOYER_EMAIL / AUDIT_EMPLOYER_PASS
//   AUDIT_BASE_URL (default https://pmhnphiring.com)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = process.env.AUDIT_BASE_URL || 'https://pmhnphiring.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SEEKER = { email: process.env.AUDIT_SEEKER_EMAIL, password: process.env.AUDIT_SEEKER_PASS };
const EMPLOYER = { email: process.env.AUDIT_EMPLOYER_EMAIL, password: process.env.AUDIT_EMPLOYER_PASS };

const results = [];
const browser = await chromium.launch({ headless: true });
const newCtx = () => browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });

async function probe(page, path, label, shot) {
  const ce = [], pe = [];
  const oc = m => m.type() === 'error' && ce.push(m.text().slice(0, 160));
  const op = e => pe.push(String(e).slice(0, 160));
  page.on('console', oc); page.on('pageerror', op);
  let rec = { label, path };
  try {
    const r = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(1800);
    rec.status = r?.status(); rec.finalUrl = page.url().replace(BASE, '');
    rec.authRedirect = /\/login|\/unauthorized|\/employer\/login/.test(rec.finalUrl);
    const d = await page.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 80) || null, snippet: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) }));
    rec = { ...rec, ...d, consoleErrors: [...new Set(ce)].filter(e => !/google\.com\/g\/collect/.test(e)), pageErrors: pe };
    if (shot) await page.screenshot({ path: `tmp/audit/shot-${shot}.png` }).catch(() => {});
  } catch (e) { rec.error = String(e).slice(0, 140); }
  page.off('console', oc); page.off('pageerror', op);
  results.push(rec);
  console.log(`[${label}] ${rec.status || 'ERR'} ${rec.finalUrl || path}${rec.authRedirect ? ' <AUTH-REDIRECT>' : ''}${rec.pageErrors?.length ? ' PAGEERR' : ''}${rec.consoleErrors?.length ? ' CONERR' + rec.consoleErrors.length : ''}`);
  return rec;
}
async function login(ctx, who, creds) {
  if (!creds.email || !creds.password) { console.log(`(skip ${who} — no creds in env)`); return false; }
  const p = await ctx.newPage();
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000);
  await p.fill('input[type="email"], input[name="email"]', creds.email);
  await p.fill('input[type="password"], input[name="password"]', creds.password);
  await Promise.all([p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}), p.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').catch(() => {})]);
  await p.waitForTimeout(3500);
  const after = p.url().replace(BASE, ''); const ok = !/\/login/.test(after);
  console.log(`=== LOGIN ${who}: ${ok ? 'OK -> ' + after : 'FAILED (' + after + ')'} ===`);
  await p.close(); return ok;
}

// JOB SEEKER
const sCtx = await newCtx();
if (await login(sCtx, 'job_seeker', SEEKER)) {
  const p = await sCtx.newPage();
  for (const [path, label, shot] of [['/dashboard', 'seeker:dashboard', 'seeker-dashboard'], ['/my-applications', 'seeker:apps'], ['/saved', 'seeker:saved'], ['/settings', 'seeker:settings'], ['/messages', 'seeker:messages'], ['/job-alerts', 'seeker:alerts']]) await probe(p, path, label, shot);
  // AUTHZ: seeker must NOT reach employer/admin (expect /unauthorized)
  for (const [path, label] of [['/employer/dashboard', 'authz:seeker->employer'], ['/employer/applicants', 'authz:seeker->applicants'], ['/admin', 'authz:seeker->admin']]) await probe(p, path, label);
  await p.close();
}
await sCtx.close();

// EMPLOYER
const eCtx = await newCtx();
if (await login(eCtx, 'employer', EMPLOYER)) {
  const p = await eCtx.newPage();
  for (const [path, label, shot] of [['/employer/dashboard', 'emp:dashboard', 'employer-dashboard'], ['/employer/applicants', 'emp:applicants'], ['/employer/candidates', 'emp:talent', 'employer-talent'], ['/employer/settings', 'emp:settings'], ['/post-job', 'emp:post-job', 'post-job']]) await probe(p, path, label, shot);
  await probe(p, '/admin', 'authz:emp->admin'); // expect /unauthorized
  await p.close();
}
await eCtx.close();

mkdirSync('tmp/audit', { recursive: true });
writeFileSync('tmp/audit/auth-results.json', JSON.stringify(results, null, 2));
console.log('\nAUTHZ CHECK: every authz:* row above should show <AUTH-REDIRECT> to /unauthorized.');
console.log('WROTE tmp/audit/auth-results.json');
await browser.close();
