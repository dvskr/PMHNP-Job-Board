/**
 * READ-ONLY audit: finds published jobs whose salary surfaces disagree.
 *
 * For every published job it compares the numeric content of:
 *   (a) jobSalaryText        — the string the card/header/OG image show
 *   (b) formatSalary(raw)    — the string the raw minSalary/maxSalary imply
 *   (c) description extract  — the first $X-$Y /hr|/yr range in the text
 *
 * Values are annualized before comparison (hourly x2080, daily x200, etc.)
 * with tolerance for k-rounding, and every row where the present pairs
 * disagree is printed with all three strings so the operator can repair
 * the stored fields. No writes.
 *
 * Usage: npx tsx scripts/audit-salary-consistency.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { jobSalaryText } from '../lib/salary-display';
import { formatSalary, canonicalSalaryPeriod, type SalaryPeriodKey } from '../lib/utils';
import { extractSalaryFromDescription } from '../lib/salary-utils';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface SalaryPair {
  min: number;
  max: number;
}

const ANNUAL_FACTOR: Record<SalaryPeriodKey, number> = {
  hourly: 2080,
  daily: 200, // matches lib/salary-utils.ts per-diem assumption
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  annual: 1,
};

/** Parse the numeric pair out of a rendered salary string, annualized. */
function parseSalaryString(text: string | null): SalaryPair | null {
  if (!text) return null;
  const numbers: number[] = [];
  const numberToken = /\$?(\d+(?:,\d{3})*(?:\.\d+)?)(k)?/gi;
  let m: RegExpExecArray | null;
  while ((m = numberToken.exec(text)) !== null && numbers.length < 2) {
    const value = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
    if (value > 0) numbers.push(value);
  }
  if (numbers.length === 0) return null;

  const lower = text.toLowerCase();
  let period: SalaryPeriodKey = 'annual';
  if (/\/\s*hr|per\s*hour|hourly|\/\s*hour/.test(lower)) period = 'hourly';
  else if (/\/\s*day|per\s*day|per\s*diem|daily/.test(lower)) period = 'daily';
  else if (/\/\s*week|per\s*week|weekly/.test(lower)) period = 'weekly';
  else if (/\/\s*2wk|biweekly/.test(lower)) period = 'biweekly';
  else if (/\/\s*mo\b|per\s*month|monthly/.test(lower)) period = 'monthly';

  const factor = ANNUAL_FACTOR[period];
  const min = numbers[0] * factor;
  const max = (numbers[1] ?? numbers[0]) * factor;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

/** Annualized pair from the description extractor's raw output. */
function pairFromDescription(description: string | null): SalaryPair | null {
  if (!description) return null;
  const extracted = extractSalaryFromDescription(description);
  if (!extracted || (extracted.min == null && extracted.max == null)) return null;
  const factor = ANNUAL_FACTOR[canonicalSalaryPeriod(extracted.type)];
  const min = (extracted.min ?? extracted.max ?? 0) * factor;
  const max = (extracted.max ?? extracted.min ?? 0) * factor;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

// k-rounding shifts an annual bound by up to ~$500 and hourly rounding by
// up to ~$1,040/yr, so anything inside this band is the same number.
function pairsDisagree(a: SalaryPair | null, b: SalaryPair | null): boolean {
  if (!a || !b) return false;
  const tolerance = (x: number, y: number) => Math.max(1500, 0.03 * Math.max(x, y));
  return (
    Math.abs(a.min - b.min) > tolerance(a.min, b.min) ||
    Math.abs(a.max - b.max) > tolerance(a.max, b.max)
  );
}

async function auditSalaryConsistency() {
  console.log('SALARY CONSISTENCY AUDIT (read-only)\n' + '='.repeat(60));

  const jobs = await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      slug: true,
      minSalary: true,
      maxSalary: true,
      salaryPeriod: true,
      salaryRange: true,
      displaySalary: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      description: true,
    },
  });
  console.log(`Checking ${jobs.length} published jobs...\n`);

  let mismatches = 0;
  for (const job of jobs) {
    const displayText = jobSalaryText(job);
    const rawText = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod) || null;
    const displayPair = parseSalaryString(displayText);
    const rawPair = parseSalaryString(rawText);
    const descriptionPair = pairFromDescription(job.description);

    const disagrees =
      pairsDisagree(displayPair, rawPair) ||
      pairsDisagree(displayPair, descriptionPair) ||
      pairsDisagree(rawPair, descriptionPair);
    if (!disagrees) continue;

    mismatches++;
    console.log(`✗ ${job.id}  /jobs/${job.slug}`);
    console.log(`    display:     ${displayText ?? '(none)'}`);
    console.log(`    raw fields:  ${rawText ?? '(none)'}`);
    console.log(`    description: ${descriptionPair ? `$${Math.round(descriptionPair.min).toLocaleString()}-$${Math.round(descriptionPair.max).toLocaleString()}/yr equivalent` : '(none)'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Jobs checked:  ${jobs.length}`);
  console.log(`Inconsistent:  ${mismatches}`);
  if (mismatches > 0) {
    console.log('\nRepair options: re-run scripts/fix-all-salaries.ts, or fix rows by hand.');
  }

  await prisma.$disconnect();
}

auditSalaryConsistency().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
