/**
 * Investigate the 8 published jobs with NULL applyLink. Read-only.
 *
 * Shows: id, slug, title, employer, sourceProvider, createdAt,
 * isManuallyPosted/isEmployerPosted, raw rawData if available.
 *
 * Run via run-prod-audit.ps1 style env-load, or:
 *   DATABASE_URL=$(grep ^PROD_DATABASE_URL= .env.prod | cut -d= -f2-) \
 *     npx tsx scripts/audit-null-apply-link.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    const rows = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [{ applyLink: null }, { applyLink: '' }],
        },
        select: {
            id: true,
            slug: true,
            title: true,
            employer: true,
            sourceProvider: true,
            externalId: true,
            applyLink: true,
            createdAt: true,
            isManuallyUnpublished: true,
        },
    });

    console.log(`Found ${rows.length} published jobs with NULL/empty applyLink:\n`);
    for (const r of rows) {
        console.log('────────────────────────────────────────────────────────');
        console.log(`id:                ${r.id}`);
        console.log(`slug:              ${r.slug}`);
        console.log(`title:             ${r.title}`);
        console.log(`employer:          ${r.employer}`);
        console.log(`sourceProvider:    ${r.sourceProvider ?? '(null)'}`);
        console.log(`externalId:        ${r.externalId ?? '(null)'}`);
        console.log(`applyLink (raw):   ${r.applyLink === null ? 'NULL' : `"${r.applyLink}"`}`);
        console.log(`createdAt:         ${r.createdAt.toISOString()}`);
        console.log(`unpublished?:      ${r.isManuallyUnpublished}`);
        // Check employer-posted relation (employer_jobs)
        const ej = await prisma.employerJob.findUnique({
            where: { jobId: r.id },
            select: { contactEmail: true, userId: true, paymentStatus: true, pricingTier: true },
        });
        if (ej) {
            console.log(`employerJob:       contact=${ej.contactEmail ?? '-'} user=${ej.userId ?? '-'} payment=${ej.paymentStatus ?? '-'} tier=${ej.pricingTier ?? '-'}`);
        } else {
            console.log(`employerJob:       (no relation — aggregated source)`);
        }
        console.log();
    }
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
