/**
 * Quantify expiresAt drift: how many CURRENTLY-PUBLISHED jobs have
 * expiresAt that differs from originalPostedAt + 60d ?
 */
import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');
    console.log('\n=== EXPIRESAT DRIFT IN CURRENTLY-PUBLISHED CATALOG ===\n');

    // Drift = abs(expiresAt - (originalPostedAt + 60d)) > 1 day
    const total = await m.prisma.job.count({ where: { isPublished: true } });
    const drift = await m.prisma.$queryRawUnsafe<Array<{ bucket: string; n: bigint }>>(`
        SELECT
            CASE
                WHEN original_posted_at IS NULL THEN 'no original_posted_at'
                WHEN expires_at IS NULL THEN 'no expires_at'
                WHEN ABS(EXTRACT(EPOCH FROM (expires_at - (original_posted_at + INTERVAL '60 days')))) <= 86400
                  THEN 'within 1 day of expected (correct)'
                WHEN expires_at > original_posted_at + INTERVAL '60 days'
                  THEN 'extended beyond +60d (drift)'
                ELSE 'shorter than +60d'
            END AS bucket,
            COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = true
        GROUP BY 1
        ORDER BY n DESC
    `);
    console.log(`Published total: ${total}`);
    for (const r of drift) {
        console.log(`  ${r.bucket.padEnd(40)} ${String(r.n).padStart(5)}`);
    }

    // Most common expiresAt values among drifted ones (catches bulk migrations)
    console.log('\nTop 5 most common expiresAt values among published rows:');
    const top = await m.prisma.$queryRawUnsafe<Array<{ expires_at: Date; n: bigint }>>(`
        SELECT expires_at, COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = true AND expires_at IS NOT NULL
        GROUP BY expires_at
        ORDER BY n DESC
        LIMIT 5
    `);
    for (const r of top) {
        console.log(`  ${r.expires_at.toISOString()}  ${String(r.n).padStart(5)}`);
    }

    await m.prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
