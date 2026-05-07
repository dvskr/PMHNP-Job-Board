/**
 * Why did 1,434 jsearch jobs disappear yesterday? Check their createdAt
 * cohort to see if they were a one-shot bulk import that all hit 60d
 * expiry on the same day.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    const since36h = new Date(Date.now() - 36 * 60 * 60 * 1000);

    console.log('\n=== JSEARCH UNPUBLISH COHORT ===\n');

    const cohort = await prisma.$queryRawUnsafe<Array<{ created_day: string; n: bigint; expired_n: bigint }>>(`
        SELECT
            TO_CHAR(created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS created_day,
            COUNT(*)::bigint AS n,
            SUM(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 ELSE 0 END)::bigint AS expired_n
        FROM jobs
        WHERE source_provider = 'jsearch' AND is_published = false AND updated_at >= $1
        GROUP BY 1
        ORDER BY 1
    `, since36h);

    console.log('Recently-unpublished jsearch rows by their original createdAt (CT day):');
    console.log('createdAt day    count   expired-now');
    for (const r of cohort) {
        console.log(`  ${r.created_day}   ${String(r.n).padStart(5)}   ${String(r.expired_n).padStart(5)}`);
    }

    // Same question across ALL sources for the bigger picture
    console.log('\n--- ALL recently-unpublished by createdAt cohort ---');
    const all = await prisma.$queryRawUnsafe<Array<{ created_day: string; source: string; n: bigint }>>(`
        SELECT
            TO_CHAR(created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS created_day,
            COALESCE(source_provider, '(none)') AS source,
            COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = false AND updated_at >= $1
        GROUP BY 1, 2
        ORDER BY 1, n DESC
    `, since36h);

    let curDay = '';
    for (const r of all) {
        if (r.created_day !== curDay) {
            console.log(`\n  ${r.created_day}:`);
            curDay = r.created_day;
        }
        console.log(`    ${r.source.padEnd(20)} ${String(r.n).padStart(5)}`);
    }

    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
