import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');
    const deploy = new Date('2026-05-07T05:01:00Z');
    const slices = await m.prisma.$queryRawUnsafe<Array<{ h: Date; n: bigint }>>(`
        SELECT DATE_TRUNC('hour', updated_at) AS h, COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = false AND updated_at >= $1
        GROUP BY 1 ORDER BY 1
    `, deploy);
    console.log('Unpublishes by hour (UTC) since G1 deploy:');
    for (const s of slices) {
        console.log(`  ${s.h.toISOString()}  ${String(s.n).padStart(5)}`);
    }
    console.log(`\nNow (UTC): ${new Date().toISOString()}`);
    await m.prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
