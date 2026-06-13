/**
 * One-time cleanup: unpublish non-PMHNP jobs (2026-06 audit).
 *
 * Targets the UNION of:
 *   A) jobs the live query already hides — they match GLOBAL_EXCLUSIONS
 *      (pure physicians, off-specialty NPs, bare dual-role "NP or PA"), and
 *   B) jobs the tightened ingest gate (classifyRelevance) would reject.
 *
 * Unpublishing (vs. just hiding from listings) makes the detail pages return
 * 410 Gone and drops the URLs from the sitemap, so Google de-indexes them.
 *
 * HARD SAFETY: only aggregated jobs (employerJobs == null) are ever touched —
 * an employer-posted job is NEVER auto-unpublished. Sets isManuallyUnpublished
 * so re-ingestion won't republish, in addition to the gate now rejecting them.
 * Reversible: re-publish flips isPublished back.
 *
 * Dry-run by default. Usage:
 *   npx tsx scripts/unpublish-non-pmhnp.ts            # dry-run (counts + sample)
 *   npx tsx scripts/unpublish-non-pmhnp.ts --apply    # execute
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const APPLY = process.argv.includes('--apply');

async function main() {
  const { prisma } = await import('@/lib/prisma');
  const { GLOBAL_EXCLUSIONS } = await import('@/lib/filters');
  const { classifyRelevance } = await import('@/lib/utils/job-filter');

  console.log(`[unpublish-non-pmhnp] apply=${APPLY}  DB=${(process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':***@').slice(0, 55)}...`);

  // Safety: only aggregated jobs — never an employer-posted row.
  const aggregatedOnly = { employerJobs: { is: null } } as const;

  // Set A — matches GLOBAL_EXCLUSIONS (what the live query already hides).
  const setA = await prisma.job.findMany({
    where: { isPublished: true, ...aggregatedOnly, OR: GLOBAL_EXCLUSIONS },
    select: { id: true },
  });
  const idsA = new Set(setA.map((j) => j.id));

  // Set B — the tightened ingest gate would reject (title + description aware).
  const published = await prisma.job.findMany({
    where: { isPublished: true, ...aggregatedOnly },
    select: { id: true, title: true, description: true, employer: true },
  });
  const idsB = new Set<string>();
  for (const j of published) {
    if (!classifyRelevance(j.title, j.description ?? '', j.employer).passes) idsB.add(j.id);
  }

  const union = new Set<string>([...idsA, ...idsB]);
  const overlap = [...idsA].filter((id) => idsB.has(id)).length;

  console.log(`\npublished aggregated jobs scanned: ${published.length}`);
  console.log(`  A) GLOBAL_EXCLUSIONS match:      ${idsA.size}`);
  console.log(`  B) ingest gate would reject:     ${idsB.size}`);
  console.log(`  overlap (A∩B):                   ${overlap}`);
  console.log(`  UNION to unpublish:              ${union.size}`);

  // Sample for eyeballing.
  const sampleRows = await prisma.job.findMany({
    where: { id: { in: [...union].slice(0, 30) } },
    select: { title: true, employer: true, sourceType: true, slug: true, id: true },
  });
  console.log(`\nsample (first ${sampleRows.length}):`);
  for (const r of sampleRows) {
    console.log(`  • ${r.title}  ·  ${r.employer}  ·  [${r.sourceType ?? '?'}]  ·  /jobs/${r.slug ?? r.id}`);
  }

  if (!APPLY) {
    console.log('\n[dry-run] nothing written. Re-run with --apply to unpublish.');
    await prisma.$disconnect();
    return;
  }

  const ids = [...union];
  let updated = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const r = await prisma.job.updateMany({
      where: { id: { in: batch } },
      data: {
        isPublished: false,
        isManuallyUnpublished: true,
        unpublishReason: 'non_pmhnp_cleanup',
        unpublishedAt: new Date(),
      },
    });
    updated += r.count;
    console.log(`  …unpublished ${updated}/${ids.length}`);
  }
  console.log(`\n[apply] done. unpublished ${updated} non-PMHNP aggregated jobs.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error('[unpublish-non-pmhnp] fatal', e); process.exit(1); });
