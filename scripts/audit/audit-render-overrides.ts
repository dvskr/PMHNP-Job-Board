/**
 * Audit: experience-label render-time override coverage and stored-data sanity.
 *
 * Samples 500 jobs and computes `effectiveExperienceLabel(job)` (the render-time
 * helper used by JobCard list/grid views and the JD detail page) against the
 * stored `experienceLabel` column. The goal is to separate two classes of
 * issue:
 *
 *   (a) RENDER-TIME OVERRIDE working as intended — title clearly signals a
 *       new-grad context (residency / fellowship / training / new-grad / recent
 *       grad / entry-level) but the stored value is something else like
 *       "5+ yrs". The helper rewrites these to "New grad welcome" at render.
 *
 *   (b) STORED-DATA BUG — title does NOT match any new-grad pattern, but the
 *       stored experienceLabel is literally "New grad welcome". The helper
 *       can't fix this because the bug is upstream of render. These rows need
 *       a backfill / re-enrichment.
 *
 * Run: npx tsx scripts/audit/audit-render-overrides.ts [--env=prod|dev]
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
import {
  effectiveExperienceLabel,
  titleIndicatesNewGrad,
} from '@/lib/experience-label';

const SAMPLE_SIZE = 500;
const NEW_GRAD_LABEL = 'New grad welcome';

interface JobRow {
  id: string;
  slug: string | null;
  title: string;
  experienceLabel: string | null;
}

interface Bucket {
  count: number;
  examples: Array<{ title: string; stored: string | null; effective: string | null }>;
}

function emptyBucket(): Bucket {
  return { count: 0, examples: [] };
}

function add(b: Bucket, row: JobRow, effective: string | null, cap = 10) {
  b.count++;
  if (b.examples.length < cap) {
    b.examples.push({ title: row.title, stored: row.experienceLabel, effective });
  }
}

async function main() {
  console.log(`[audit-render-overrides] env=${ENV} sample=${SAMPLE_SIZE}\n`);

  const jobs: JobRow[] = await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      slug: true,
      title: true,
      experienceLabel: true,
    },
    orderBy: { createdAt: 'desc' },
    take: SAMPLE_SIZE,
  });

  console.log(`Pulled ${jobs.length} published jobs.\n`);

  const overriddenToNewGrad = emptyBucket(); // title triggers override → "New grad welcome"
  const passthrough = emptyBucket();          // title doesn't trigger; stored != null
  const bothNull = emptyBucket();              // title doesn't trigger; stored null
  const storedDataBug = emptyBucket();         // title doesn't trigger BUT stored == "New grad welcome"
  const fixedByOverride = emptyBucket();       // title triggers AND stored != "New grad welcome" (helper is doing real work)
  const noopMatched = emptyBucket();           // title triggers AND stored already == "New grad welcome"

  for (const job of jobs) {
    const titleMatches = titleIndicatesNewGrad(job.title);
    const effective = effectiveExperienceLabel(job);
    const stored = job.experienceLabel;

    if (titleMatches) {
      // Render-time override path
      add(overriddenToNewGrad, job, effective);
      if (stored === NEW_GRAD_LABEL) {
        add(noopMatched, job, effective);
      } else {
        // Helper is correcting a stored value (the residency/fellowship fix)
        add(fixedByOverride, job, effective);
      }
    } else {
      // No title override — effective should equal stored
      if (stored === null) {
        add(bothNull, job, effective);
      } else {
        add(passthrough, job, effective);
        if (stored === NEW_GRAD_LABEL) {
          // Title does NOT match override but DB row literally says "New grad welcome".
          // This is the stored-data bug class — the only way to fix this is
          // upstream (re-enrichment / backfill), the render helper is innocent.
          add(storedDataBug, job, effective);
        }
      }
    }
  }

  const printBucket = (name: string, b: Bucket) => {
    console.log(`\n${name}: ${b.count}`);
    for (const ex of b.examples) {
      console.log(`  - title="${ex.title}"  stored=${JSON.stringify(ex.stored)}  effective=${JSON.stringify(ex.effective)}`);
    }
  };

  console.log('\n========== BUCKETS ==========');
  console.log(`Total sampled: ${jobs.length}`);
  console.log(`overridden_to_newgrad (title matched override): ${overriddenToNewGrad.count}`);
  console.log(`  ├─ no-op (stored already "New grad welcome"): ${noopMatched.count}`);
  console.log(`  └─ fixed by override (stored was wrong):       ${fixedByOverride.count}`);
  console.log(`passthrough (title not matched, stored kept):    ${passthrough.count}`);
  console.log(`both_null (no title match, no stored label):     ${bothNull.count}`);
  console.log(`STORED-DATA BUG (no title match + stored=="New grad welcome"): ${storedDataBug.count}`);

  printBucket('=== overridden_to_newgrad (sample 10) ===', overriddenToNewGrad);
  printBucket('=== fixed_by_override — helper doing real work (sample 10) ===', fixedByOverride);
  printBucket('=== passthrough (sample 10) ===', passthrough);
  printBucket('=== STORED-DATA BUG: stored=="New grad welcome" without title signal (sample 10) ===', storedDataBug);

  // Standalone Wichita-style sanity check.
  console.log('\n========== Wichita title sanity ==========');
  const wichitaTitle = 'Wichita | PMHNP | FT (5d/w)';
  console.log(`titleIndicatesNewGrad(${JSON.stringify(wichitaTitle)}) = ${titleIndicatesNewGrad(wichitaTitle)}  (expected: false)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
