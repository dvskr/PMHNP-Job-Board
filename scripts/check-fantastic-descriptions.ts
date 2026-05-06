/**
 * Sample 5 published fantastic-jobs-db rows and dump their description
 * length + first 200 chars. Identifies whether descriptions are empty
 * vs populated (and how truncated they are).
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    const rows = await prisma.job.findMany({
        where: { sourceProvider: 'fantastic-jobs-db', isPublished: true },
        select: { id: true, title: true, employer: true, description: true, descriptionSummary: true, slug: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
    });

    console.log(`\n--- ${rows.length} most-recent published fantastic-jobs-db rows ---\n`);

    for (const r of rows) {
        const dlen = r.description?.length ?? 0;
        const slen = r.descriptionSummary?.length ?? 0;
        console.log(`${r.title.slice(0, 60)} (${r.employer})`);
        console.log(`  slug:        ${r.slug?.slice(0, 60)}`);
        console.log(`  desc length: ${dlen} chars`);
        console.log(`  summary len: ${slen} chars`);
        if (r.description && dlen > 0) {
            console.log(`  desc head:   ${r.description.slice(0, 250).replace(/\s+/g, ' ').trim()}...`);
        } else {
            console.log(`  desc head:   (EMPTY)`);
        }
        console.log();
    }

    // Aggregate: what % of fantastic-jobs-db rows have empty descriptions?
    const stats = await prisma.$queryRawUnsafe<Array<{ total: bigint; empty: bigint; under_100: bigint }>>(`
    SELECT
      COUNT(*)::bigint as total,
      SUM(CASE WHEN description IS NULL OR description = '' THEN 1 ELSE 0 END)::bigint as empty,
      SUM(CASE WHEN COALESCE(LENGTH(description), 0) < 100 THEN 1 ELSE 0 END)::bigint as under_100
    FROM jobs
    WHERE source_provider = 'fantastic-jobs-db' AND is_published = true
  `);
    const s = stats[0]!;
    console.log(`\n--- AGGREGATE (published fantastic-jobs-db rows) ---`);
    console.log(`Total:          ${s.total}`);
    console.log(`Empty desc:     ${s.empty}`);
    console.log(`Desc < 100 ch:  ${s.under_100}`);

    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
