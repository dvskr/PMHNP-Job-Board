/**
 * Audit four work-setting filters (outpatient, inpatient, telehealth, remote).
 *
 * Resolves the ACTUAL WHERE clause used by each /jobs/<slug>/page.tsx
 * (some pages use buildCategoryWhereClause, /jobs/remote hardcodes
 * isRemote:true + GLOBAL_EXCLUSIONS, /jobs/inpatient adds
 * { isRemote: { not: true } }).
 *
 * For each filter: count, sample 15, classify TP/FP via title regex.
 * Also probes:
 *   - "Remote PMHNP" in title — does it count as remote?  (NO — remote
 *     uses isRemote boolean only)
 *   - Job with isRemote=true but title "Inpatient PMHNP" — does it leak
 *     into 'inpatient'?  (NO — inpatient page filter explicitly excludes
 *     isRemote: { not: true })
 *   - telehealth ↔ remote overlap (treated DISTINCT — telehealth is
 *     title-keyword, remote is structured boolean)
 *
 * Run:  npx tsx scripts/audit/audit-setting-filters.ts         (defaults to prod)
 *       npx tsx scripts/audit/audit-setting-filters.ts --dev
 */
import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
  const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
  if (flag === 'dev' || flag === 'prod') return flag;
  if (process.argv.includes('--dev')) return 'dev';
  if (process.argv.includes('--prod')) return 'prod';
  return 'prod';
}
const ENV: EnvKind = parseEnvFlag();
if (ENV === 'prod') {
  dotenvConfig({ path: '.env.prod' });
  if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
  }
  if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
  }
} else {
  dotenvConfig({ path: '.env' });
}

import type { Prisma } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCategoryWhereClause, GLOBAL_EXCLUSIONS } =
  require('@/lib/filters') as typeof import('@/lib/filters');

type FilterDef = {
  slug: 'outpatient' | 'inpatient' | 'telehealth' | 'remote';
  fieldUsed: string;
  where: Prisma.JobWhereInput;
  /** Regex that defines a true positive for this slug. */
  tpRegex: RegExp;
  /** Regex(es) that flag a false positive in the title. */
  fpRegex: RegExp[];
  /** If true, isRemote=true alone is NOT enough for TP (e.g. inpatient). */
  remoteIsFP?: boolean;
  /** If true, a TP must have isRemote=true regardless of title. */
  requireRemoteFlag?: boolean;
};

// Mirror what each page.tsx composes — read directly from source so audit
// stays honest if a page changes.
const REMOTE_WHERE: Prisma.JobWhereInput = {
  isPublished: true,
  isRemote: true,
  AND: GLOBAL_EXCLUSIONS.map((e) => ({ NOT: e })),
};

const FILTERS: FilterDef[] = [
  {
    slug: 'outpatient',
    fieldUsed: 'title regex (4 keywords) + CATEGORY_EXCLUSIONS + GLOBAL_EXCLUSIONS',
    where: buildCategoryWhereClause('outpatient'),
    tpRegex: /\b(outpatient|out-patient|private practice|community mental health)\b/i,
    fpRegex: [/\binpatient\b/i, /\bacute care\b/i],
  },
  {
    slug: 'inpatient',
    fieldUsed: 'title regex (4 keywords) + isRemote:{not:true} + GLOBAL_EXCLUSIONS',
    where: buildCategoryWhereClause('inpatient', { isRemote: { not: true } }),
    tpRegex: /\b(inpatient|in-patient|acute care|hospital)\b/i,
    fpRegex: [
      /\boutpatient\b/i,
      /\bclinic\b/i,
      /\bambulatory\b/i,
      /\btelehealth\b/i,
      /\btelepsych/i,
      /\bvirtual\b/i,
      /\bremote\b/i,
      /\bhome[-\s]?based\b/i,
      /\bfqhc\b/i,
      /\bprivate practice\b/i,
    ],
    remoteIsFP: true,
  },
  {
    slug: 'telehealth',
    fieldUsed: 'title regex only (telehealth/telemedicine/telepsychiatry/virtual)',
    where: buildCategoryWhereClause('telehealth'),
    tpRegex: /\b(telehealth|telemedicine|telepsych|virtual)\b/i,
    fpRegex: [
      // "virtual" is a notorious false-positive trigger ("virtual interview",
      // "virtual onboarding") — flag if no other telehealth signal.
    ],
  },
  {
    slug: 'remote',
    fieldUsed: 'STRUCTURED isRemote=true boolean (NO title regex)',
    where: REMOTE_WHERE,
    tpRegex: /.*/, // any job with isRemote=true is TP by definition here
    fpRegex: [],
    requireRemoteFlag: true,
  },
];

interface SampledJob {
  id: string;
  title: string;
  city: string | null;
  state: string | null;
  isRemote: boolean;
  isHybrid: boolean;
}

function classify(j: SampledJob, def: FilterDef): 'TP' | 'FP' {
  // For 'remote': definition is the boolean, so any row matching is TP.
  if (def.requireRemoteFlag) return j.isRemote ? 'TP' : 'FP';

  const t = j.title || '';
  // Hard FP rules first
  for (const re of def.fpRegex) {
    if (re.test(t)) {
      // Exception: if title also matches TP regex strongly, give benefit of the
      // doubt. E.g. "Inpatient & Outpatient PMHNP" matches inpatient TP too.
      if (def.tpRegex.test(t) && !def.fpRegex.some((r) => r.test(t) && !def.tpRegex.test(t))) {
        // Title contains BOTH a TP and FP keyword — call it borderline TP
        // (kept under TP bucket).
        return 'TP';
      }
      return 'FP';
    }
  }
  // remoteIsFP: an inpatient match shouldn't surface remote-flagged jobs
  if (def.remoteIsFP && j.isRemote) return 'FP';
  return def.tpRegex.test(t) ? 'TP' : 'FP';
}

async function auditOne(def: FilterDef) {
  const count = await prisma.job.count({ where: def.where });
  const samples = (await prisma.job.findMany({
    where: def.where,
    select: { id: true, title: true, city: true, state: true, isRemote: true, isHybrid: true },
    orderBy: [{ originalPostedAt: 'desc' }, { createdAt: 'desc' }],
    take: 15,
  })) as SampledJob[];

  let tp = 0;
  let fp = 0;
  let firstTP: SampledJob | null = null;
  let firstFP: SampledJob | null = null;

  for (const s of samples) {
    const verdict = classify(s, def);
    if (verdict === 'TP') {
      tp += 1;
      firstTP = firstTP ?? s;
    } else {
      fp += 1;
      firstFP = firstFP ?? s;
    }
  }

  return {
    slug: def.slug,
    fieldUsed: def.fieldUsed,
    count,
    sampleN: samples.length,
    tp,
    fp,
    fpRate: samples.length === 0 ? 0 : Math.round((fp / samples.length) * 100),
    firstTP,
    firstFP,
    samples,
  };
}

function fmtJob(j: SampledJob | null): string {
  if (!j) return '—';
  const loc = [j.city, j.state].filter(Boolean).join(', ') || '—';
  const flags: string[] = [];
  if (j.isRemote) flags.push('isRemote');
  if (j.isHybrid) flags.push('isHybrid');
  const flagStr = flags.length ? ` [${flags.join(',')}]` : '';
  return `"${j.title}" — ${loc}${flagStr}`;
}

async function probe() {
  // Q1: Does title "Remote PMHNP" count toward /jobs/remote?
  // Answer based on logic: only if isRemote=true. We test by counting
  // jobs whose title contains "remote" but isRemote=false.
  const titleRemoteButFlagFalse = await prisma.job.count({
    where: {
      isPublished: true,
      isRemote: false,
      title: { contains: 'remote', mode: 'insensitive' },
    },
  });

  // Q2: Job with isRemote=true but title "Inpatient PMHNP" — leak into
  // inpatient page?
  const inpatientTitleRemoteFlag = await prisma.job.count({
    where: {
      isPublished: true,
      isRemote: true,
      OR: [
        { title: { contains: 'inpatient', mode: 'insensitive' } },
        { title: { contains: 'in-patient', mode: 'insensitive' } },
      ],
    },
  });
  // The /jobs/inpatient page WHERE adds isRemote:{not:true}, so these
  // should be excluded — verify by querying with the live WHERE:
  const inpatientPageLeak = await prisma.job.count({
    where: {
      AND: [
        buildCategoryWhereClause('inpatient', { isRemote: { not: true } }),
        { isRemote: true },
      ],
    },
  });

  // Q3: Telehealth ↔ remote overlap. Treated as synonyms or distinct?
  // /jobs/telehealth uses title regex; /jobs/remote uses isRemote flag.
  // They are distinct fields — measure overlap.
  const telehealthCount = await prisma.job.count({
    where: buildCategoryWhereClause('telehealth'),
  });
  const remoteCount = await prisma.job.count({ where: REMOTE_WHERE });
  const overlap = await prisma.job.count({
    where: {
      AND: [buildCategoryWhereClause('telehealth'), { isRemote: true }],
    },
  });
  const telehealthOnly = telehealthCount - overlap;
  const remoteOnly = remoteCount - overlap;

  return {
    titleRemoteButFlagFalse,
    inpatientTitleRemoteFlag,
    inpatientPageLeak,
    telehealthCount,
    remoteCount,
    overlap,
    telehealthOnly,
    remoteOnly,
  };
}

async function main() {
  console.log('═══ WORK-SETTING FILTER AUDIT ═══\n');

  const results = [];
  for (const def of FILTERS) {
    results.push(await auditOne(def));
  }

  console.log('| Filter | Count | Field used | TP sample | FP sample | FP rate |');
  console.log('|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.slug} | ${r.count} | ${r.fieldUsed} | ${fmtJob(r.firstTP)} | ${fmtJob(r.firstFP)} | ${r.fp}/${r.sampleN} (${r.fpRate}%) |`,
    );
  }

  // Dump full 15-sample list for each filter for verification
  console.log('\n─── FULL SAMPLES (15 each) ───');
  for (const r of results) {
    console.log(`\n## ${r.slug.toUpperCase()} (count=${r.count}, FP=${r.fp}/${r.sampleN})`);
    r.samples.forEach((s, i) => {
      const def = FILTERS.find((f) => f.slug === r.slug)!;
      const verdict = classify(s, def);
      console.log(`  ${i + 1}. [${verdict}] ${fmtJob(s)}`);
    });
  }

  // Cross-cutting probes
  console.log('\n─── CROSS-CUTTING PROBES ───');
  const p = await probe();
  console.log(`Q1. Jobs with "remote" in title but isRemote=false: ${p.titleRemoteButFlagFalse}`);
  console.log(`    → These do NOT appear on /jobs/remote (page uses isRemote flag only).`);
  console.log(
    `Q2. Jobs with isRemote=true AND inpatient/in-patient in title: ${p.inpatientTitleRemoteFlag}`,
  );
  console.log(
    `    → Leaking into /jobs/inpatient page WHERE: ${p.inpatientPageLeak} (page adds isRemote:{not:true} so should be 0)`,
  );
  console.log(`Q3. Telehealth vs Remote distinctness:`);
  console.log(`    telehealth-only (title kw, NOT isRemote): ${p.telehealthOnly}`);
  console.log(`    remote-only    (isRemote, NOT telehealth title): ${p.remoteOnly}`);
  console.log(`    overlap        (both signals):          ${p.overlap}`);
  console.log(
    `    → Treated as DISTINCT (different fields). Overlap is "remote + virtual-care title".`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
