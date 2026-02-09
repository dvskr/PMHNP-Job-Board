/**
 * Comprehensive DB Job Quality Audit
 * Checks all published jobs for:
 * 1. Irrelevant titles (non-PMHNP jobs that slipped through)
 * 2. Missing critical fields (title, employer, applyLink)
 * 3. Suspicious salary data
 * 4. Stale jobs (>90 days old)
 * 5. Empty/garbage descriptions
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { isRelevantJob } from '../lib/utils/job-filter';

async function audit() {
    console.log('🔍 COMPREHENSIVE JOB QUALITY AUDIT');
    console.log('===================================\n');

    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
    });

    console.log(`Total Published Jobs: ${jobs.length}\n`);

    let irrelevant = 0;
    let missingFields = 0;
    let shortDescription = 0;
    let staleJobs = 0;
    let suspiciousSalary = 0;
    let noLocation = 0;
    let duplicateApplyLinks = 0;

    const irrelevantList: { id: string; title: string; employer: string; source: string }[] = [];
    const missingFieldList: { id: string; issue: string }[] = [];
    const staleList: { id: string; title: string; age: number }[] = [];
    const applyLinkMap = new Map<string, number>();

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    for (const job of jobs) {
        // 1. Relevance check
        if (!isRelevantJob(job.title, job.description)) {
            irrelevant++;
            irrelevantList.push({
                id: job.id,
                title: job.title,
                employer: job.employer,
                source: job.sourceProvider || 'unknown',
            });
        }

        // 2. Missing fields
        if (!job.title?.trim()) { missingFields++; missingFieldList.push({ id: job.id, issue: 'No title' }); }
        if (!job.employer?.trim()) { missingFields++; missingFieldList.push({ id: job.id, issue: 'No employer' }); }
        if (!job.applyLink?.trim()) { missingFields++; missingFieldList.push({ id: job.id, issue: 'No apply link' }); }

        // 3. Short/garbage description
        if (job.description.length < 50) {
            shortDescription++;
        }

        // 4. No location
        if (!job.location?.trim() || job.location === 'United States') {
            noLocation++;
        }

        // 5. Stale jobs
        const postedAt = job.originalPostedAt || job.createdAt;
        if (postedAt < ninetyDaysAgo) {
            staleJobs++;
            const age = Math.floor((Date.now() - postedAt.getTime()) / (1000 * 60 * 60 * 24));
            staleList.push({ id: job.id, title: job.title, age });
        }

        // 6. Suspicious salary
        const min = job.normalizedMinSalary || 0;
        const max = job.normalizedMaxSalary || 0;
        if ((min > 0 && min < 30000) || (max > 400000)) {
            suspiciousSalary++;
        }

        // 7. Duplicate apply links
        if (job.applyLink) {
            applyLinkMap.set(job.applyLink, (applyLinkMap.get(job.applyLink) || 0) + 1);
        }
    }

    // Count duplicate apply links
    for (const [, count] of applyLinkMap) {
        if (count > 1) duplicateApplyLinks += count;
    }

    // === REPORT ===
    console.log('📊 AUDIT RESULTS');
    console.log('─────────────────────────────');
    console.log(`✅ Total Jobs:             ${jobs.length}`);
    console.log(`❌ Irrelevant Titles:      ${irrelevant}`);
    console.log(`⚠️  Missing Fields:        ${missingFields}`);
    console.log(`📝 Short Description (<50): ${shortDescription}`);
    console.log(`📍 No/Generic Location:    ${noLocation}`);
    console.log(`🕐 Stale (>90 days):       ${staleJobs}`);
    console.log(`💰 Suspicious Salary:      ${suspiciousSalary}`);
    console.log(`🔗 Duplicate Apply Links:  ${duplicateApplyLinks}`);

    // Show irrelevant jobs (first 20)
    if (irrelevantList.length > 0) {
        console.log(`\n\n🚨 IRRELEVANT JOBS (${irrelevantList.length} total, showing first 20):`);
        console.log('─────────────────────────────');
        for (const job of irrelevantList.slice(0, 20)) {
            console.log(`  [${job.source}] "${job.title}" — ${job.employer}`);
        }
        if (irrelevantList.length > 20) {
            console.log(`  ... and ${irrelevantList.length - 20} more`);
        }
    }

    // Show missing fields
    if (missingFieldList.length > 0) {
        console.log(`\n\n⚠️ MISSING FIELDS (${missingFieldList.length}):`);
        for (const item of missingFieldList.slice(0, 10)) {
            console.log(`  ${item.id}: ${item.issue}`);
        }
    }

    // Show stale jobs
    if (staleList.length > 0) {
        console.log(`\n\n🕐 STALE JOBS (${staleList.length} total, showing first 10):`);
        for (const item of staleList.slice(0, 10)) {
            console.log(`  ${item.title} — ${item.age} days old`);
        }
    }

    // Source breakdown
    console.log('\n\n📦 BREAKDOWN BY SOURCE:');
    console.log('─────────────────────────────');
    const sourceMap = new Map<string, { total: number; irrelevant: number }>();
    for (const job of jobs) {
        const src = job.sourceProvider || 'unknown';
        if (!sourceMap.has(src)) sourceMap.set(src, { total: 0, irrelevant: 0 });
        sourceMap.get(src)!.total++;
    }
    for (const job of irrelevantList) {
        if (sourceMap.has(job.source)) sourceMap.get(job.source)!.irrelevant++;
    }
    for (const [source, data] of sourceMap) {
        const pct = data.total > 0 ? ((data.total - data.irrelevant) / data.total * 100).toFixed(1) : '0';
        console.log(`  ${source}: ${data.total} total, ${data.irrelevant} irrelevant (${pct}% clean)`);
    }

    console.log('\n✅ Audit complete.');
    process.exit(0);
}

audit().catch(console.error);
