/**
 * Run Fantastic-Jobs-DB API ingestion and dump rejected jobs + duplicates
 * to JSON files for validation.
 *
 * Outputs:
 *   tmp/fantastic-rejected.json   — jobs rejected by relevance filter / normalizer
 *   tmp/fantastic-duplicates.json — jobs detected as duplicates (with matched existing job)
 *   tmp/fantastic-added.json      — newly added jobs this run
 *   tmp/fantastic-summary.json    — high-level stats
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.prod' });
if (!process.env.DATABASE_URL && process.env.PROD_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { fetchFantasticJobsDbJobs } from '../lib/aggregators/fantastic-jobs-db';
import { normalizeJob } from '../lib/job-normalizer';
import { checkDuplicate } from '../lib/deduplicator';
import { isRelevantJob } from '../lib/utils/job-filter';

const OUT_DIR = path.join(process.cwd(), 'tmp');

interface RejectedEntry {
    title: string;
    company: string;
    location: string;
    applyLink: string;
    externalId: string;
    reason: string;
}

interface DuplicateEntry {
    incomingTitle: string;
    incomingCompany: string;
    incomingExternalId: string;
    incomingApplyLink: string;
    matchType: 'externalId' | 'fuzzy';
    existingJobId: string;
    existingTitle?: string;
    existingCompany?: string;
    existingExternalId?: string;
    existingApplyLink?: string;
    existingCreatedAt?: string;
}

interface AddedEntry {
    title: string;
    company: string;
    location: string;
    externalId: string;
    applyLink: string;
    sourceAts: string;
}

async function run() {
    console.log('=== Fantastic-Jobs-DB Validation Run ===\n');
    console.log('This fetches from the API and classifies every job without inserting.\n');

    // 1. Fetch raw jobs from Fantastic API
    const rawJobs = await fetchFantasticJobsDbJobs();
    console.log(`\nFetched ${rawJobs.length} jobs from Fantastic-Jobs-DB API\n`);

    // 2. Load existing jobs for dedup
    console.log('Loading existing jobs from DB for dedup...');
    const existingJobs = await prisma.job.findMany({
        where: { sourceProvider: 'fantastic-jobs-db' },
        select: { id: true, externalId: true, title: true, employer: true, applyLink: true, createdAt: true, originalPostedAt: true },
    });
    const existingByExtId = new Map<string, typeof existingJobs[0]>();
    for (const j of existingJobs) {
        if (j.externalId) existingByExtId.set(j.externalId, j);
    }
    console.log(`Loaded ${existingJobs.length} existing fantastic-jobs-db jobs (${existingByExtId.size} with externalId)\n`);

    // Also load ALL external IDs for cross-source dedup
    const allExistingJobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: { id: true, externalId: true, title: true, employer: true, applyLink: true, sourceProvider: true, createdAt: true },
    });
    const allByExtId = new Map<string, typeof allExistingJobs[0]>();
    for (const j of allExistingJobs) {
        if (j.externalId) allByExtId.set(j.externalId, j);
    }
    console.log(`Loaded ${allExistingJobs.length} total published jobs for cross-source dedup\n`);

    const rejected: RejectedEntry[] = [];
    const duplicates: DuplicateEntry[] = [];
    const added: AddedEntry[] = [];
    let errors = 0;

    for (let i = 0; i < rawJobs.length; i++) {
        const job = rawJobs[i];
        try {
            // --- Relevance check (the aggregator already filters, but double-check) ---
            // The aggregator's isRelevantJob filter already ran inside fetchFantasticJobsDbJobs,
            // so everything returned is already relevant. We simulate the ingestion pipeline check.
            const rawTitle = job.title || '';
            const rawDesc = job.description || '';

            // --- Normalize ---
            const normalized = normalizeJob(job as any, 'fantastic-jobs-db');
            if (!normalized) {
                rejected.push({
                    title: rawTitle,
                    company: job.company,
                    location: job.location,
                    applyLink: job.applyLink,
                    externalId: job.externalId,
                    reason: 'normalizer_rejected',
                });
                continue;
            }

            // --- Check externalId duplicate ---
            const extId = normalized.externalId || job.externalId;
            if (extId && allByExtId.has(extId)) {
                const existing = allByExtId.get(extId)!;
                duplicates.push({
                    incomingTitle: rawTitle,
                    incomingCompany: job.company,
                    incomingExternalId: extId,
                    incomingApplyLink: job.applyLink,
                    matchType: 'externalId',
                    existingJobId: existing.id,
                    existingTitle: existing.title,
                    existingCompany: existing.employer,
                    existingExternalId: existing.externalId || undefined,
                    existingApplyLink: existing.applyLink || undefined,
                    existingCreatedAt: existing.createdAt?.toISOString(),
                });
                continue;
            }

            // --- Fuzzy duplicate check ---
            const dupCheck = await checkDuplicate({
                title: normalized.title,
                employer: normalized.employer,
                location: normalized.location,
                externalId: normalized.externalId ?? undefined,
                sourceProvider: normalized.sourceProvider ?? undefined,
                applyLink: normalized.applyLink ?? undefined,
            });

            if (dupCheck.isDuplicate) {
                let existingInfo: any = {};
                if (dupCheck.matchedJobId) {
                    const matched = await prisma.job.findUnique({
                        where: { id: dupCheck.matchedJobId },
                        select: { id: true, title: true, employer: true, externalId: true, applyLink: true, createdAt: true, sourceProvider: true },
                    });
                    if (matched) {
                        existingInfo = {
                            existingJobId: matched.id,
                            existingTitle: matched.title,
                            existingCompany: matched.employer,
                            existingExternalId: matched.externalId,
                            existingApplyLink: matched.applyLink,
                            existingCreatedAt: matched.createdAt?.toISOString(),
                        };
                    }
                }
                duplicates.push({
                    incomingTitle: rawTitle,
                    incomingCompany: job.company,
                    incomingExternalId: extId || '',
                    incomingApplyLink: job.applyLink,
                    matchType: 'fuzzy',
                    existingJobId: dupCheck.matchedJobId || 'unknown',
                    ...existingInfo,
                });
                continue;
            }

            // --- Would be added ---
            added.push({
                title: rawTitle,
                company: job.company,
                location: job.location,
                externalId: extId || '',
                applyLink: job.applyLink,
                sourceAts: job.source_ats || '',
            });

        } catch (err) {
            errors++;
            console.error(`Error processing job ${i}:`, err);
        }

        // Progress log
        if ((i + 1) % 50 === 0) {
            console.log(`  Processed ${i + 1}/${rawJobs.length} — ${added.length} new, ${duplicates.length} dup, ${rejected.length} rejected`);
        }
    }

    // Write output files
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const summary = {
        timestamp: new Date().toISOString(),
        totalFetched: rawJobs.length,
        wouldBeAdded: added.length,
        duplicates: duplicates.length,
        duplicatesByExternalId: duplicates.filter(d => d.matchType === 'externalId').length,
        duplicatesByFuzzy: duplicates.filter(d => d.matchType === 'fuzzy').length,
        rejected: rejected.length,
        errors,
        existingFantasticJobs: existingJobs.length,
    };

    fs.writeFileSync(path.join(OUT_DIR, 'fantastic-rejected.json'), JSON.stringify(rejected, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'fantastic-duplicates.json'), JSON.stringify(duplicates, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'fantastic-added.json'), JSON.stringify(added, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'fantastic-summary.json'), JSON.stringify(summary, null, 2));

    console.log('\n========================================');
    console.log('  FANTASTIC-JOBS-DB VALIDATION SUMMARY');
    console.log('========================================');
    console.log(`  Total fetched from API:    ${rawJobs.length}`);
    console.log(`  Would be added (new):      ${added.length}`);
    console.log(`  Duplicates (total):        ${duplicates.length}`);
    console.log(`    ├─ By externalId:        ${summary.duplicatesByExternalId}`);
    console.log(`    └─ By fuzzy match:       ${summary.duplicatesByFuzzy}`);
    console.log(`  Rejected:                  ${rejected.length}`);
    console.log(`  Errors:                    ${errors}`);
    console.log(`  Existing in DB:            ${existingJobs.length}`);
    console.log('');
    console.log('  Output files:');
    console.log('    tmp/fantastic-rejected.json');
    console.log('    tmp/fantastic-duplicates.json');
    console.log('    tmp/fantastic-added.json');
    console.log('    tmp/fantastic-summary.json');
    console.log('========================================\n');

    // Show sample duplicates
    if (duplicates.length > 0) {
        console.log('--- SAMPLE DUPLICATES (first 10) ---');
        for (const d of duplicates.slice(0, 10)) {
            console.log(`  [${d.matchType.toUpperCase()}] "${d.incomingTitle}" @ ${d.incomingCompany}`);
            console.log(`    Incoming extId: ${d.incomingExternalId}`);
            console.log(`    Matched:  "${d.existingTitle}" (${d.existingJobId})`);
            console.log(`    Existing extId: ${d.existingExternalId || 'N/A'}`);
            console.log(`    Existing apply: ${d.existingApplyLink?.substring(0, 80) || 'N/A'}`);
            console.log('');
        }
    }

    // Show sample rejected
    if (rejected.length > 0) {
        console.log('--- SAMPLE REJECTED (first 10) ---');
        for (const r of rejected.slice(0, 10)) {
            console.log(`  [${r.reason}] "${r.title}" @ ${r.company}`);
            console.log(`    Link: ${r.applyLink?.substring(0, 80) || 'N/A'}`);
            console.log('');
        }
    }

    await prisma.$disconnect();
}

run().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
