/**
 * Migration Script: Move rejected stale-filtered jobs into the jobs table
 * 
 * Usage: npx tsx scripts/migrate-rejected-jobs.ts
 */

// MUST set env BEFORE any imports that trigger Prisma initialization.
// With ES imports, all imports are hoisted, so we use require() for dotenv
// and set DATABASE_URL synchronously before Prisma touches it.
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' }); // fallback for DATABASE_URL

// Override DATABASE_URL with prod for this session
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { normalizeJob } from '../lib/job-normalizer';
import { isRelevantJob } from '../lib/utils/job-filter';
import { computeQualityScore } from '../lib/utils/quality-score';

// Create our own Prisma client pointing at prod
const pool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function isDuplicate(externalId: string | undefined, sourceProvider: string, title: string, employer: string, applyLink: string): Promise<boolean> {
    if (externalId) {
        const existing = await prisma.job.findFirst({
            where: { externalId, sourceProvider },
            select: { id: true },
        });
        if (existing) return true;
    }

    const titleMatch = await prisma.job.findFirst({
        where: { title, employer },
        select: { id: true },
    });
    if (titleMatch) return true;

    if (applyLink) {
        try {
            const pathname = new URL(applyLink).pathname.slice(0, 60);
            const urlMatch = await prisma.job.findFirst({
                where: { applyLink: { contains: pathname } },
                select: { id: true },
            });
            if (urlMatch) return true;
        } catch { /* malformed URL */ }
    }

    return false;
}

async function main() {
    console.log('=== Migrating Rejected Jobs to Jobs Table ===\n');

    const rejected = await prisma.rejectedJob.findMany({
        where: { rejectionReason: 'normalizer' },
        orderBy: { createdAt: 'desc' },
    });

    console.log(`Found ${rejected.length} rejected jobs to process\n`);

    let migrated = 0;
    let duplicates = 0;
    let stillRejected = 0;
    let irrelevant = 0;
    let errors = 0;
    const migratedIds: string[] = [];

    for (const rj of rejected) {
        try {
            const rawData = rj.rawData as Record<string, unknown>;
            if (!rawData) { stillRejected++; continue; }

            const normalized = normalizeJob(rawData, rj.sourceProvider);
            if (!normalized) {
                stillRejected++;
                continue;
            }

            if (!isRelevantJob(normalized.title, normalized.description)) {
                irrelevant++;
                continue;
            }

            const dup = await isDuplicate(
                normalized.externalId,
                normalized.sourceProvider,
                normalized.title,
                normalized.employer,
                normalized.applyLink
            );
            if (dup) {
                duplicates++;
                continue;
            }

            const qualityScore = computeQualityScore({
                applyLink: normalized.applyLink,
                displaySalary: normalized.displaySalary,
                normalizedMinSalary: normalized.normalizedMinSalary,
                normalizedMaxSalary: normalized.normalizedMaxSalary,
                descriptionSummary: normalized.descriptionSummary,
                description: normalized.description,
                city: normalized.city,
                state: normalized.state,
            });

            const savedJob = await prisma.job.create({
                data: {
                    ...normalized,
                    qualityScore,
                } as any,
            });

            const slug = `${normalized.title
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim()}-${savedJob.id}`;

            await prisma.job.update({
                where: { id: savedJob.id },
                data: { slug },
            });

            migrated++;
            migratedIds.push(rj.id);
            console.log(`  ✅ [${rj.sourceProvider}] "${normalized.title}" @ ${normalized.employer}`);

        } catch (error) {
            errors++;
            console.error(`  ❌ Error "${rj.title}":`, (error as Error).message);
        }
    }

    if (migratedIds.length > 0) {
        await prisma.rejectedJob.deleteMany({
            where: { id: { in: migratedIds } },
        });
        console.log(`\nCleaned up ${migratedIds.length} entries from rejected_jobs table`);
    }

    console.log('\n=== Migration Summary ===');
    console.log(`  Processed:      ${rejected.length}`);
    console.log(`  Migrated:       ${migrated}`);
    console.log(`  Duplicates:     ${duplicates}`);
    console.log(`  Still rejected: ${stillRejected}`);
    console.log(`  Irrelevant:     ${irrelevant}`);
    console.log(`  Errors:         ${errors}`);

    await prisma.$disconnect();
    await pool.end();
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
