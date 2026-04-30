/**
 * Why are we rejecting 503 jobs/week with reason='normalizer' even when
 * the title is clearly PMHNP? Pull recent samples and inspect rawData
 * to find which required field is missing.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await prisma.rejectedJob.findMany({
        where: { rejectionReason: { startsWith: 'normalizer' }, createdAt: { gte: week } },
        select: { rawData: true, sourceProvider: true, applyLink: true, externalId: true, rejectionReason: true },
        take: 50,
    });

    console.log(`Found ${rows.length} normalizer rejections (showing all + diagnostics):\n`);

    const missingFields = { title: 0, applyLink: 0, employer: 0, location: 0, description: 0 };

    for (const r of rows) {
        const raw = r.rawData as Record<string, unknown> | null;
        const title = (raw?.title ?? raw?.position ?? '(missing)') as string;
        const employer = (raw?.employer ?? raw?.company ?? raw?.organization ?? '(missing)') as string;
        const apply = r.applyLink ?? (raw?.applyLink ?? raw?.url ?? '(missing)') as string;
        const desc = (raw?.description ?? '') as string;
        const location = (raw?.location ?? raw?.city ?? '(missing)') as string;

        if (title === '(missing)' || !title) missingFields.title++;
        if (!apply || apply === '(missing)') missingFields.applyLink++;
        if (!employer || employer === '(missing)') missingFields.employer++;
        if (!location || location === '(missing)') missingFields.location++;
        if (!desc || desc.length < 50) missingFields.description++;

        console.log(`[${r.sourceProvider}] reason=${r.rejectionReason}`);
        console.log(`  title:    "${(title as string).slice(0, 80)}"`);
        console.log(`  employer: "${(employer as string).slice(0, 50)}"`);
        console.log(`  apply:    ${(apply as string).slice(0, 80)}`);
        console.log(`  location: "${(location as string).slice(0, 50)}"`);
        console.log(`  desc len: ${(desc as string).length}`);
        console.log();
    }

    console.log('Missing-field tally across the sample:');
    console.log(`  title missing:       ${missingFields.title}`);
    console.log(`  applyLink missing:   ${missingFields.applyLink}`);
    console.log(`  employer missing:    ${missingFields.employer}`);
    console.log(`  location missing:    ${missingFields.location}`);
    console.log(`  description < 50ch:  ${missingFields.description}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Investigation failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
