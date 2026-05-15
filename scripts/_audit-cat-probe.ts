/**
 * Probe: how many jobs match each OR clause for community-health BEFORE
 * exclusions, to understand if the filter is over- or under-tight.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

async function probe(label: string, contains: string) {
    const count = await prisma.job.count({
        where: { isPublished: true, title: { contains, mode: 'insensitive' } },
    });
    const sample = await prisma.job.findMany({
        where: { isPublished: true, title: { contains, mode: 'insensitive' } },
        select: { title: true, employer: true, city: true, state: true },
        take: 10,
        orderBy: { id: 'asc' },
    });
    console.log(`\n[${label}] title contains "${contains}" → ${count}`);
    sample.forEach((j, i) => console.log(`  ${i + 1}. ${j.title} | ${j.employer} | ${[j.city, j.state].filter(Boolean).join(', ')}`));
}

async function main() {
    await probe('community-health.community', 'community');
    await probe('community-health.FQHC', 'FQHC');
    await probe('community-health.public health', 'public health');
    await probe('correctional.forensic', 'forensic');
    await probe('correctional.detention', 'detention');
    await probe('substance-abuse.medication-assisted', 'medication-assisted');
    await probe('substance-abuse.suboxone', 'suboxone');
    await probe('substance-abuse.SUD ', 'SUD ');
    await probe('substance-abuse.dual diagnosis', 'dual diagnosis');
    await probe('child-adolescent.pediatric mental', 'pediatric mental');
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
