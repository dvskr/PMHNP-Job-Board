/**
 * Build the Phase 1 (google-mx) outreach batch: join the verified-contact
 * ledger to prod (live postings, company slug, top city), route each contact
 * to sequence A/B/C, assign one persona per company, and emit
 * tmp/marketing/phase1-batch.json + a review CSV. Read-only against prod.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { normalizeCompanyName } from '../../lib/company-normalizer';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CSV = path.join(process.cwd(), 'tmp', 'marketing', 'all-verified-contacts.csv');

// Sender identities and account-routing keyword patterns live in a
// gitignored config: the repo is public and outreach infrastructure
// (persona inboxes, segment targeting) must never be committed.
const CONFIG_PATH = path.join(process.cwd(), 'tmp', 'marketing', 'outreach-config.json');
interface OutreachConfig {
  personas: Array<{ email: string; name: string }>;
  providerNetworkPattern: string;
  bigSystemPattern: string;
}
const outreachConfig: OutreachConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PERSONAS = outreachConfig.personas;

const RECRUITING_TITLE = /recruit|talent|acquisition|sourc|\bta\b|human resources|\bhr\b|people (ops|operations|partner)/i;
const PROVIDER_NETWORKS = new RegExp(outreachConfig.providerNetworkPattern, 'i');
const BIG_SYSTEM = new RegExp(outreachConfig.bigSystemPattern, 'i');

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}
function split(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'))
    .filter((r) => r.email_status === 'verified' && r.mx_provider === 'google');
  console.log(`Google-mx verified contacts: ${rows.length}`);

  // One prod lookup per distinct company.
  const companies = [...new Set(rows.map((r) => r.company))];
  const companyInfo = new Map<string, {
    slug: string | null; liveJobs: number; topCity: string | null; matched: 'company' | 'employer' | 'none';
  }>();

  for (const name of companies) {
    const norm = normalizeCompanyName(name);
    const kebab = norm.replace(/\s+/g, '-');
    let company = await prisma.company.findFirst({
      where: { OR: [{ normalizedName: norm }, { normalizedName: kebab }, { name }, { aliases: { has: name } }] },
      select: { id: true, normalizedName: true, name: true },
    });
    let jobs: Array<{ city: string | null }> = [];
    let matched: 'company' | 'employer' | 'none' = 'none';
    if (company) {
      jobs = await prisma.job.findMany({
        where: { companyId: company.id, isPublished: true },
        select: { city: true },
      });
      matched = 'company';
    }
    if (jobs.length === 0) {
      const byEmployer = await prisma.job.findMany({
        where: { employer: { equals: name, mode: 'insensitive' }, isPublished: true },
        select: { city: true },
      });
      if (byEmployer.length > 0) { jobs = byEmployer; matched = company ? 'company' : 'employer'; }
    }
    const cityCounts = new Map<string, number>();
    for (const j of jobs) if (j.city) cityCounts.set(j.city, (cityCounts.get(j.city) ?? 0) + 1);
    const topCity = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    companyInfo.set(name, {
      slug: company ? company.normalizedName.replace(/\s+/g, '-') : null,
      liveJobs: jobs.length,
      topCity,
      matched,
    });
  }

  // Persona assignment: one persona per company, balanced by contact count.
  const contactsPerCompany = new Map<string, number>();
  for (const r of rows) contactsPerCompany.set(r.company, (contactsPerCompany.get(r.company) ?? 0) + 1);
  const load = PERSONAS.map(() => 0);
  const personaByCompany = new Map<string, typeof PERSONAS[number]>();
  for (const [name, count] of [...contactsPerCompany.entries()].sort((a, b) => b[1] - a[1])) {
    const idx = load.indexOf(Math.min(...load));
    personaByCompany.set(name, PERSONAS[idx]);
    load[idx] += count;
  }

  const batch: Array<Record<string, unknown>> = [];
  const parked: Array<Record<string, string>> = [];
  for (const r of rows) {
    const info = companyInfo.get(r.company)!;
    if (PROVIDER_NETWORKS.test(r.company)) {
      parked.push({ email: r.email, company: r.company, reason: 'provider-network, hand-adjust copy' });
      continue;
    }
    const live = info.liveJobs > 0;
    // A/B need the company page + city merge data; a live company that
    // failed slug matching cannot honestly claim "your page exists": route C.
    const canPersonalize = !!info.slug && !!info.topCity;
    const sequence = live && canPersonalize
      ? (RECRUITING_TITLE.test(r.title) ? 'A' : 'B')
      : 'C';
    batch.push({
      email: r.email,
      name: r.name,
      first_name: r.name.split(/\s+/)[0],
      last_name: r.name.split(/\s+/).slice(1).join(' '),
      title: r.title,
      company: r.company,
      domain: r.domain,
      city: r.city, state: r.state,
      sequence,
      persona: personaByCompany.get(r.company)!.email,
      top_city: info.topCity,
      company_slug: info.slug,
      live_jobs: info.liveJobs,
      big_system: BIG_SYSTEM.test(r.company),
      db_match: info.matched,
    });
  }

  const out = path.join(process.cwd(), 'tmp', 'marketing', 'phase1-batch.json');
  fs.writeFileSync(out, JSON.stringify(batch, null, 2));
  const csvOut = path.join(process.cwd(), 'tmp', 'marketing', 'phase1-batch-review.csv');
  const cols = ['email', 'name', 'title', 'company', 'sequence', 'persona', 'top_city', 'company_slug', 'live_jobs', 'big_system', 'db_match'];
  fs.writeFileSync(csvOut, [cols.join(',')].concat(
    batch.map((b) => cols.map((c) => `"${String(b[c] ?? '').replace(/"/g, '""')}"`).join(',')),
  ).join('\n'));

  const seqCounts: Record<string, number> = {};
  for (const b of batch) seqCounts[b.sequence as string] = (seqCounts[b.sequence as string] ?? 0) + 1;
  const perPersona: Record<string, number> = {};
  for (const b of batch) perPersona[b.persona as string] = (perPersona[b.persona as string] ?? 0) + 1;
  console.log('Routing:', JSON.stringify(seqCounts));
  console.log('Personas:', JSON.stringify(perPersona));
  console.log('Live companies:', [...companyInfo.values()].filter((i) => i.liveJobs > 0).length, 'of', companies.length);
  console.log('Unmatched-in-DB companies:', [...companyInfo.values()].filter((i) => i.matched === 'none').length);
  console.log('Big-system contacts (batch late):', batch.filter((b) => b.big_system).length);
  console.log('Parked provider-network contacts:', parked.length, JSON.stringify(parked.slice(0, 5)));
  console.log(`Wrote ${batch.length} rows to ${out}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
