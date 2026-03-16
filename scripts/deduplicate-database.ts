import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/prisma';
import { writeFileSync } from 'fs';

async function main() {
    console.log('🔍 Starting database deduplication...\n');

    // Fetch all jobs
    const allJobs = await prisma.job.findMany({
        orderBy: { createdAt: 'desc' },
    });

    console.log(`📊 Total jobs in database: ${allJobs.length}\n`);

    let totalDeleted = 0;
    const jobsToDelete: string[] = [];

    // ===== PASS 1: Apply Link Dedup =====
    console.log('--- PASS 1: Exact Apply Link Match ---');
    const urlGroups = new Map<string, typeof allJobs>();

    for (const job of allJobs) {
        if (!job.applyLink) continue;
        const normalizedUrl = normalizeUrl(job.applyLink);
        if (!urlGroups.has(normalizedUrl)) {
            urlGroups.set(normalizedUrl, []);
        }
        urlGroups.get(normalizedUrl)!.push(job);
    }

    let pass1Dupes = 0;
    for (const [url, group] of urlGroups) {
        if (group.length <= 1) continue;

        // Sort by score descending, then by createdAt descending
        group.sort((a, b) => {
            const scoreDiff = scoreJob(b) - scoreJob(a);
            if (scoreDiff !== 0) return scoreDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        // Keep first (best), mark rest for deletion
        for (let i = 1; i < group.length; i++) {
            jobsToDelete.push(group[i].id);
            pass1Dupes++;
        }
    }
    console.log(`  Found ${pass1Dupes} duplicates by apply link\n`);

    // ===== PASS 2: Exact Title + Employer Match =====
    console.log('--- PASS 2: Exact Title + Employer Match ---');
    // Exclude already-marked jobs
    const remainingJobs = allJobs.filter(j => !jobsToDelete.includes(j.id));

    const titleEmployerGroups = new Map<string, typeof allJobs>();

    for (const job of remainingJobs) {
        const key = `${normalizeText(job.title)}|||${normalizeText(job.employer)}`;
        if (!titleEmployerGroups.has(key)) {
            titleEmployerGroups.set(key, []);
        }
        titleEmployerGroups.get(key)!.push(job);
    }

    let pass2Dupes = 0;
    for (const [key, group] of titleEmployerGroups) {
        if (group.length <= 1) continue;

        // Additional check: same state or both remote
        // Group by state/remote
        const subGroups = new Map<string, typeof allJobs>();
        for (const job of group) {
            const locKey = job.state || (job.mode === 'remote' ? 'REMOTE' : 'UNKNOWN');
            if (!subGroups.has(locKey)) {
                subGroups.set(locKey, []);
            }
            subGroups.get(locKey)!.push(job);
        }

        for (const [, subGroup] of subGroups) {
            if (subGroup.length <= 1) continue;

            subGroup.sort((a, b) => {
                const scoreDiff = scoreJob(b) - scoreJob(a);
                if (scoreDiff !== 0) return scoreDiff;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            for (let i = 1; i < subGroup.length; i++) {
                jobsToDelete.push(subGroup[i].id);
                pass2Dupes++;
            }
        }
    }
    console.log(`  Found ${pass2Dupes} duplicates by title+employer\n`);

    // ===== PASS 3: Fuzzy Match (LOG ONLY) =====
    console.log('--- PASS 3: Fuzzy Match (review file only) ---');
    const stillRemaining = allJobs.filter(j => !jobsToDelete.includes(j.id));
    const fuzzyMatches: Array<{
        id1: string; title1: string; employer1: string; source1: string;
        id2: string; title2: string; employer2: string; source2: string;
        similarity: number;
    }> = [];

    // Only compare jobs with same state (to keep it manageable)
    const byState = new Map<string, typeof allJobs>();
    for (const job of stillRemaining) {
        const state = job.state || job.mode || 'unknown'; // Note: job.workMode replaced with job.mode as per schema
        if (!byState.has(state)) byState.set(state, []);
        byState.get(state)!.push(job);
    }

    for (const [, stateJobs] of byState) {
        for (let i = 0; i < stateJobs.length; i++) {
            for (let j = i + 1; j < stateJobs.length; j++) {
                const a = stateJobs[i];
                const b = stateJobs[j];

                const empSimilar = areEmployersSimilar(a.employer, b.employer);
                if (!empSimilar) continue;

                const titleSim = wordOverlapSimilarity(a.title, b.title);
                if (titleSim < 0.8) continue;

                fuzzyMatches.push({
                    id1: a.id, title1: a.title, employer1: a.employer, source1: a.sourceProvider || '',
                    id2: b.id, title2: b.title, employer2: b.employer, source2: b.sourceProvider || '',
                    similarity: titleSim,
                });
            }
        }
    }

    if (fuzzyMatches.length > 0) {
        const csvHeader = 'id1,title1,employer1,source1,id2,title2,employer2,source2,similarity\n';
        const csvRows = fuzzyMatches.map(m =>
            `"${m.id1}","${m.title1}","${m.employer1}","${m.source1}","${m.id2}","${m.title2}","${m.employer2}","${m.source2}",${m.similarity.toFixed(3)}`
        ).join('\n');
        writeFileSync('duplicates-review.csv', csvHeader + csvRows);
        console.log(`  Found ${fuzzyMatches.length} potential fuzzy duplicates → saved to duplicates-review.csv\n`);
    } else {
        console.log('  No fuzzy duplicates found\n');
    }

    // ===== EXECUTE DELETIONS =====
    totalDeleted = jobsToDelete.length;
    console.log(`\n🗑️  Total duplicates to delete: ${totalDeleted}`);
    console.log(`📊 Jobs remaining after cleanup: ${allJobs.length - totalDeleted}`);

    if (totalDeleted === 0) {
        console.log('\n✅ No duplicates found! Database is clean.');
        await prisma.$disconnect();
        return;
    }

    // Ask for confirmation via command line arg
    const dryRun = !process.argv.includes('--execute');

    if (dryRun) {
        console.log('\n⚠️  DRY RUN — no jobs deleted');
        console.log('Run with --execute flag to actually delete:');
        console.log('  npx tsx scripts/deduplicate-database.ts --execute');

        // Show sample of what would be deleted
        console.log('\nSample duplicates that would be deleted:');
        const sampleIds = jobsToDelete.slice(0, 5);
        for (const id of sampleIds) {
            const job = allJobs.find(j => j.id === id);
            if (job) {
                console.log(`  - [${job.sourceProvider}] "${job.title}" at ${job.employer}`);
            }
        }
        if (jobsToDelete.length > 5) {
            console.log(`  ... and ${jobsToDelete.length - 5} more`);
        }
    } else {
        console.log('\n🚀 Executing deletions...');

        // Delete in batches of 100
        const batchSize = 100;
        for (let i = 0; i < jobsToDelete.length; i += batchSize) {
            const batch = jobsToDelete.slice(i, i + batchSize);
            await prisma.job.deleteMany({
                where: { id: { in: batch } },
            });
            console.log(`  Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(jobsToDelete.length / batchSize)}`);
        }

        console.log(`\n✅ Done! Deleted ${totalDeleted} duplicate jobs.`);
        console.log(`📊 Remaining jobs: ${allJobs.length - totalDeleted}`);
    }

    await prisma.$disconnect();
}

function normalizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        // Remove tracking params
        const stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid', 'from', 'source'];
        stripParams.forEach(p => parsed.searchParams.delete(p));
        // Normalize
        let normalized = parsed.origin + parsed.pathname;
        // Remove trailing slash
        normalized = normalized.replace(/\/+$/, '');
        // Lowercase
        normalized = normalized.toLowerCase();
        // Remove www
        normalized = normalized.replace('://www.', '://');
        // Add remaining search params back (sorted)
        parsed.searchParams.sort();
        const remainingParams = parsed.searchParams.toString();
        if (remainingParams) {
            normalized += '?' + remainingParams;
        }
        return normalized;
    } catch {
        return url.toLowerCase().trim();
    }
}

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '') // remove special chars
        .replace(/\s+/g, ' ');       // collapse whitespace
}

function scoreJob(job: any): number {
    let score = 0;
    if (job.description && job.description.length > 100) score += 3;
    if (job.description && job.description.length > 500) score += 2;
    if (job.normalizedMinSalary) score += 3;
    if (job.normalizedMaxSalary) score += 2;
    if (job.displaySalary) score += 1;
    if (job.city) score += 2;
    if (job.state) score += 2;
    if (job.mode) score += 1; // Corrected from workMode to mode
    if (job.companyId) score += 2;
    if (job.jobType) score += 1; // Corrected from employmentType to jobType
    // Prefer certain sources (direct ATS > aggregator)
    if (job.sourceProvider === 'greenhouse' || job.sourceProvider === 'lever') score += 3;
    if (job.sourceProvider === 'usajobs') score += 2;
    if (job.sourceProvider === 'jsearch') score += 1;
    return score;
}

// Helper: check if two employer names are similar
function areEmployersSimilar(a: string, b: string): boolean {
    const na = normalizeText(a);
    const nb = normalizeText(b);

    // Exact match after normalization
    if (na === nb) return true;

    // One contains the other (e.g. "Spring Health" vs "Spring Health Inc")
    if (na.includes(nb) || nb.includes(na)) return true;

    // Levenshtein distance < 3
    if (levenshtein(na, nb) <= 3) return true;

    return false;
}

// Helper: word overlap similarity (0-1)
function wordOverlapSimilarity(a: string, b: string): number {
    const wordsA = new Set(normalizeText(a).split(' ').filter(w => w.length > 2));
    const wordsB = new Set(normalizeText(b).split(' ').filter(w => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let overlap = 0;
    for (const word of wordsA) {
        if (wordsB.has(word)) overlap++;
    }

    return (2 * overlap) / (wordsA.size + wordsB.size);
}

// Helper: Levenshtein distance
function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

main().catch(console.error);
