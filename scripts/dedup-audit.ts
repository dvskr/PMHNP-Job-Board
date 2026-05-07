import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

async function main() {
  const { prisma } = await import('@/lib/prisma');
  console.log('--- DEDUP ACCURACY AUDIT ---\n');

  const total = await prisma.job.count();
  const totalPublished = await prisma.job.count({ where: { isPublished: true } });
  console.log(`Total Jobs in DB: ${total} (${totalPublished} published)\n`);

  // 1. False negatives: same applyLink, multiple Job rows
  const dupApplyLinks = await prisma.$queryRawUnsafe<Array<{ apply_link: string; n: bigint; sources: string }>>(`
    SELECT apply_link as apply_link, COUNT(*)::bigint as n,
           STRING_AGG(DISTINCT source_provider, ',') as sources
    FROM jobs
    WHERE is_published = true AND apply_link IS NOT NULL AND apply_link != ''
    GROUP BY apply_link
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 20
  `);
  console.log(`FN-1: Same applyLink, multiple Job rows: ${dupApplyLinks.length} groups`);
  if (dupApplyLinks.length > 0) {
    console.log('Top offenders:');
    dupApplyLinks.slice(0, 8).forEach(r => console.log(`  ${r.n}× | ${r.sources} | ${r.apply_link.slice(0, 100)}`));
  }
  console.log();

  // 2. False negatives: same externalId+source, multiple rows
  const dupExternalIds = await prisma.$queryRawUnsafe<Array<{ external_id: string; source_provider: string; n: bigint }>>(`
    SELECT external_id as external_id, source_provider as source_provider, COUNT(*)::bigint as n
    FROM jobs
    WHERE is_published = true AND external_id IS NOT NULL
    GROUP BY external_id, source_provider
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 10
  `);
  console.log(`FN-2: Same externalId+source, multiple rows (should be 0): ${dupExternalIds.length}`);
  if (dupExternalIds.length > 0) {
    dupExternalIds.forEach(r => console.log(`  ${r.n}× ${r.source_provider} ${r.external_id}`));
  }
  console.log();

  // 3. False negatives: same exact title+employer+location across rows
  const fuzzyDups = await prisma.$queryRawUnsafe<Array<{ title: string; employer: string; location: string; n: bigint; sources: string }>>(`
    SELECT
      LOWER(TRIM(title)) as title,
      LOWER(TRIM(employer)) as employer,
      LOWER(TRIM(location)) as location,
      COUNT(*)::bigint as n,
      STRING_AGG(DISTINCT source_provider, ',') as sources
    FROM jobs
    WHERE is_published = true AND title IS NOT NULL AND employer IS NOT NULL
    GROUP BY LOWER(TRIM(title)), LOWER(TRIM(employer)), LOWER(TRIM(location))
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 20
  `);
  console.log(`FN-3: Same exact title+employer+location across rows: ${fuzzyDups.length} groups`);
  if (fuzzyDups.length > 0) {
    console.log('Top offenders:');
    fuzzyDups.slice(0, 8).forEach(r =>
      console.log(`  ${r.n}× | ${r.sources} | ${r.employer.slice(0, 30)} / ${r.title.slice(0, 50)} / ${r.location.slice(0, 25)}`)
    );
  }
  console.log();

  // 4. dup-classified rejection counts (last 7d)
  const recentDupRejections = await prisma.$queryRawUnsafe<Array<{ rejection_reason: string; n: bigint }>>(`
    SELECT rejection_reason, COUNT(*)::bigint as n
    FROM rejected_jobs
    WHERE rejection_reason LIKE 'duplicate_%'
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY rejection_reason
    ORDER BY n DESC
  `);
  console.log(`TP-1: Last-7d duplicate_* rejection counts:`);
  if (recentDupRejections.length === 0) console.log('  (none)');
  recentDupRejections.forEach(r => console.log(`  ${r.rejection_reason}: ${r.n}`));
  console.log();

  // 5. Spot-check fuzzy classifications: are they real?
  const fuzzyDupSample = await prisma.$queryRawUnsafe<Array<{ id: string; title: string; employer: string; location: string; raw_data: any }>>(`
    SELECT id, title, employer, location, raw_data
    FROM rejected_jobs
    WHERE rejection_reason = 'duplicate_fuzzy_title'
      AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 8
  `);
  console.log(`TP-2: Sample fuzzy-classified rejections (verify against matched Job):`);
  if (fuzzyDupSample.length === 0) console.log('  (no fuzzy matches in last 7d)');
  for (const r of fuzzyDupSample) {
    const matched = r.raw_data?.matchedJobId;
    if (matched) {
      const j = await prisma.job.findUnique({ where: { id: matched }, select: { title: true, employer: true, location: true } });
      console.log(`  REJECTED: ${(r.employer ?? '').slice(0, 30)} / ${(r.title ?? '').slice(0, 50)} / ${(r.location ?? '').slice(0, 25)}`);
      console.log(`  MATCHED→  ${j?.employer.slice(0, 30) ?? '(deleted)'} / ${j?.title.slice(0, 50) ?? ''} / ${j?.location.slice(0, 25) ?? ''}`);
      console.log();
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
