/**
 * One-time mining of employer leads from ALL existing job descriptions
 * (published + unpublished). Going-forward, ingestion-service.ts hooks
 * mineAndPersistFromJob into the post-insert path automatically.
 *
 * Usage:
 *   npx tsx scripts/mine-leads-backfill.ts            # dry run
 *   npx tsx scripts/mine-leads-backfill.ts --execute  # write to DB
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const DRY_RUN = !process.argv.includes('--execute');
const BATCH_SIZE = 500;

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { mineLeadsFromText } = await import('@/lib/lead-mining');
    const { mineAndPersistFromJob } = await import('@/lib/lead-persistence');

    console.log(`\n--- LEAD MINING BACKFILL (${DRY_RUN ? 'DRY RUN' : 'EXECUTING'}) ---\n`);

    const total = await prisma.job.count();
    console.log(`Total jobs in DB: ${total}`);

    let processed = 0;
    let totalEmails = 0;
    let totalPhones = 0;
    let totalWebsites = 0;
    let jobsWithLeads = 0;
    let leadsCreated = 0;
    let leadsUpdated = 0;
    let skipped = 0;

    // Per-source counters (so we know which sources yield best contact info)
    const bySource = new Map<string, { jobs: number; emails: number }>();

    let cursor: string | null = null;
    while (true) {
        const batch: Array<{ id: string; employer: string; description: string | null; sourceProvider: string | null }> =
            await prisma.job.findMany({
                where: cursor ? { id: { gt: cursor } } : {},
                orderBy: { id: 'asc' },
                take: BATCH_SIZE,
                select: { id: true, employer: true, description: true, sourceProvider: true },
            });
        if (batch.length === 0) break;

        for (const job of batch) {
            processed++;
            const mined = mineLeadsFromText(job.description);
            const src = job.sourceProvider ?? '(none)';
            const cur = bySource.get(src) ?? { jobs: 0, emails: 0 };
            cur.jobs++;
            cur.emails += mined.emails.length;
            bySource.set(src, cur);

            if (mined.emails.length === 0 && mined.phones.length === 0 && mined.websites.length === 0) {
                continue;
            }

            jobsWithLeads++;
            totalEmails += mined.emails.length;
            totalPhones += mined.phones.length;
            totalWebsites += mined.websites.length;

            if (!DRY_RUN) {
                const result = await mineAndPersistFromJob({
                    id: job.id,
                    employer: job.employer,
                    description: job.description,
                });
                leadsCreated += result.leadsCreated;
                leadsUpdated += result.leadsUpdated;
                skipped += result.skipped;
            }
        }

        cursor = batch[batch.length - 1].id;
        if (processed % 5000 === 0) {
            console.log(`  ...processed ${processed}/${total} (${jobsWithLeads} with leads, ${totalEmails} emails)`);
        }
    }

    console.log('\n=== Mining summary ===');
    console.log(`Processed:                 ${processed}`);
    console.log(`Jobs yielding ≥1 lead:     ${jobsWithLeads} (${((jobsWithLeads / processed) * 100).toFixed(1)}%)`);
    console.log(`Total emails extracted:    ${totalEmails}`);
    console.log(`Total phones extracted:    ${totalPhones}`);
    console.log(`Total websites extracted:  ${totalWebsites}`);

    console.log('\nPer-source yield (jobs / emails / emails-per-job):');
    const sortedSources = [...bySource.entries()].sort((a, b) => b[1].emails - a[1].emails);
    for (const [src, c] of sortedSources) {
        const ratio = c.jobs > 0 ? (c.emails / c.jobs).toFixed(2) : '0';
        console.log(`  ${src.padEnd(20)} ${String(c.jobs).padStart(6)}  ${String(c.emails).padStart(6)}  ${ratio}/job`);
    }

    if (DRY_RUN) {
        console.log('\nDRY RUN — no DB writes. Re-run with `--execute` to persist.');
    } else {
        console.log('\n=== Persistence summary ===');
        console.log(`Leads created:  ${leadsCreated}`);
        console.log(`Leads updated:  ${leadsUpdated}`);
        console.log(`Skipped:        ${skipped}`);
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
