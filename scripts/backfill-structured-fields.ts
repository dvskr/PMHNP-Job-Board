/**
 * Backfills the two structured-array columns added 2026-08 for rows that
 * predate them (both default to [] so every pre-existing row is empty):
 *
 *   eligibleStateCodes  Fully-remote jobs only (isRemote && !isHybrid):
 *                       extractEligibleStates over the stored description,
 *                       full names mapped to 2-letter codes. Everything
 *                       else stays [] (nationwide / not applicable).
 *   jobTypes            collectJobTypes(jobType, title) — the primary
 *                       jobType first, then every other canonical type the
 *                       TITLE signals. Title-only mirrors the JSON-LD
 *                       title-combo detection this column replaces AND the
 *                       ingest normalizer (also title-only), so re-runs are
 *                       idempotent against fresh ingests; description
 *                       scanning would over-collect from boilerplate.
 *
 * Both computations reuse the ingest-path helpers (lib/eligible-states.ts,
 * lib/job-normalizer.ts collectJobTypes) so backfilled rows match what a
 * fresh ingest would write. DRY RUN by default; pass --apply to write. No
 * per-row backup: both columns are new and default-empty, so re-running
 * with different logic is always safe.
 *
 * Usage: npx tsx scripts/backfill-structured-fields.ts [--apply]
 */
// dotenv/config must load BEFORE lib/job-normalizer's transitive
// lib/prisma import, which asserts DATABASE_URL at module scope.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { extractEligibleStates } from '../lib/eligible-states';
import { STATE_NAME_TO_CODE } from '../lib/us-states';
import { collectJobTypes } from '../lib/job-normalizer';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;
const SAMPLES_PER_RULE = 5;

interface JobRow {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  jobType: string | null;
  isRemote: boolean;
  isHybrid: boolean;
  eligibleStateCodes: string[];
  jobTypes: string[];
}

interface PlannedUpdate {
  id: string;
  slug: string | null;
  data: { eligibleStateCodes?: string[]; jobTypes?: string[] };
  summary: string;
}

function computeEligibleStateCodes(job: JobRow): string[] {
  if (!job.isRemote || job.isHybrid) return [];
  return extractEligibleStates(job.description ?? '')
    .map((name) => STATE_NAME_TO_CODE[name])
    .filter((code): code is string => !!code);
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function backfillStructuredFields() {
  console.log(`STRUCTURED FIELDS BACKFILL ${APPLY ? '(APPLY)' : '(dry run)'}\n` + '='.repeat(60));

  const counts = { eligibleStates: 0, jobTypes: 0, both: 0, unchanged: 0 };
  const planned: PlannedUpdate[] = [];
  const samples: Record<'eligibleStates' | 'jobTypes', string[]> = {
    eligibleStates: [],
    jobTypes: [],
  };

  let cursor: string | null = null;
  let scanned = 0;
  for (;;) {
    const batch: JobRow[] = await prisma.job.findMany({
      where: { isPublished: true },
      select: {
        id: true, slug: true, title: true, description: true,
        jobType: true, isRemote: true, isHybrid: true,
        eligibleStateCodes: true, jobTypes: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    scanned += batch.length;

    for (const job of batch) {
      const computedEligible = computeEligibleStateCodes(job);
      const computedTypes = collectJobTypes(job.jobType, job.title);
      const eligibleChanged = !arraysEqual(computedEligible, job.eligibleStateCodes);
      const typesChanged = !arraysEqual(computedTypes, job.jobTypes);

      if (!eligibleChanged && !typesChanged) {
        counts.unchanged++;
        continue;
      }

      const data: PlannedUpdate['data'] = {};
      const parts: string[] = [];
      if (eligibleChanged) {
        data.eligibleStateCodes = computedEligible;
        counts.eligibleStates++;
        parts.push(`eligible [${job.eligibleStateCodes.join(',')}] -> [${computedEligible.join(',')}]`);
        if (samples.eligibleStates.length < SAMPLES_PER_RULE) {
          samples.eligibleStates.push(`/jobs/${job.slug ?? job.id}: [${computedEligible.join(', ')}]`);
        }
      }
      if (typesChanged) {
        data.jobTypes = computedTypes;
        counts.jobTypes++;
        parts.push(`types [${job.jobTypes.join(',')}] -> [${computedTypes.join(',')}]`);
        if (samples.jobTypes.length < SAMPLES_PER_RULE) {
          samples.jobTypes.push(`/jobs/${job.slug ?? job.id}: [${computedTypes.join(', ')}]`);
        }
      }
      if (eligibleChanged && typesChanged) counts.both++;

      planned.push({ id: job.id, slug: job.slug, data, summary: parts.join(' | ') });
    }
    console.log(`  scanned ${scanned} published jobs, ${planned.length} updates planned...`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Scanned:   ${scanned} published jobs`);
  console.log(`Planned:   eligibleStateCodes ${counts.eligibleStates}, jobTypes ${counts.jobTypes} (both ${counts.both})`);
  console.log(`Unchanged: ${counts.unchanged}`);

  for (const rule of ['eligibleStates', 'jobTypes'] as const) {
    if (samples[rule].length > 0) {
      console.log(`\nSample ${rule}:`);
      for (const line of samples[rule]) console.log(`  ${line}`);
    }
  }

  if (APPLY && planned.length > 0) {
    console.log('');
    let applied = 0;
    for (const plan of planned) {
      await prisma.job.update({ where: { id: plan.id }, data: plan.data });
      applied++;
      if (applied % 100 === 0) console.log(`  applied ${applied}/${planned.length}...`);
    }
    console.log(`Applied ${applied} updates.`);
  } else if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write.');
  }

  await prisma.$disconnect();
}

backfillStructuredFields().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
