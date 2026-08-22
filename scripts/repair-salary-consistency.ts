/**
 * Repairs the rows scripts/audit-salary-consistency.ts flags, with explicit
 * per-rule policies. DRY RUN by default; pass --apply to write. Before any
 * write it dumps the affected rows' current salary fields to
 * tmp/salary-repair-backup-<runId>.json so the operation is reversible.
 *
 * Rules, first match wins:
 *   R1 desc-adopt      The description states an explicit comp range AND the
 *                      stored fields are anchored to it (a matching bound
 *                      within tolerance) or were LLM-estimated. The employer's
 *                      own text wins: adopt the extracted range wholesale and
 *                      clear the estimated flag.
 *   R2 period-restore  salaryPeriod says hourly but the raw values are
 *                      annual-sized and divide cleanly by 2080 (the known
 *                      fix-stale-salary-periods incident class). Restore the
 *                      hourly raw values.
 *   R3 display-regen   displaySalary text disagrees with what the write path
 *                      would produce from the stored normalized pair (legacy
 *                      strings missing "$" or the period unit). Regenerate it.
 *   --                 Anything else is ambiguous: left untouched and listed
 *                      for the operator.
 *
 * Usage: npx tsx scripts/repair-salary-consistency.ts [--apply]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { formatDisplaySalary, jobSalaryText } from '../lib/salary-display';
import { formatSalary, canonicalSalaryPeriod, type SalaryPeriodKey } from '../lib/utils';
import { extractSalaryFromDescription } from '../lib/salary-utils';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');

const ANNUAL_FACTOR: Record<SalaryPeriodKey, number> = {
  hourly: 2080,
  daily: 200,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  annual: 1,
};

interface SalaryRow {
  id: string;
  slug: string;
  minSalary: number | null;
  maxSalary: number | null;
  salaryPeriod: string | null;
  salaryRange: string | null;
  displaySalary: string | null;
  normalizedMinSalary: number | null;
  normalizedMaxSalary: number | null;
  salaryIsEstimated: boolean;
  description: string;
}

interface RepairPlan {
  rule: 'R1' | 'R2' | 'R3';
  before: string;
  after: string;
  data: Record<string, unknown>;
}

function annualize(value: number, periodKey: SalaryPeriodKey): number {
  return value * ANNUAL_FACTOR[periodKey];
}

// ── Same disagreement detection as scripts/audit-salary-consistency.ts ──
// Repairs are gated on it so only rows the audit flags are ever touched.
interface SalaryPair { min: number; max: number }

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

function pairsDisagree(a: SalaryPair | null, b: SalaryPair | null): boolean {
  if (!a || !b) return false;
  const tolerance = (x: number, y: number) => Math.max(1500, 0.03 * Math.max(x, y));
  return (
    Math.abs(a.min - b.min) > tolerance(a.min, b.min) ||
    Math.abs(a.max - b.max) > tolerance(a.max, b.max)
  );
}

function isFlaggedByAudit(job: SalaryRow): boolean {
  const displayPair = parseSalaryString(jobSalaryText(job));
  const rawPair = parseSalaryString(formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod) || null);
  const extracted = extractSalaryFromDescription(job.description);
  let descriptionPair: SalaryPair | null = null;
  if (extracted && (extracted.min != null || extracted.max != null)) {
    const factor = ANNUAL_FACTOR[canonicalSalaryPeriod(extracted.type)];
    const min = (extracted.min ?? extracted.max ?? 0) * factor;
    const max = (extracted.max ?? extracted.min ?? 0) * factor;
    descriptionPair = { min: Math.min(min, max), max: Math.max(min, max) };
  }
  return (
    pairsDisagree(displayPair, rawPair) ||
    pairsDisagree(displayPair, descriptionPair) ||
    pairsDisagree(rawPair, descriptionPair)
  );
}

// Same "same number" band the audit uses, so repair and audit agree.
function boundsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(2000, 0.05 * Math.max(a, b));
}

function planRepair(job: SalaryRow): RepairPlan | null {
  const extracted = extractSalaryFromDescription(job.description);
  const periodKey = canonicalSalaryPeriod(job.salaryPeriod);

  // ── R1: adopt the description's explicit comp range ──
  if (extracted && (extracted.min != null || extracted.max != null)) {
    const exKey = canonicalSalaryPeriod(extracted.type);
    const exMin = annualize(extracted.min ?? extracted.max ?? 0, exKey);
    const exMax = annualize(extracted.max ?? extracted.min ?? 0, exKey);
    const storedBounds = [
      job.minSalary != null ? annualize(job.minSalary, periodKey) : null,
      job.maxSalary != null ? annualize(job.maxSalary, periodKey) : null,
      job.normalizedMinSalary,
      job.normalizedMaxSalary,
    ].filter((v): v is number => v != null);
    const anchored = storedBounds.some((b) => boundsMatch(b, exMin) || boundsMatch(b, exMax));
    if (job.salaryIsEstimated || anchored) {
      const normalizedMin = extracted.min != null ? Math.round(annualize(extracted.min, exKey)) : null;
      const normalizedMax = extracted.max != null ? Math.round(annualize(extracted.max, exKey)) : null;
      const data = {
        minSalary: extracted.min ?? null,
        maxSalary: extracted.max ?? null,
        salaryPeriod: extracted.type,
        salaryRange: extracted.raw ?? null,
        normalizedMinSalary: normalizedMin,
        normalizedMaxSalary: normalizedMax,
        displaySalary: formatDisplaySalary(normalizedMin, normalizedMax, extracted.type),
        salaryIsEstimated: false,
      };
      return {
        rule: 'R1',
        before: `${jobSalaryText(job) ?? '(none)'} | raw ${formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod) || '(none)'}`,
        after: `${data.displaySalary} (from description: ${extracted.raw})`,
        data,
      };
    }
    return null; // description disagrees with no anchor: operator call
  }

  // ── R2: hourly period carrying annual-sized values ──
  if (
    periodKey === 'hourly' &&
    job.minSalary != null &&
    job.minSalary > 500
  ) {
    const restoredMin = Math.round(job.minSalary / 2080);
    const restoredMax = job.maxSalary != null ? Math.round(job.maxSalary / 2080) : null;
    const cleanly =
      Math.abs(restoredMin * 2080 - job.minSalary) <= 0.01 * job.minSalary &&
      (restoredMax == null || job.maxSalary == null ||
        Math.abs(restoredMax * 2080 - job.maxSalary) <= 0.01 * job.maxSalary) &&
      restoredMin >= 20 && restoredMin <= 350;
    if (cleanly) {
      const normalizedMin = job.minSalary;
      const normalizedMax = job.maxSalary;
      const data = {
        minSalary: restoredMin,
        maxSalary: restoredMax,
        normalizedMinSalary: normalizedMin,
        normalizedMaxSalary: normalizedMax,
        displaySalary: formatDisplaySalary(normalizedMin, normalizedMax, 'hourly'),
      };
      return {
        rule: 'R2',
        before: `raw ${formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod) || '(none)'}`,
        after: `raw $${restoredMin}${restoredMax != null ? `-$${restoredMax}` : ''}/hr, display ${data.displaySalary}`,
        data,
      };
    }
  }

  // ── R3: regenerate a display string that drifted from the write path ──
  // Legacy rows may lack normalized values entirely (processSalary wrote a
  // unit-less display string only): derive them from raw + period first.
  const normMin =
    job.normalizedMinSalary ??
    (job.minSalary != null ? Math.round(annualize(job.minSalary, periodKey)) : null);
  const normMax =
    job.normalizedMaxSalary ??
    (job.maxSalary != null ? Math.round(annualize(job.maxSalary, periodKey)) : null);
  // Plausibility band for advertising a derived annual figure: outside it
  // the stored period is probably wrong (e.g. an annual value stored as
  // monthly) and promoting the arithmetic would advertise nonsense.
  const derivedPlausible =
    (normMin == null || (normMin >= 25_000 && normMin <= 400_000)) &&
    (normMax == null || (normMax >= 25_000 && normMax <= 400_000));
  if ((normMin != null || normMax != null) && derivedPlausible) {
    const regenerated = formatDisplaySalary(normMin, normMax, job.salaryPeriod);
    if (regenerated && regenerated !== job.displaySalary) {
      return {
        rule: 'R3',
        before: job.displaySalary ?? '(none)',
        after: regenerated,
        data: {
          displaySalary: regenerated,
          ...(job.normalizedMinSalary == null && normMin != null ? { normalizedMinSalary: normMin } : {}),
          ...(job.normalizedMaxSalary == null && normMax != null ? { normalizedMaxSalary: normMax } : {}),
        },
      };
    }
  }

  return null;
}

async function repairSalaryConsistency() {
  console.log(`SALARY CONSISTENCY REPAIR ${APPLY ? '(APPLY)' : '(dry run)'}\n` + '='.repeat(60));

  const jobs = (await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true, slug: true,
      minSalary: true, maxSalary: true, salaryPeriod: true, salaryRange: true,
      displaySalary: true, normalizedMinSalary: true, normalizedMaxSalary: true,
      salaryIsEstimated: true, description: true,
    },
  })) as SalaryRow[];

  const plans = new Map<string, RepairPlan>();
  const skipped: SalaryRow[] = [];
  const counts: Record<string, number> = { R1: 0, R2: 0, R3: 0 };

  for (const job of jobs) {
    // Touch ONLY rows the read-only audit flags as inconsistent.
    if (!isFlaggedByAudit(job)) continue;

    const plan = planRepair(job);
    if (plan) {
      // A no-op plan (already consistent) is possible for R1 anchors: skip it.
      const changes = Object.entries(plan.data).filter(
        ([k, v]) => (job as unknown as Record<string, unknown>)[k] !== v,
      );
      if (changes.length === 0) continue;
      plans.set(job.id, plan);
      counts[plan.rule]++;
    } else {
      skipped.push(job);
    }
  }

  for (const [id, plan] of plans) {
    const slug = jobs.find((j) => j.id === id)?.slug ?? '';
    console.log(`${plan.rule} ${id}  /jobs/${slug}`);
    console.log(`     before: ${plan.before}`);
    console.log(`     after:  ${plan.after}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Planned: R1 desc-adopt ${counts.R1}, R2 period-restore ${counts.R2}, R3 display-regen ${counts.R3}`);
  console.log(`Left for operator (no safe rule applies): ${skipped.length}`);

  if (APPLY && plans.size > 0) {
    const runId = `${Date.now()}`;
    mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
    const backupPath = join(process.cwd(), 'tmp', `salary-repair-backup-${runId}.json`);
    const backup = jobs
      .filter((j) => plans.has(j.id))
      .map(({ description: _d, ...fields }) => fields);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`\nBackup of ${backup.length} rows written to ${backupPath}`);

    let applied = 0;
    for (const [id, plan] of plans) {
      await prisma.job.update({ where: { id }, data: plan.data });
      applied++;
      if (applied % 50 === 0) console.log(`  applied ${applied}/${plans.size}...`);
    }
    console.log(`Applied ${applied} repairs.`);
  } else if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write.');
  }

  await prisma.$disconnect();
}

repairSalaryConsistency().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
