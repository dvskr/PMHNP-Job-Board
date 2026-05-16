/**
 * Audit the candidate-qualifies `minYearsExperience` filter.
 *
 * For each candidate YOE in {1, 3, 5, 10}, runs the same Prisma WHERE clause
 * produced by `buildWhereClause({ minYearsExperience: N })` and verifies:
 *   - Match count.
 *   - Every matched job has minYearsExperience <= N OR null.
 *   - Counts split between null-min and explicit-min cohorts.
 *   - Monotonicity: count(1) <= count(3) <= count(5) <= count(10).
 *
 * Run: npx tsx scripts/audit/audit-min-years-filter.ts
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// Mirrors the predicate in lib/filters.ts buildWhereClause:
//   minYearsExperience <= N  OR  minYearsExperience IS NULL
function qualifiesFor(n: number): Prisma.JobWhereInput {
  return {
    isPublished: true,
    OR: [
      { minYearsExperience: { lte: n } },
      { minYearsExperience: null },
    ],
  };
}

interface RowReport {
  candidate: number;
  matched: number;
  nullCount: number;
  explicitCount: number;
  violations: number;
}

async function auditCandidate(candidate: number): Promise<RowReport> {
  const where = qualifiesFor(candidate);

  const matched = await prisma.job.count({ where });
  const nullCount = await prisma.job.count({
    where: { isPublished: true, minYearsExperience: null },
  });
  const explicitCount = await prisma.job.count({
    where: {
      isPublished: true,
      minYearsExperience: { lte: candidate, not: null },
    },
  });

  // Violation check: any matched job whose explicit min > candidate.
  const violations = await prisma.job.count({
    where: {
      AND: [where, { minYearsExperience: { gt: candidate } }],
    },
  });

  return { candidate, matched, nullCount, explicitCount, violations };
}

function fmt(n: number): string {
  return n.toString().padStart(6);
}

async function main() {
  const CANDIDATES = [1, 3, 5, 10];
  const reports: RowReport[] = [];

  console.log('\n=== minYearsExperience filter audit ===\n');

  for (const c of CANDIDATES) {
    const r = await auditCandidate(c);
    reports.push(r);
  }

  // Markdown table
  console.log('| Candidate | Matched | Null min | Explicit <= candidate | Violations (min > candidate) |');
  console.log('|---|---|---|---|---|');
  for (const r of reports) {
    console.log(
      `| ${r.candidate} | ${fmt(r.matched)} | ${fmt(r.nullCount)} | ${fmt(r.explicitCount)} | ${fmt(r.violations)} |`,
    );
  }

  // Monotonicity check: matched(1) <= matched(3) <= matched(5) <= matched(10)
  let monotonic = true;
  for (let i = 1; i < reports.length; i++) {
    if (reports[i].matched < reports[i - 1].matched) {
      monotonic = false;
      break;
    }
  }

  console.log('\n| Check | Result |');
  console.log('|---|---|');
  console.log(`| Monotonicity (count grows with candidate YOE) | ${monotonic ? 'PASS' : 'FAIL'} |`);
  const allClean = reports.every((r) => r.violations === 0);
  console.log(`| Zero violations across all candidates | ${allClean ? 'PASS' : 'FAIL'} |`);

  await prisma.$disconnect();
  process.exit(monotonic && allClean ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
