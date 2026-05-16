/**
 * Substance-Abuse vs Addiction filter audit.
 *
 * Read-only. Loads .env.prod, builds the same WHERE clauses the
 * /jobs/substance-abuse and /jobs/addiction category pages render,
 * prints counts, set-overlap, a 20-row sample from each, and classifies
 * each sampled title as TP / FP / ambiguous against a hand-rolled
 * positive/negative regex set.
 *
 * Also probes specific concerns:
 *   1. `contains: 'SUD '` (trailing space) — does it miss "SUD" at end
 *      of string, "SUDs", "[SUD]", or different casing?
 *   2. `contains: 'buprenorphine'` — the substance-abuse filter only
 *      checks title; does the description carry the term for jobs whose
 *      title doesn't mention SUD/MAT/addiction?
 *
 * Run:  npx tsx scripts/audit/audit-substance-filter.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause, CATEGORY_FILTERS } from '@/lib/filters';

// ── Heuristics ────────────────────────────────────────────────────────────
// True-positive signals — title strongly implies addiction/SUD work.
const TP_TITLE = [
  /\baddiction\b/i,
  /\bsubstance\b/i,
  /\bSUD\b/i,
  /\bsuboxone\b/i,
  /\bbuprenorphine\b/i,
  /\bmedication[- ]assisted\b/i,
  /\bMAT\b/,
  /\bopioid\b/i,
  /\bdetox\b/i,
  /\bdual[- ]diagnosis\b/i,
  /\brecovery (center|services|clinic|program)\b/i,
  /\bmethadone\b/i,
  /\bnaltrexone\b/i,
];

// False-positive signals — title generic word matched but the role is
// not addiction-focused (e.g. "recovery" in postpartum recovery, "MAT"
// inside CAT/MAT acronym, "virtual" for telehealth, etc.).
const FP_TITLE_HINTS = [
  // "recovery" used in non-SUD context
  /post[- ]?op recovery|post[- ]?surgical recovery|surgical recovery/i,
  // generic "substance" misses — almost always a real match, leave alone
];

interface JobRow {
  id: string;
  title: string;
  employer: string;
  description: string | null;
}

function classify(title: string): 'TP' | 'FP' | 'AMB' {
  const hasTP = TP_TITLE.some((rx) => rx.test(title));
  const hasFP = FP_TITLE_HINTS.some((rx) => rx.test(title));
  if (hasTP && !hasFP) return 'TP';
  if (hasFP && !hasTP) return 'FP';
  if (hasTP && hasFP) return 'AMB';
  // No strong positive — the filter matched on a thin keyword.
  return 'AMB';
}

function preview(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max - 1) + '…' : title;
}

async function fetchSet(slug: string, take: number): Promise<JobRow[]> {
  return prisma.job.findMany({
    where: buildCategoryWhereClause(slug),
    select: { id: true, title: true, employer: true, description: true },
    orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
    take,
  });
}

async function countSlug(slug: string): Promise<number> {
  return prisma.job.count({ where: buildCategoryWhereClause(slug) });
}

async function main(): Promise<void> {
  const totalAll = await prisma.job.count({ where: { isPublished: true } });
  const saCount = await countSlug('substance-abuse');
  const addCount = await countSlug('addiction');

  console.log('═'.repeat(78));
  console.log('SUBSTANCE-ABUSE vs ADDICTION FILTER AUDIT');
  console.log('═'.repeat(78));
  console.log(`Total published jobs:           ${totalAll}`);
  console.log(`/jobs/substance-abuse count:    ${saCount}  ` +
    `(${((saCount / Math.max(totalAll, 1)) * 100).toFixed(1)}%)`);
  console.log(`/jobs/addiction count:          ${addCount}  ` +
    `(${((addCount / Math.max(totalAll, 1)) * 100).toFixed(1)}%)`);

  // ── Alias check: pull all IDs for both sets, compute overlap ───────────
  const [saIds, addIds] = await Promise.all([
    prisma.job.findMany({
      where: buildCategoryWhereClause('substance-abuse'),
      select: { id: true },
    }),
    prisma.job.findMany({
      where: buildCategoryWhereClause('addiction'),
      select: { id: true },
    }),
  ]);
  const saSet = new Set(saIds.map((j) => j.id));
  const addSet = new Set(addIds.map((j) => j.id));
  const intersection = [...saSet].filter((id) => addSet.has(id)).length;
  const onlySA = saSet.size - intersection;
  const onlyAdd = addSet.size - intersection;
  const jaccard = intersection / (saSet.size + addSet.size - intersection || 1);

  console.log();
  console.log('── Set overlap ──');
  console.log(`  In both:           ${intersection}`);
  console.log(`  Only substance:    ${onlySA}`);
  console.log(`  Only addiction:    ${onlyAdd}`);
  console.log(`  Jaccard similarity: ${(jaccard * 100).toFixed(1)}%`);
  console.log(`  Aliased? ${onlySA === 0 && onlyAdd === 0 ? 'YES (identical)' : 'NO (different result sets)'}`);

  // ── Sample 20 from each, classify ───────────────────────────────────────
  for (const slug of ['substance-abuse', 'addiction'] as const) {
    const rows = await fetchSet(slug, 20);
    console.log();
    console.log(`── /jobs/${slug} — sample of 20 (best-scored first) ──`);
    const tally = { TP: 0, FP: 0, AMB: 0 };
    for (const j of rows) {
      const cls = classify(j.title);
      tally[cls] += 1;
      console.log(`  [${cls}] ${preview(j.title)}`);
      console.log(`         ${j.employer}`);
    }
    console.log(`  → TP=${tally.TP}  AMB=${tally.AMB}  FP=${tally.FP}`);
  }

  // ── Concern #1: `contains: 'SUD '` (trailing space) ─────────────────────
  console.log();
  console.log('── Probe: `SUD ` trailing-space behavior ──');
  console.log("substance-abuse filter uses { title: { contains: 'SUD ' } }");
  console.log("addiction filter uses        { title: { contains: ' SUD' } }");
  console.log('Test: jobs with SUD as a token in title NOT already caught by');
  console.log('other clauses (addiction / substance / suboxone / MAT / etc.).');
  // Find jobs where title matches /\bSUD\b/i but the substance-abuse
  // filter would *miss* if `SUD ` (trailing space) were the only clause.
  const sudCandidates = await prisma.job.findMany({
    where: {
      isPublished: true,
      title: { contains: 'SUD', mode: 'insensitive' },
    },
    select: { id: true, title: true },
    take: 100,
  });
  let sudTrailingMiss = 0;
  let sudLeadingMiss = 0;
  const sudMissExamples: string[] = [];
  for (const j of sudCandidates) {
    // The token-level question: title contains "SUD" as a word but
    // neither " SUD" nor "SUD " is in the original casing.
    const hasTrailingSpace = /SUD /i.test(j.title);
    const hasLeadingSpace = / SUD/i.test(j.title);
    // Word boundary that excludes "Education", "Studio", etc.
    const isWordSud = /\bSUD\b/i.test(j.title);
    if (!isWordSud) continue;
    if (!hasTrailingSpace) sudTrailingMiss += 1;
    if (!hasLeadingSpace) sudLeadingMiss += 1;
    if (!hasTrailingSpace || !hasLeadingSpace) {
      if (sudMissExamples.length < 8) sudMissExamples.push(j.title);
    }
  }
  console.log(`  Titles with SUD as a word: ${sudCandidates.filter((j) => /\bSUD\b/i.test(j.title)).length}`);
  console.log(`    → missed by 'SUD ' (no trailing space): ${sudTrailingMiss}`);
  console.log(`    → missed by ' SUD' (no leading space):  ${sudLeadingMiss}`);
  for (const t of sudMissExamples) console.log(`      · ${preview(t)}`);

  // ── Concern #2: buprenorphine in description but not title ──────────────
  console.log();
  console.log('── Probe: buprenorphine in description but NOT in title ──');
  console.log('substance-abuse filter only checks { title: { contains: ');
  console.log("  'buprenorphine' } }. Are there jobs whose description");
  console.log('  mentions buprenorphine but title does not — i.e. missed by');
  console.log('  /jobs/substance-abuse though they ARE addiction roles?');
  const bupBodyOnly = await prisma.job.findMany({
    where: {
      isPublished: true,
      description: { contains: 'buprenorphine', mode: 'insensitive' },
      NOT: { title: { contains: 'buprenorphine', mode: 'insensitive' } },
    },
    select: { id: true, title: true, employer: true },
    take: 200,
  });
  // Of those, how many are NOT picked up by ANY substance-abuse clause?
  const saAllIds = saSet;
  const missedBySA = bupBodyOnly.filter((j) => !saAllIds.has(j.id));
  console.log(`  Jobs with buprenorphine in body but not title: ${bupBodyOnly.length}`);
  console.log(`    → of those, MISSED by /jobs/substance-abuse: ${missedBySA.length}`);
  console.log(`    → ALSO compare to /jobs/addiction (uses description clause):`);
  const missedByAddiction = bupBodyOnly.filter((j) => !addSet.has(j.id));
  console.log(`       missed by /jobs/addiction: ${missedByAddiction.length}`);
  for (const j of missedBySA.slice(0, 8)) {
    console.log(`      · ${preview(j.title)}  —  ${j.employer}`);
  }

  // ── Filter logic dump ───────────────────────────────────────────────────
  console.log();
  console.log('── Logic source ──');
  console.log('substance-abuse clauses:');
  for (const c of CATEGORY_FILTERS['substance-abuse'] ?? []) {
    console.log(`  ${JSON.stringify(c)}`);
  }
  console.log('addiction clauses:');
  for (const c of CATEGORY_FILTERS['addiction'] ?? []) {
    console.log(`  ${JSON.stringify(c)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
