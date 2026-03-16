/**
 * Migration Script: Move rejected stale-filtered jobs into the jobs table
 * 
 * Usage: npx tsx scripts/migrate-rejected-jobs.js
 */

// 1. Load env FIRST — must happen before any require that triggers lib/prisma.ts
require('dotenv').config({ path: '.env.local' });
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;

if (!process.env.DATABASE_URL) {
    console.error('PROD_DATABASE_URL not found in .env.local');
    process.exit(1);
}

// 2. Now safe to import project modules (lib/prisma.ts will find DATABASE_URL)
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

// Use absolute paths to avoid resolution issues
const { normalizeJob } = require(path.join(projectRoot, 'lib', 'job-normalizer'));
const { isRelevantJob } = require(path.join(projectRoot, 'lib', 'utils', 'job-filter'));
const { computeQualityScore } = require(path.join(projectRoot, 'lib', 'utils', 'quality-score'));

// 3. Create our own Prisma client for the migration
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function isDuplicate(externalId, sourceProvider, title, employer, applyLink) {
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
        } catch (e) { /* malformed URL */ }
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
    const migratedIds = [];

    for (const rj of rejected) {
        try {
            const rawData = rj.rawData;
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
                },
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
            console.error(`  ❌ Error "${rj.title}":`, error.message);
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
