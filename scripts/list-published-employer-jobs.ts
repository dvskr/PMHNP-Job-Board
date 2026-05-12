/**
 * List all currently-published employer-submitted jobs from prod with
 * their public URLs — for assembling a social-media post.
 *
 * Read-only. Never writes.
 *
 * Run:
 *   npx tsx scripts/list-published-employer-jobs.ts
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

async function main() {
    // Dynamic import so DATABASE_URL is populated before prisma.ts initializes.
    const { prisma } = await import('@/lib/prisma');

    const now = new Date();

    const rows = await prisma.employerJob.findMany({
        where: {
            paymentStatus: { not: 'pending' },
            job: {
                isPublished: true,
                isManuallyUnpublished: false,
                archivedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
        },
        select: {
            id: true,
            employerName: true,
            pricingTier: true,
            paymentStatus: true,
            createdAt: true,
            job: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    location: true,
                    isFeatured: true,
                    expiresAt: true,
                    createdAt: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    process.stdout.write(`\n=== Published employer jobs (${rows.length}) ===\n\n`);

    for (const r of rows) {
        const j = r.job;
        const url = `${BASE_URL}/jobs/${j.slug ?? j.id}`;
        const tier = `${r.pricingTier}/${r.paymentStatus}`;
        const featured = j.isFeatured ? ' [featured]' : '';
        const exp = j.expiresAt ? ` exp ${j.expiresAt.toISOString().slice(0, 10)}` : '';
        process.stdout.write(`${j.title} — ${r.employerName}${featured}\n`);
        process.stdout.write(`  ${j.location ?? ''}  (${tier}${exp})\n`);
        process.stdout.write(`  ${url}\n\n`);
    }

    process.stdout.write('=== Bare URL list ===\n');
    for (const r of rows) {
        const j = r.job;
        process.stdout.write(`${BASE_URL}/jobs/${j.slug ?? j.id}\n`);
    }
}

main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
});
