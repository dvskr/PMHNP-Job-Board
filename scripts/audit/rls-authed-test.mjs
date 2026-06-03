// Tests the 'authenticated' PostgREST surface: can ANY logged-in user read other people's
// data directly via Supabase's data API? Logs in as the seeker, captures the anon key + the
// user's JWT, then queries sensitive tables. READ-ONLY.
// Creds via env: AUDIT_SEEKER_EMAIL / AUDIT_SEEKER_PASS
import { readFileSync } from 'fs';
import pg from 'pg';
import { chromium } from 'playwright';

const env = readFileSync('.env.prod', 'utf8');
const DB = env.match(/^PROD_DATABASE_URL=(.+)$/m)[1].trim();
const SUPA = env.match(/^PROD_SUPABASE_URL=(.+)$/m)[1].trim();
const BASE = 'https://pmhnphiring.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const EMAIL = process.env.AUDIT_SEEKER_EMAIL, PASS = process.env.AUDIT_SEEKER_PASS;

// authenticated grants
const pool = new pg.Pool({ connectionString: DB, max: 2, ssl: { rejectUnauthorized: false } });
const g = await pool.query(`SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) privs
  FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated'
  GROUP BY table_name ORDER BY table_name`);
console.log(`=== GRANTS to 'authenticated' role: ${g.rows.length} tables ===`);
for (const r of g.rows.slice(0, 90)) console.log(`  ${r.table_name}: ${r.privs}`);
await pool.end();

// capture anon key + user JWT by actually logging in
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: UA });
const page = await ctx.newPage();
let anonKey = null, userJwt = null;
page.on('request', r => { const k = r.headers()['apikey']; if (k && !anonKey && /supabase\.co/.test(r.url())) anonKey = k; });
page.on('response', async r => {
  if (/auth\/v1\/token/.test(r.url())) { try { const j = await r.json(); if (j.access_token) userJwt = j.access_token; } catch {} }
});
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200);
await page.fill('input[type="email"], input[name="email"]', EMAIL);
await page.fill('input[type="password"], input[name="password"]', PASS);
await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').catch(() => {});
await page.waitForTimeout(4000);
await browser.close();
console.log(`\nanonKey=${anonKey ? 'captured' : 'MISSING'} userJwt=${userJwt ? 'captured' : 'MISSING'}`);

if (anonKey && userJwt) {
  const TABLES = ['candidate_embeddings', 'candidate_recommendations', 'program_director_leads', 'email_sends', 'document_access_log', 'data_requests', 'ai_call_log', 'audit_logs', 'job_charges', 'processed_stripe_events', 'candidate_tags', 'employer_testimonials', 'jd_templates', 'employer_leads',
    // RLS-on tables (expect deny/empty for a direct query):
    'user_profiles', 'candidate_licenses', 'job_applications', 'employer_messages'];
  console.log(`\n=== AUTHENTICATED PostgREST READ (logged-in user, direct API) ===`);
  for (const t of TABLES) {
    try {
      const res = await fetch(`${SUPA}/rest/v1/${t}?select=*&limit=3`, { headers: { apikey: anonKey, Authorization: `Bearer ${userJwt}` } });
      const body = await res.text(); let rows = 0; try { rows = JSON.parse(body).length ?? 0; } catch {}
      const v = res.status === 200 && rows > 0 ? '🔴 READABLE BY ANY USER' : (res.status === 200 ? '⚠️ 200-empty' : '✅ blocked');
      console.log(`  ${t.padEnd(26)} HTTP ${res.status} rows=${rows} ${v} ${res.status !== 200 ? body.slice(0, 70) : ''}`);
    } catch (e) { console.log(`  ${t.padEnd(26)} ERR ${e.message.slice(0, 50)}`); }
  }
}
