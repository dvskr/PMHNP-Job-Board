import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');
    const ts = new Date('2026-05-11T03:16:41.761Z');
    const pubMatch = await m.prisma.job.count({ where: { expiresAt: ts, isPublished: true } });
    const unpubMatch = await m.prisma.job.count({ where: { expiresAt: ts, isPublished: false } });
    console.log('Rows with expiresAt = 2026-05-11T03:16:41.761Z (bulk-migration fingerprint):');
    console.log(`  published:    ${pubMatch}`);
    console.log(`  unpublished:  ${unpubMatch}`);
    console.log(`  TOTAL:        ${pubMatch + unpubMatch}`);
    await m.prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
