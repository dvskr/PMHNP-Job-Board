/**
 * Repair LLM-enriched salary rows damaged by the 2026-07-05 renormalize run.
 *
 * That run (scripts/renormalize-salaries.ts before its provenance guard)
 * re-derived enrichment-owned rows from their raw fields, wiping
 * salaryIsEstimated=true / salaryConfidence=0.7, reformatting displaySalary,
 * and clearing normalized values on rows the new policy floor rejected.
 *
 * Target set (verified via read-only introspection 2026-07-06):
 *   salaryPeriod = 'year'  (only the enrichment pipeline writes 'year')
 *   AND salaryRange IS NULL (regex found no source salary — LLM filled it)
 *   AND updatedAt inside the damage window.
 * Restores the enrichment convention: normalized = raw (LLM values are
 * already annualized), isEstimated=true, confidence=0.7, spaced display.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register --project scripts/tsconfig.json \
 *     scripts/repair-enriched-salaries.ts --dry-run   # report only
 *   ... without --dry-run to apply.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { prisma } from '../lib/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

// The damaging renormalize run executed 2026-07-05 ~23:35-23:41 UTC.
const WINDOW_START = new Date('2026-07-05T23:25:00Z');
const WINDOW_END = new Date('2026-07-06T00:05:00Z');

async function main() {
  if (DRY_RUN) console.log('🧪 DRY RUN — no writes.\n');

  const damaged = await prisma.job.findMany({
    where: {
      salaryPeriod: 'year',
      salaryRange: null,
      minSalary: { not: null },
      updatedAt: { gte: WINDOW_START, lt: WINDOW_END },
    },
    select: {
      id: true,
      title: true,
      minSalary: true,
      maxSalary: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      salaryIsEstimated: true,
      salaryConfidence: true,
      displaySalary: true,
    },
  });

  console.log(`Found ${damaged.length} enrichment-owned rows in the damage window.\n`);

  let repaired = 0;
  let alreadyCanonical = 0;

  for (const job of damaged) {
    const min = job.minSalary!;
    const max = job.maxSalary ?? min;
    const display = `$${Math.round(min / 1000)}k - $${Math.round(max / 1000)}k/yr`;

    const canonical =
      job.normalizedMinSalary === min &&
      job.normalizedMaxSalary === max &&
      job.salaryIsEstimated === true &&
      job.salaryConfidence === 0.7 &&
      job.displaySalary === display;

    if (canonical) {
      alreadyCanonical++;
      continue;
    }

    console.log(
      `  🔧 ${job.title.substring(0, 50)} — was ` +
        `[est=${job.salaryIsEstimated}, conf=${job.salaryConfidence}, ` +
        `norm=${job.normalizedMinSalary ?? 'null'}-${job.normalizedMaxSalary ?? 'null'}, ` +
        `disp=${job.displaySalary ?? 'null'}] → [est=true, conf=0.7, norm=${min}-${max}, disp=${display}]`
    );

    if (!DRY_RUN) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          normalizedMinSalary: min,
          normalizedMaxSalary: max,
          salaryIsEstimated: true,
          salaryConfidence: 0.7,
          displaySalary: display,
        },
      });
    }
    repaired++;
  }

  console.log(
    `\n${DRY_RUN ? 'Would repair' : 'Repaired'}: ${repaired}, already canonical: ${alreadyCanonical}, total examined: ${damaged.length}`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
