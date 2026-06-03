// Supabase RLS / data-exposure audit (READ-ONLY).
// 1) Introspect prod DB: which public tables have RLS enabled + their policies + anon/authenticated grants.
// 2) Grab the PUBLIC anon key from the live site (as any attacker can) and try to read sensitive
//    tables directly via Supabase PostgREST. A 200 with rows = data exposed to anyone.
import { readFileSync } from 'fs';
import pg from 'pg';
import { chromium } from 'playwright';

const env = readFileSync('.env.prod', 'utf8');
const DB = env.match(/^PROD_DATABASE_URL=(.+)$/m)[1].trim();
const SUPA_URL = env.match(/^PROD_SUPABASE_URL=(.+)$/m)[1].trim();
const BASE = 'https://pmhnphiring.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------- 1) DB introspection ----------
const pool = new pg.Pool({ connectionString: DB, max: 2, ssl: { rejectUnauthorized: false } });
const rls = await pool.query(`
  SELECT c.relname AS table, c.relrowsecurity AS rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relrowsecurity, c.relname`);
const on = rls.rows.filter(r => r.rls_enabled), off = rls.rows.filter(r => !r.rls_enabled);
console.log(`\n=== RLS STATE (public schema) ===`);
console.log(`Tables WITH RLS enabled: ${on.length}/${rls.rows.length}`);
console.log(`  ${on.map(r => r.table).join(', ') || '(none)'}`);
console.log(`Tables WITHOUT RLS (rls OFF): ${off.length}`);
console.log(`  ${off.map(r => r.table).slice(0, 80).join(', ')}`);

const pol = await pool.query(`SELECT tablename, policyname, cmd, roles::text FROM pg_policies WHERE schemaname='public' ORDER BY tablename`);
console.log(`\n=== RLS POLICIES: ${pol.rows.length} total ===`);
for (const p of pol.rows.slice(0, 60)) console.log(`  ${p.tablename}: ${p.policyname} [${p.cmd}] roles=${p.roles}`);

const grants = await pool.query(`
  SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) privs
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('anon','authenticated')
  GROUP BY table_name, grantee ORDER BY grantee, table_name`);
const anonGrants = grants.rows.filter(g => g.grantee === 'anon');
console.log(`\n=== GRANTS to 'anon' role (PostgREST-reachable): ${anonGrants.length} tables ===`);
for (const g of anonGrants.slice(0, 60)) console.log(`  ${g.table_name}: ${g.privs}`);
await pool.end();

// ---------- 2) grab public anon key from live site ----------
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: UA });
const page = await ctx.newPage();
let anonKey = null;
page.on('request', r => { const k = r.headers()['apikey']; if (k && !anonKey && /supabase/.test(r.url())) anonKey = k; });
await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
await page.waitForTimeout(2500);
if (!anonKey) { // fallback: scrape JS bundle for the anon JWT
  const html = await page.content();
  const m = html.match(/eyJhbGciOiJ[\w-]+\.[\w-]+\.[\w-]+/g);
  if (m) for (const t of m) { try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()); if (p.role === 'anon') { anonKey = t; break; } } catch {} }
}
await browser.close();
console.log(`\n=== ANON KEY captured: ${anonKey ? 'yes (role=anon, public)' : 'NO — could not capture'} ===`);

// ---------- 3) attacker simulation: read sensitive tables with the public anon key ----------
if (anonKey) {
  const SENSITIVE = ['user_profiles', 'candidate_education', 'candidate_licenses', 'candidate_certifications', 'candidate_work_experience', 'job_applications', 'employer_jobs', 'email_leads', 'conversations', 'employer_messages', 'candidate_embeddings', 'document_access_logs', 'job_reports', 'data_requests'];
  console.log(`\n=== ANON POSTGREST READ TEST (each = what a logged-out attacker can pull) ===`);
  for (const t of SENSITIVE) {
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/${t}?select=*&limit=2`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
      const body = await res.text();
      let rows = 0; try { rows = JSON.parse(body).length ?? 0; } catch {}
      const verdict = res.status === 200 && rows > 0 ? '🔴 EXPOSED' : (res.status === 200 ? '⚠️ 200-empty' : '✅ blocked');
      console.log(`  ${t.padEnd(28)} -> HTTP ${res.status} rows=${rows} ${verdict}  ${res.status !== 200 ? body.slice(0, 80) : ''}`);
    } catch (e) { console.log(`  ${t.padEnd(28)} -> ERR ${e.message.slice(0, 60)}`); }
  }
}
