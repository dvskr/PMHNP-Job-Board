import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');

    // Sum of jobsPosted = total raw email occurrences before dedup
    const sum = await m.prisma.employerLead.aggregate({
        _sum: { jobsPosted: true },
        _count: true,
    });
    console.log(`Unique emails (rows):       ${sum._count}`);
    console.log(`Total raw occurrences:      ${sum._sum.jobsPosted ?? 0}`);
    console.log(`Avg occurrences per email:  ${((sum._sum.jobsPosted ?? 0) / (sum._count || 1)).toFixed(1)}`);

    // Top 10 most-shared contact emails
    const top = await m.prisma.employerLead.findMany({
        select: { companyName: true, contactEmail: true, jobsPosted: true },
        orderBy: { jobsPosted: 'desc' },
        take: 10,
    });
    console.log('\nTop 10 most-shared contacts (these collapsed N postings into 1 row):');
    for (const t of top) {
        console.log(`  ${String(t.jobsPosted).padStart(4)}× ${t.contactEmail.padEnd(40)} ${t.companyName.slice(0, 40)}`);
    }

    await m.prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
