import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');
    const total = await m.prisma.employerLead.count();
    const byStatus = await m.prisma.employerLead.groupBy({
        by: ['status'],
        _count: true,
    });
    console.log(`Total EmployerLead rows in PROD: ${total}`);
    for (const s of byStatus) {
        console.log(`  ${s.status.padEnd(20)} ${s._count}`);
    }

    // Recent vs old
    const last24h = await m.prisma.employerLead.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const last7d = await m.prisma.employerLead.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    const last30d = await m.prisma.employerLead.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });
    console.log(`\nCreated in last 24h:  ${last24h}`);
    console.log(`Created in last 7d:   ${last7d}`);
    console.log(`Created in last 30d:  ${last30d}`);

    // Soft-deleted maybe?
    const deletedField = await m.prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'employer_leads' AND column_name LIKE '%delete%'
    `);
    console.log(`\nSoft-delete columns: ${deletedField.map(r => r.column_name).join(', ') || '(none)'}`);
    await m.prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
