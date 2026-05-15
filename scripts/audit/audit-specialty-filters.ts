/**
 * Audit specialty category filters for false positives.
 *
 * For each of: child-adolescent, community-health, correctional
 *  1. Count matches using buildCategoryWhereClause(slug) + 30d freshness gate
 *     (same gates as the live /jobs/<slug> page).
 *  2. Sample 15 matched titles.
 *  3. Heuristically classify TRUE_POSITIVE vs FALSE_POSITIVE.
 *
 * Run: npx tsx scripts/audit/audit-specialty-filters.ts
 */
// IMPORTANT: dotenv must load before lib/prisma is imported. tsx hoists
// ESM imports above any code, so we use require() for prisma below.
// We deliberately target the LOCAL/DEV DATABASE_URL (.env / .env.local),
// not PROD_DATABASE_URL — running a read-only audit against the dev
// snapshot is sufficient for filter-quality analysis.
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenvConfig({ path: '.env' });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../../lib/prisma') as typeof import('../../lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildCategoryWhereClause, freshnessClause } = require('../../lib/filters') as typeof import('../../lib/filters');

type Classification = 'TRUE_POSITIVE' | 'FALSE_POSITIVE';

interface SampleResult {
  title: string;
  employer: string | null;
  verdict: Classification;
  reason: string;
}

// ───────────────────────────────────────────────────────────────
// Heuristic classifiers per filter
// ───────────────────────────────────────────────────────────────

function classifyChildAdolescent(title: string): { verdict: Classification; reason: string } {
  const t = title.toLowerCase();

  // FP: administrative pediatric leadership (no clinical PMHNP signal)
  const adminLeadership = /\b(director|chief|vp|vice president|head of|coordinator(?!.*nurse)|administrator)\b/i;
  const pmhnpSignal = /\b(pmhnp|nurse practitioner|np|psych np|aprn|arnp|cnp|psychiatric nurse)\b/i;
  if (adminLeadership.test(title) && !pmhnpSignal.test(title)) {
    return { verdict: 'FALSE_POSITIVE', reason: 'administrative pediatric leadership, no NP signal' };
  }

  // FP: "pediatric mental health" matched but role is non-clinical / non-NP
  if (/pediatric mental/i.test(t) && /\b(specialist|technician|advocate|case manager|social worker|therapist|psychologist)\b/i.test(t) && !pmhnpSignal.test(title)) {
    return { verdict: 'FALSE_POSITIVE', reason: '"pediatric mental" sweeps non-NP role' };
  }

  // FP: pediatric primary-care / pediatric (general) NP — not psych
  if (/\bpediatric\b/i.test(t) && /\b(primary care|hospitalist|urgent care|family)\b/i.test(t) && !/(psych|mental|behavioral|adolescent)/i.test(t)) {
    return { verdict: 'FALSE_POSITIVE', reason: 'pediatric primary-care, not psych' };
  }

  return { verdict: 'TRUE_POSITIVE', reason: 'matches child/adolescent psych keywords' };
}

function classifyCommunityHealth(title: string): { verdict: Classification; reason: string } {
  const t = title.toLowerCase();

  // FP: "Community Hospital" / "Community Medical Center" — generic facility name, not FQHC/public health
  if (/\bcommunity\s+(hospital|medical center|health system|healthcare system|memorial)\b/i.test(t)) {
    return { verdict: 'FALSE_POSITIVE', reason: '"Community Hospital/Medical Center" — facility name, not FQHC' };
  }

  // FP: "Mental Health Community" / "Community Mental Health Center" sometimes legit but often a generic CMHC
  // CMHC is genuinely public-sector outpatient, but spec says these are NOT FQHC/public-health roles.
  if (/\bcommunity\s+mental\s+health\s+center\b/i.test(t) || /\bmental\s+health\s+community\b/i.test(t)) {
    return { verdict: 'FALSE_POSITIVE', reason: '"Community Mental Health Center" — generic CMHC, not FQHC/public-health' };
  }

  // FP: "Community Outreach" / "Community Liaison" / "Community Relations" — non-clinical
  if (/\bcommunity\s+(outreach|liaison|relations|engagement|partner|educator)\b/i.test(t)) {
    return { verdict: 'FALSE_POSITIVE', reason: 'non-clinical community-* role' };
  }

  // FP: "Community-based" services that aren't FQHC/public-health
  if (/\bcommunity[- ]based\b/i.test(t) && !/(fqhc|public health|federally qualified|health center)/i.test(t)) {
    // Often legitimate community NP work; lean TP unless clearly admin
    if (/\b(director|coordinator|manager|administrator)\b/i.test(t)) {
      return { verdict: 'FALSE_POSITIVE', reason: 'community-based admin role' };
    }
  }

  return { verdict: 'TRUE_POSITIVE', reason: 'plausible FQHC / public-health / community-clinic role' };
}

function classifyCorrectional(title: string): { verdict: Classification; reason: string } {
  const t = title.toLowerCase();

  // FP: academic / research forensic-psych (not clinical correctional)
  if (/\bforensic\b/i.test(t)) {
    if (/\b(professor|faculty|fellowship|fellow|researcher|research|assistant professor|associate professor|lecturer|instructor|trainee|postdoc)\b/i.test(t)) {
      return { verdict: 'FALSE_POSITIVE', reason: 'academic/research forensic-psych, not clinical correctional' };
    }
    // FP: forensic psychiatrist (MD), expert witness, evaluator-only
    if (/\b(expert witness|evaluator|evaluation services)\b/i.test(t) && !/(pmhnp|nurse practitioner|aprn|np\b)/i.test(t)) {
      return { verdict: 'FALSE_POSITIVE', reason: 'forensic evaluator/expert-witness, not correctional clinical' };
    }
    // FP: forensic psychology / forensic mental health that's academic
    if (/\bforensic psychology\b/i.test(t)) {
      return { verdict: 'FALSE_POSITIVE', reason: 'forensic psychology, not correctional NP' };
    }
  }

  // FP: "detention" used as legal/admin detention (rare in our corpus, but check)
  if (/\bdetention\b/i.test(t) && /\b(officer|attorney|lawyer|paralegal)\b/i.test(t)) {
    return { verdict: 'FALSE_POSITIVE', reason: 'detention legal/admin role' };
  }

  return { verdict: 'TRUE_POSITIVE', reason: 'matches correctional / jail / prison / forensic-clinical' };
}

const CLASSIFIERS: Record<string, (title: string) => { verdict: Classification; reason: string }> = {
  'child-adolescent': classifyChildAdolescent,
  'community-health': classifyCommunityHealth,
  'correctional': classifyCorrectional,
};

// ───────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────

async function auditFilter(slug: string) {
  const now = new Date();
  const freshness = freshnessClause(now, '30d');

  const where = {
    AND: [buildCategoryWhereClause(slug), freshness],
  };

  const count = await prisma.job.count({ where });

  // Sample 15 DISTINCT-by-title matched rows so duplicates from a single
  // employer (e.g. LifeStance posting one role across 14 cities) don't
  // mask false positives lurking in the long tail.
  const distinctTitles = await prisma.job.findMany({
    where,
    select: { title: true },
    distinct: ['title'],
    orderBy: { title: 'asc' },
    take: 60,
  });

  // Then pull one row per distinct title (preserving employer for context)
  const seen = new Set<string>();
  const sampleRows: { id: string; title: string; employer: string | null }[] = [];
  for (const t of distinctTitles) {
    if (sampleRows.length >= 15) break;
    if (seen.has(t.title)) continue;
    seen.add(t.title);
    const row = await prisma.job.findFirst({
      where: { ...where, title: t.title },
      select: { id: true, title: true, employer: true },
    });
    if (row) sampleRows.push(row);
  }

  const classifier = CLASSIFIERS[slug];
  const samples: SampleResult[] = sampleRows.map((r) => ({
    title: r.title,
    employer: r.employer,
    ...classifier(r.title),
  }));

  const tp = samples.filter((s) => s.verdict === 'TRUE_POSITIVE');
  const fp = samples.filter((s) => s.verdict === 'FALSE_POSITIVE');
  const fpRate = samples.length === 0 ? 0 : Math.round((fp.length / samples.length) * 100);

  console.log(`\n═══ ${slug} ═══`);
  console.log(`Total matches (30d, isPublished, exclusions applied): ${count}`);
  console.log(`Sampled: ${samples.length}  |  TP: ${tp.length}  |  FP: ${fp.length}  |  FP rate: ${fpRate}%`);
  console.log('\n--- Samples ---');
  samples.forEach((s, i) => {
    console.log(`${String(i + 1).padStart(2)}. [${s.verdict === 'TRUE_POSITIVE' ? 'TP' : 'FP'}] ${s.title}`);
    console.log(`    employer: ${s.employer ?? '(null)'}`);
    console.log(`    reason:   ${s.reason}`);
  });

  return {
    slug,
    count,
    sampleSize: samples.length,
    tpCount: tp.length,
    fpCount: fp.length,
    fpRate,
    firstTp: tp[0]?.title ?? null,
    firstFp: fp[0]?.title ?? null,
    allFps: fp.map((f) => ({ title: f.title, reason: f.reason })),
  };
}

async function probeLatentRisk() {
  // Probe the filter keywords directly against the whole published corpus
  // (no exclusions, no freshness) to see what TYPES of titles each keyword
  // currently pulls in. This exposes regex-level FP risk independently
  // of whether the global exclusions currently mask them.
  const now = new Date();
  const fresh = freshnessClause(now, '30d');
  const probes: Array<{ slug: string; keyword: string; clause: any }> = [
    { slug: 'community-health', keyword: 'community', clause: { title: { contains: 'community', mode: 'insensitive' as const } } },
    { slug: 'correctional', keyword: 'forensic', clause: { title: { contains: 'forensic', mode: 'insensitive' as const } } },
    { slug: 'child-adolescent', keyword: 'pediatric mental', clause: { title: { contains: 'pediatric mental', mode: 'insensitive' as const } } },
  ];

  console.log('\n\n═══ LATENT REGEX RISK PROBE (raw keyword hits) ═══');
  for (const p of probes) {
    // 30d-fresh + published
    const recent = await prisma.job.findMany({
      where: { isPublished: true, AND: [p.clause, fresh] },
      select: { title: true, employer: true },
      distinct: ['title'],
      orderBy: { title: 'asc' },
      take: 30,
    });
    // All-time published (no freshness) — shows what the regex CAN sweep in
    const all = await prisma.job.findMany({
      where: { isPublished: true, ...p.clause },
      select: { title: true, employer: true },
      distinct: ['title'],
      orderBy: { title: 'asc' },
      take: 40,
    });
    console.log(`\n[${p.slug}] keyword "${p.keyword}" — ${recent.length} distinct titles in 30d, ${all.length} all-time:`);
    console.log('  -- 30d --');
    recent.forEach((r) => console.log(`    ${r.title}  [${r.employer ?? '?'}]`));
    console.log('  -- all-time distinct titles --');
    all.forEach((r) => console.log(`    ${r.title}  [${r.employer ?? '?'}]`));
  }
}

async function main() {
  const slugs = ['child-adolescent', 'community-health', 'correctional'];
  const results = [];
  for (const slug of slugs) {
    results.push(await auditFilter(slug));
  }

  await probeLatentRisk();

  console.log('\n\n═══ SUMMARY TABLE ═══');
  console.log('| Filter | Count | Sample TP | Sample FP | FP rate |');
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    const tpExample = r.firstTp ? `"${r.firstTp.slice(0, 60)}"` : '—';
    const fpExample = r.firstFp ? `"${r.firstFp.slice(0, 60)}"` : '—';
    console.log(`| ${r.slug} | ${r.count} | ${tpExample} | ${fpExample} | ${r.fpRate}% |`);
  }

  console.log('\n═══ ALL FP TITLES (for fix recommendations) ═══');
  for (const r of results) {
    console.log(`\n[${r.slug}]`);
    r.allFps.forEach((f) => console.log(`  - "${f.title}"  (${f.reason})`));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
