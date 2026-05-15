/**
 * Shared helper for /_audit-setting-<slug>.ts scripts.
 * Read-only. Builds the same WHERE clause the category page renders,
 * prints total count, a 15-row sample, and surfaces likely false
 * positives via configurable suspicion regexes.
 *
 * Each entry script MUST load dotenv + remap DATABASE_URL before importing
 * this module (top-level static imports are hoisted in ESM, so dotenv has
 * to run first or @/lib/prisma will throw).
 */
import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause } from '@/lib/filters';

export interface AuditSettingOptions {
  slug: string;
  label: string;
  /** Title regexes that strongly suggest the job is NOT this setting. */
  suspectTitle?: RegExp[];
  /** Employer regexes (large telehealth co's, MSO platforms, etc.). */
  suspectEmployer?: RegExp[];
  /** Match isRemote: true as a false positive (inpatient/hospital only). */
  flagRemote?: boolean;
}

export async function runAuditSetting(opts: AuditSettingOptions): Promise<void> {
  const where = buildCategoryWhereClause(opts.slug);
  const totalAll = await prisma.job.count({ where: { isPublished: true } });
  const total = await prisma.job.count({ where });
  const pct = totalAll ? ((total / totalAll) * 100).toFixed(1) : '0.0';

  console.log('='.repeat(78));
  console.log(`SETTING AUDIT: ${opts.label}  (slug = ${opts.slug})`);
  console.log('='.repeat(78));
  console.log(`Total published jobs:    ${totalAll}`);
  console.log(`Matched by filter:       ${total}   (${pct}% of board)`);

  const sample = await prisma.job.findMany({
    where,
    select: {
      id: true, title: true, employer: true, isRemote: true, isHybrid: true,
      city: true, state: true, slug: true,
    },
    orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
    take: 15,
  });

  console.log();
  console.log('-- 15-row sample (best-scored first) --');
  for (const j of sample) {
    const loc = [j.city, j.state].filter(Boolean).join(', ') || '-';
    const remote = j.isRemote ? ' [REMOTE]' : j.isHybrid ? ' [HYBRID]' : '';
    console.log(`  - ${j.title}`);
    console.log(`      ${j.employer}  |  ${loc}${remote}`);
  }

  // False-positive sweep: scan a larger slice and flag suspects.
  const SCAN = 500;
  const scan = await prisma.job.findMany({
    where,
    select: { id: true, title: true, employer: true, isRemote: true, isHybrid: true },
    orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
    take: SCAN,
  });

  const suspects: Array<{ title: string; employer: string; reason: string }> = [];
  for (const j of scan) {
    const reasons: string[] = [];
    if (opts.flagRemote && j.isRemote) reasons.push('isRemote=true');
    for (const rx of opts.suspectTitle ?? []) {
      if (rx.test(j.title)) { reasons.push(`title~/${rx.source}/`); break; }
    }
    for (const rx of opts.suspectEmployer ?? []) {
      if (rx.test(j.employer)) { reasons.push(`employer~/${rx.source}/`); break; }
    }
    if (reasons.length) {
      suspects.push({ title: j.title, employer: j.employer, reason: reasons.join(', ') });
    }
  }

  console.log();
  console.log(`-- False-positive sweep (top ${SCAN} rows) --`);
  console.log(`Suspects flagged: ${suspects.length}/${scan.length}` +
    `  (~${((suspects.length / Math.max(scan.length, 1)) * 100).toFixed(0)}%)`);
  for (const s of suspects.slice(0, 20)) {
    console.log(`  ! ${s.title}`);
    console.log(`      ${s.employer}  |  ${s.reason}`);
  }

  await prisma.$disconnect();
}
