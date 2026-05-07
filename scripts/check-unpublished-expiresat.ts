/**
 * Of the 1,929 jobs unpublished at 10:00 UTC today, what were their
 * `expiresAt` values? If most are NULL or future-dated, that confirms
 * condition B (originalPostedAt < 60d) caught them — meaning condition
 * A alone (the simplified version) WOULDN'T have caught them.
 */
import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');
    // Window of the 10:00 UTC spike
    const start = new Date('2026-05-07T09:55:00Z');
    const end = new Date('2026-05-07T11:00:00Z');

    console.log('\n=== EXPIRESAT DISTRIBUTION OF YESTERDAY\'S 1,929-JOB SPIKE ===\n');

    const buckets = await m.prisma.$queryRawUnsafe<Array<{ bucket: string; n: bigint }>>(`
        SELECT
            CASE
                WHEN expires_at IS NULL THEN 'NULL'
                WHEN expires_at < NOW() THEN 'past (already expired)'
                WHEN expires_at < NOW() + INTERVAL '7 days' THEN '<7d future'
                WHEN expires_at < NOW() + INTERVAL '30 days' THEN '7-30d future'
                WHEN expires_at < NOW() + INTERVAL '60 days' THEN '30-60d future'
                ELSE '>60d future'
            END AS bucket,
            COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = false
          AND updated_at >= $1 AND updated_at < $2
        GROUP BY 1
        ORDER BY n DESC
    `, start, end);

    console.log('expiresAt at time of unpublish:');
    let total = 0;
    for (const b of buckets) {
        const n = Number(b.n);
        total += n;
        console.log(`  ${b.bucket.padEnd(28)} ${String(n).padStart(5)}`);
    }
    console.log(`  ${'TOTAL'.padEnd(28)} ${String(total).padStart(5)}`);

    // Same breakdown by source
    console.log('\nBy source × expiresAt status:');
    const bySrc = await m.prisma.$queryRawUnsafe<Array<{ source: string; bucket: string; n: bigint }>>(`
        SELECT
            COALESCE(source_provider, '(none)') AS source,
            CASE
                WHEN expires_at IS NULL THEN 'NULL'
                WHEN expires_at < NOW() THEN 'past'
                ELSE 'future'
            END AS bucket,
            COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = false
          AND updated_at >= $1 AND updated_at < $2
        GROUP BY 1, 2
        ORDER BY 1, n DESC
    `, start, end);
    let curSrc = '';
    for (const r of bySrc) {
        if (r.source !== curSrc) {
            console.log(`\n  ${r.source}:`);
            curSrc = r.source;
        }
        console.log(`    expiresAt ${r.bucket.padEnd(8)} ${String(r.n).padStart(5)}`);
    }

    // Sample 5 with their actual expiresAt values
    console.log('\n--- 5 sample rows from the spike ---');
    const samples = await m.prisma.job.findMany({
        where: {
            isPublished: false,
            updatedAt: { gte: start, lt: end },
        },
        select: {
            title: true, employer: true, sourceProvider: true,
            originalPostedAt: true, expiresAt: true, createdAt: true,
        },
        take: 5,
    });
    for (const s of samples) {
        console.log(`  ${s.sourceProvider}/${s.employer?.slice(0, 25)}  "${s.title?.slice(0, 50)}"`);
        console.log(`    originalPostedAt: ${s.originalPostedAt?.toISOString() ?? 'NULL'}`);
        console.log(`    expiresAt:        ${s.expiresAt?.toISOString() ?? 'NULL'}`);
        console.log(`    createdAt:        ${s.createdAt.toISOString()}`);
    }

    await m.prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
