/**
 * C1 fix — backfill `embedding.refresh.job` for every currently-published
 * job. The handler at `lib/inngest/functions/embeddings.ts` already
 * skips jobs that aren't published, so dispatching the event is the
 * only thing missing — once Inngest is configured (INNGEST_EVENT_KEY +
 * INNGEST_SIGNING_KEY in env), every dispatched event produces a
 * vector in `job_embeddings`.
 *
 * Idempotent: re-running re-throttles each job through the 30s window
 * but does not produce duplicate rows (the handler uses upsert).
 *
 * Usage:
 *   DATABASE_URL=$(grep ^PROD_DATABASE_URL= .env.prod | cut -d= -f2-) \
 *     INNGEST_EVENT_KEY=<...> INNGEST_SIGNING_KEY=<...> \
 *     npx tsx scripts/backfill-job-embeddings.ts
 *
 * Without INNGEST_EVENT_KEY, this still walks the catalog and logs how
 * many events would fire — useful as a dry-run / counter.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
import { prisma } from '@/lib/prisma';
import { inngest } from '@/lib/inngest/client';

const BATCH_SIZE = 50;
const BATCH_GAP_MS = 1000;

async function main(): Promise<void> {
    const published = await prisma.job.findMany({
        where: { isPublished: true },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
    });
    console.log(`Backfilling ${published.length} published-job embeddings...`);
    if (!process.env.INNGEST_EVENT_KEY) {
        console.warn('INNGEST_EVENT_KEY not set — inngest.send() will no-op. This run is effectively a counter.');
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < published.length; i += BATCH_SIZE) {
        const batch = published.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map((j) =>
                inngest.send({
                    name: 'embedding.refresh.job',
                    data: { jobId: j.id },
                }),
            ),
        );
        for (const r of results) {
            if (r.status === 'fulfilled') sent++;
            else failed++;
        }
        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, published.length)} / ${published.length} (sent=${sent}, failed=${failed})`);
        if (i + BATCH_SIZE < published.length) {
            await new Promise((resolve) => setTimeout(resolve, BATCH_GAP_MS));
        }
    }

    console.log(`Done. Sent: ${sent}, failed: ${failed}.`);
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Backfill crashed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
