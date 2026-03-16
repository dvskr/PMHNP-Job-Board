/**
 * E2E Trace: Fantastic-Jobs-DB Pipeline
 *
 * Traces every single job through the FULL pipeline and records
 * the exact decision at each stage with reasons, confidence scores,
 * and matched data for validation.
 *
 * Outputs: tmp/fantastic-e2e-trace.json
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
import { fetchFantasticJobsDbJobs, FantasticJobOutput } from '../lib/aggregators/fantastic-jobs-db';
import { normalizeJobWithReason } from '../lib/job-normalizer';
import { isRelevantJob } from '../lib/utils/job-filter';

const OUT_DIR = path.join(process.cwd(), 'tmp');

// ── Replicate dedup normalizers exactly from deduplicator.ts ──
function normalizeTitle(title: string): string {
    if (!title) return '';
    let normalized = title.toLowerCase();
    normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
    const commonWords = ['the', 'a', 'an', 'at', 'in', 'for', 'to', 'and', 'or'];
    const words = normalized.split(/\s+/).filter(w => w.length > 0 && !commonWords.includes(w));
    return words.join(' ').trim();
}

function normalizeCompany(company: string): string {
    if (!company) return '';
    let normalized = company.toLowerCase();
    normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
    const suffixes = ['inc', 'llc', 'corp', 'corporation', 'company', 'co', 'ltd'];
    const words = normalized.split(/\s+/).filter(w => w.length > 0 && !suffixes.includes(w));
    return words.join(' ').trim();
}

function normalizeLocation(location: string): string {
    if (!location) return '';
    return location.toLowerCase().replace(/[^a-z0-9\s,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeApplyUrl(url: string): string {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
        trackingParams.forEach(p => urlObj.searchParams.delete(p));
        return urlObj.hostname + urlObj.pathname + urlObj.search;
    } catch {
        return url.toLowerCase().replace(/[?&](utm_source|utm_medium|utm_campaign|ref|source)=[^&]*/g, '');
    }
}

function levenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length, len2 = s2.length;
    const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[len1][len2];
}

function calcSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0;
    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    return maxLength === 0 ? 1.0 : 1 - (distance / maxLength);
}

interface TraceEntry {
    index: number;
    title: string;
    company: string;
    location: string;
    externalId: string;
    applyLink: string;
    sourceAts: string;

    // Stage 1: Aggregator already applied isRelevantJob — all returned jobs pass
    stage1_relevanceFilter: 'PASS';

    // Stage 2: Normalizer
    stage2_normalizer: 'PASS' | 'REJECT';
    stage2_reason?: string;
    stage2_normalizedTitle?: string;
    stage2_normalizedExternalId?: string;

    // Stage 3: ExternalId dedup (in-memory fast check)
    stage3_externalIdDedup: 'NO_MATCH' | 'MATCH' | 'SKIPPED';
    stage3_matchedJobId?: string;
    stage3_matchedSource?: string;
    stage3_matchedExternalId?: string;

    // Stage 4: Dedup Strategy 1 — exact externalId + sourceProvider
    stage4_exactId: 'NO_MATCH' | 'MATCH' | 'SKIPPED';

    // Stage 5: Dedup Strategy 2 — exact normalized title+employer+location
    stage5_exactTitle: 'NO_MATCH' | 'MATCH' | 'SKIPPED';
    stage5_matchedJobId?: string;
    stage5_matchedTitle?: string;
    stage5_matchedEmployer?: string;
    stage5_matchedLocation?: string;
    stage5_normTitle?: string;
    stage5_normEmployer?: string;
    stage5_normLocation?: string;
    stage5_existingNormTitle?: string;
    stage5_existingNormEmployer?: string;
    stage5_existingNormLocation?: string;

    // Stage 6: Dedup Strategy 3 — apply URL match
    stage6_applyUrl: 'NO_MATCH' | 'MATCH' | 'SKIPPED';
    stage6_matchedJobId?: string;
    stage6_matchedApplyLink?: string;
    stage6_normalizedIncoming?: string;
    stage6_normalizedExisting?: string;

    // Stage 7: Dedup Strategy 4 — fuzzy title+employer match
    stage7_fuzzy: 'NO_MATCH' | 'MATCH' | 'SKIPPED';
    stage7_titleSimilarity?: number;
    stage7_employerSimilarity?: number;
    stage7_matchedJobId?: string;
    stage7_matchedTitle?: string;
    stage7_matchedEmployer?: string;

    // Final outcome
    outcome: 'NEW' | 'DUPLICATE' | 'REJECTED';
    outcomeDetail: string;

    // Validation flag
    falsePositive?: boolean;
    falsePositiveReason?: string;
}

async function run() {
    console.log('=== Fantastic-Jobs-DB E2E TRACE ===\n');

    // 1. Fetch from API
    const rawJobs = await fetchFantasticJobsDbJobs();
    console.log(`Fetched ${rawJobs.length} jobs from API\n`);

    // 2. Load ALL existing jobs
    console.log('Loading existing jobs...');
    const allExisting = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true, externalId: true, title: true, employer: true,
            location: true, applyLink: true, sourceProvider: true,
            createdAt: true, originalPostedAt: true,
        },
    });
    const existByExtId = new Map<string, typeof allExisting[0]>();
    for (const j of allExisting) {
        if (j.externalId) existByExtId.set(j.externalId, j);
    }
    console.log(`Loaded ${allExisting.length} published jobs (${existByExtId.size} with externalId)\n`);

    const traces: TraceEntry[] = [];
    let newCount = 0, dupCount = 0, rejCount = 0;
    let falsePositiveCount = 0;

    // Counters by dedup strategy
    let dupByExactId = 0, dupByExactTitle = 0, dupByApplyUrl = 0, dupByFuzzy = 0;
    let dupByExtIdInMemory = 0;

    for (let i = 0; i < rawJobs.length; i++) {
        const job = rawJobs[i];
        const trace: TraceEntry = {
            index: i,
            title: job.title,
            company: job.company,
            location: job.location,
            externalId: job.externalId,
            applyLink: job.applyLink,
            sourceAts: job.source_ats || '',
            stage1_relevanceFilter: 'PASS',
            stage2_normalizer: 'PASS',
            stage3_externalIdDedup: 'NO_MATCH',
            stage4_exactId: 'SKIPPED',
            stage5_exactTitle: 'SKIPPED',
            stage6_applyUrl: 'SKIPPED',
            stage7_fuzzy: 'SKIPPED',
            outcome: 'NEW',
            outcomeDetail: '',
        };

        // ── STAGE 2: Normalizer ──
        const normResult = normalizeJobWithReason(job as any, 'fantastic-jobs-db');
        if (!normResult.job) {
            trace.stage2_normalizer = 'REJECT';
            trace.stage2_reason = normResult.rejectionReason || 'unknown';
            trace.outcome = 'REJECTED';
            trace.outcomeDetail = `Normalizer: ${trace.stage2_reason}`;
            rejCount++;
            traces.push(trace);
            continue;
        }
        trace.stage2_normalizedTitle = normResult.job.title;
        trace.stage2_normalizedExternalId = normResult.job.externalId || '';

        const extId = normResult.job.externalId || job.externalId;
        const normTitle = normalizeTitle(normResult.job.title);
        const normEmployer = normalizeCompany(normResult.job.employer);
        const normLoc = normalizeLocation(normResult.job.location);

        // ── STAGE 3: In-memory externalId check (what ingestion-service does first) ──
        if (extId && existByExtId.has(extId)) {
            const matched = existByExtId.get(extId)!;
            trace.stage3_externalIdDedup = 'MATCH';
            trace.stage3_matchedJobId = matched.id;
            trace.stage3_matchedSource = matched.sourceProvider || '';
            trace.stage3_matchedExternalId = matched.externalId || '';
            trace.outcome = 'DUPLICATE';
            trace.outcomeDetail = `ExternalId in-memory: matched ${matched.id} (${matched.sourceProvider})`;
            dupByExtIdInMemory++;
            dupCount++;
            traces.push(trace);
            continue;
        }

        // ── STAGE 4: Exact externalId + sourceProvider (DB query) ──
        if (extId) {
            trace.stage4_exactId = 'NO_MATCH';
            const exactMatch = await prisma.job.findFirst({
                where: { externalId: extId, sourceProvider: 'fantastic-jobs-db' },
                select: { id: true },
            });
            if (exactMatch) {
                trace.stage4_exactId = 'MATCH';
                trace.outcome = 'DUPLICATE';
                trace.outcomeDetail = `Exact externalId+source: ${exactMatch.id}`;
                dupByExactId++;
                dupCount++;
                traces.push(trace);
                continue;
            }
        }

        // ── STAGE 5: Exact normalized title+employer+location ──
        trace.stage5_exactTitle = 'NO_MATCH';
        trace.stage5_normTitle = normTitle;
        trace.stage5_normEmployer = normEmployer;
        trace.stage5_normLocation = normLoc;

        const titlePrefix = job.title.substring(0, 30);
        const titleMatches = await prisma.job.findMany({
            where: { title: { contains: titlePrefix } },
            select: { id: true, title: true, employer: true, location: true, applyLink: true },
            take: 50,
        });

        let foundExactTitle = false;
        for (const m of titleMatches) {
            const mt = normalizeTitle(m.title);
            const me = normalizeCompany(m.employer);
            const ml = normalizeLocation(m.location);
            if (mt === normTitle && me === normEmployer && ml === normLoc) {
                trace.stage5_exactTitle = 'MATCH';
                trace.stage5_matchedJobId = m.id;
                trace.stage5_matchedTitle = m.title;
                trace.stage5_matchedEmployer = m.employer;
                trace.stage5_matchedLocation = m.location;
                trace.stage5_existingNormTitle = mt;
                trace.stage5_existingNormEmployer = me;
                trace.stage5_existingNormLocation = ml;
                trace.outcome = 'DUPLICATE';
                trace.outcomeDetail = `Exact title+employer+location: "${m.title}" @ ${m.employer} / ${m.location}`;
                dupByExactTitle++;
                dupCount++;
                foundExactTitle = true;
                break;
            }
        }
        if (foundExactTitle) { traces.push(trace); continue; }

        // ── STAGE 6: Apply URL match ──
        trace.stage6_applyUrl = 'NO_MATCH';
        if (job.applyLink) {
            const normUrl = normalizeApplyUrl(job.applyLink);
            trace.stage6_normalizedIncoming = normUrl;

            // Check within title matches
            for (const m of titleMatches) {
                if (m.applyLink) {
                    const mUrl = normalizeApplyUrl(m.applyLink);
                    if (normUrl === mUrl) {
                        trace.stage6_applyUrl = 'MATCH';
                        trace.stage6_matchedJobId = m.id;
                        trace.stage6_matchedApplyLink = m.applyLink;
                        trace.stage6_normalizedExisting = mUrl;
                        trace.outcome = 'DUPLICATE';
                        trace.outcomeDetail = `Apply URL (within title matches): ${m.applyLink?.substring(0, 80)}`;
                        dupByApplyUrl++;
                        dupCount++;
                        break;
                    }
                }
            }
            if (trace.stage6_applyUrl === 'MATCH') { traces.push(trace); continue; }

            // Global URL check
            try {
                const urlPathname = new URL(job.applyLink).pathname.slice(0, 60);
                const globalMatch = await prisma.job.findFirst({
                    where: { applyLink: { contains: urlPathname } },
                    select: { id: true, applyLink: true, title: true, employer: true },
                });
                if (globalMatch && globalMatch.applyLink) {
                    const gUrl = normalizeApplyUrl(globalMatch.applyLink);
                    if (normUrl === gUrl) {
                        trace.stage6_applyUrl = 'MATCH';
                        trace.stage6_matchedJobId = globalMatch.id;
                        trace.stage6_matchedApplyLink = globalMatch.applyLink;
                        trace.stage6_normalizedExisting = gUrl;
                        trace.outcome = 'DUPLICATE';
                        trace.outcomeDetail = `Apply URL (global): ${globalMatch.title} @ ${globalMatch.employer}`;
                        dupByApplyUrl++;
                        dupCount++;
                        traces.push(trace);
                        continue;
                    }
                }
            } catch { /* malformed URL */ }
        }

        // ── STAGE 7: Fuzzy title+employer match ──
        trace.stage7_fuzzy = 'NO_MATCH';
        const employerPrefix = job.company.substring(0, 10);
        const titlePrefix5 = job.title.substring(0, 15);
        const fuzzyMatches = await prisma.job.findMany({
            where: {
                AND: [
                    { employer: { contains: employerPrefix } },
                    { title: { contains: titlePrefix5 } },
                ],
            },
            select: { id: true, title: true, employer: true, location: true, applyLink: true },
            take: 20,
        });

        for (const m of fuzzyMatches) {
            const titleSim = calcSimilarity(normTitle, normalizeTitle(m.title));
            const empSim = calcSimilarity(normEmployer, normalizeCompany(m.employer));

            if (titleSim > 0.85 && empSim > 0.80) {
                trace.stage7_fuzzy = 'MATCH';
                trace.stage7_titleSimilarity = Math.round(titleSim * 1000) / 1000;
                trace.stage7_employerSimilarity = Math.round(empSim * 1000) / 1000;
                trace.stage7_matchedJobId = m.id;
                trace.stage7_matchedTitle = m.title;
                trace.stage7_matchedEmployer = m.employer;

                // ── FALSE POSITIVE DETECTION ──
                const incomingLoc = normLoc;
                const matchedLoc = normalizeLocation(m.location);
                const locSim = calcSimilarity(incomingLoc, matchedLoc);

                // Different apply links pointing to different ATS job IDs = likely different jobs
                const incomingUrl = normalizeApplyUrl(job.applyLink);
                const matchedUrl = m.applyLink ? normalizeApplyUrl(m.applyLink) : '';
                const urlsMatch = incomingUrl === matchedUrl;

                // Check if locations are significantly different
                if (locSim < 0.5 && !urlsMatch) {
                    trace.falsePositive = true;
                    trace.falsePositiveReason = `Location mismatch (sim=${locSim.toFixed(2)}): incoming="${job.location}" vs matched="${m.location}" + different apply URLs`;
                    falsePositiveCount++;
                }

                // Check for many-to-one mapping (LifeStance pattern)
                // Same company, same normalized title, but different lever/ATS job IDs
                if (!urlsMatch && titleSim > 0.95 && empSim > 0.95) {
                    const incomingUrl = job.applyLink;
                    const matchedUrl2 = m.applyLink || '';
                    // Extract ATS job IDs from URLs
                    const incomingJobId = incomingUrl.split('/').pop()?.split('?')[0] || '';
                    const matchedJobId = matchedUrl2.split('/').pop()?.split('?')[0] || '';
                    if (incomingJobId !== matchedJobId && incomingJobId.length > 10) {
                        if (!trace.falsePositive) {
                            trace.falsePositive = true;
                            trace.falsePositiveReason = `Different ATS job IDs: incoming=${incomingJobId.substring(0, 36)} vs matched=${matchedJobId.substring(0, 36)} — likely different positions at same company`;
                        }
                        falsePositiveCount++;
                    }
                }

                trace.outcome = 'DUPLICATE';
                trace.outcomeDetail = `Fuzzy match (title=${titleSim.toFixed(3)}, employer=${empSim.toFixed(3)}): "${m.title}" @ ${m.employer}`;
                dupByFuzzy++;
                dupCount++;
                break;
            }
        }

        if (trace.outcome === 'NEW') {
            trace.outcomeDetail = 'No match found at any dedup stage';
            newCount++;
        }

        traces.push(trace);

        if ((i + 1) % 50 === 0) {
            console.log(`  Traced ${i + 1}/${rawJobs.length} — ${newCount} new, ${dupCount} dup, ${rejCount} rej, ${falsePositiveCount} suspected FP`);
        }
    }

    // ── Analysis ──
    const duplicates = traces.filter(t => t.outcome === 'DUPLICATE');
    const rejected = traces.filter(t => t.outcome === 'REJECTED');
    const newJobs = traces.filter(t => t.outcome === 'NEW');
    const falsePositives = traces.filter(t => t.falsePositive);

    // Group duplicates by dedup strategy
    const byStage: Record<string, number> = {};
    for (const t of duplicates) {
        if (t.stage3_externalIdDedup === 'MATCH') byStage['stage3_externalId_inmemory'] = (byStage['stage3_externalId_inmemory'] || 0) + 1;
        else if (t.stage4_exactId === 'MATCH') byStage['stage4_exactId_db'] = (byStage['stage4_exactId_db'] || 0) + 1;
        else if (t.stage5_exactTitle === 'MATCH') byStage['stage5_exact_title_employer_loc'] = (byStage['stage5_exact_title_employer_loc'] || 0) + 1;
        else if (t.stage6_applyUrl === 'MATCH') byStage['stage6_apply_url'] = (byStage['stage6_apply_url'] || 0) + 1;
        else if (t.stage7_fuzzy === 'MATCH') byStage['stage7_fuzzy_title_employer'] = (byStage['stage7_fuzzy_title_employer'] || 0) + 1;
    }

    // Count how many unique existing jobs are being matched
    const matchedExistingIds = new Set<string>();
    for (const t of duplicates) {
        const mid = t.stage3_matchedJobId || t.stage5_matchedJobId || t.stage6_matchedJobId || t.stage7_matchedJobId;
        if (mid) matchedExistingIds.add(mid);
    }

    // Find the most-matched existing jobs (fan-in)
    const matchCounts = new Map<string, { title: string, employer: string, count: number }>();
    for (const t of duplicates) {
        const mid = t.stage3_matchedJobId || t.stage5_matchedJobId || t.stage6_matchedJobId || t.stage7_matchedJobId;
        const mTitle = t.stage5_matchedTitle || t.stage7_matchedTitle || '';
        const mEmp = t.stage5_matchedEmployer || t.stage7_matchedEmployer || '';
        if (mid) {
            const existing = matchCounts.get(mid) || { title: mTitle, employer: mEmp, count: 0 };
            existing.count++;
            if (!existing.title && mTitle) existing.title = mTitle;
            if (!existing.employer && mEmp) existing.employer = mEmp;
            matchCounts.set(mid, existing);
        }
    }
    const topFanIn = [...matchCounts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15)
        .map(([id, v]) => ({ existingJobId: id, ...v }));

    // Group rejected by reason
    const rejByReason: Record<string, number> = {};
    for (const t of rejected) {
        const reason = t.stage2_reason || 'unknown';
        rejByReason[reason] = (rejByReason[reason] || 0) + 1;
    }

    const summary = {
        timestamp: new Date().toISOString(),
        totalFetched: rawJobs.length,
        outcomes: {
            new: newCount,
            duplicate: dupCount,
            rejected: rejCount,
        },
        duplicatesByStrategy: byStage,
        uniqueExistingJobsMatched: matchedExistingIds.size,
        manyToOneRatio: `${dupCount} incoming → ${matchedExistingIds.size} existing (${(dupCount / matchedExistingIds.size).toFixed(1)}:1)`,
        topFanInJobs: topFanIn,
        rejectionReasons: rejByReason,
        falsePositiveAnalysis: {
            suspectedFalsePositives: falsePositiveCount,
            percentOfDuplicates: `${((falsePositiveCount / Math.max(dupCount, 1)) * 100).toFixed(1)}%`,
            examples: falsePositives.slice(0, 10).map(t => ({
                title: t.title,
                company: t.company,
                location: t.location,
                matchedTitle: t.stage7_matchedTitle || t.stage5_matchedTitle,
                matchedEmployer: t.stage7_matchedEmployer || t.stage5_matchedEmployer,
                reason: t.falsePositiveReason,
                titleSimilarity: t.stage7_titleSimilarity,
                employerSimilarity: t.stage7_employerSimilarity,
            })),
        },
    };

    // Write files
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'fantastic-e2e-trace.json'), JSON.stringify(traces, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'fantastic-e2e-summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'fantastic-false-positives.json'),
        JSON.stringify(falsePositives.map(t => ({
            incoming: { title: t.title, company: t.company, location: t.location, applyLink: t.applyLink, externalId: t.externalId },
            matched: { title: t.stage7_matchedTitle, employer: t.stage7_matchedEmployer, jobId: t.stage7_matchedJobId },
            titleSimilarity: t.stage7_titleSimilarity,
            employerSimilarity: t.stage7_employerSimilarity,
            reason: t.falsePositiveReason,
        })), null, 2));

    // Console output
    console.log('\n' + '='.repeat(80));
    console.log('  FANTASTIC-JOBS-DB — E2E PIPELINE TRACE');
    console.log('='.repeat(80));
    console.log(`\n  Total fetched:            ${rawJobs.length}`);
    console.log(`  ├─ NEW (would add):       ${newCount}`);
    console.log(`  ├─ DUPLICATE:             ${dupCount}`);
    console.log(`  └─ REJECTED:              ${rejCount}`);

    console.log('\n  ── DEDUP BREAKDOWN ──');
    for (const [stage, count] of Object.entries(byStage)) {
        console.log(`  ${stage}: ${count}`);
    }

    console.log(`\n  Unique existing jobs matched: ${matchedExistingIds.size}`);
    console.log(`  Many-to-one ratio: ${summary.manyToOneRatio}`);

    console.log('\n  ── TOP FAN-IN JOBS (most incoming mapped to single existing) ──');
    for (const f of topFanIn.slice(0, 10)) {
        console.log(`  ${f.count}× → "${f.title?.substring(0, 60)}" @ ${f.employer}`);
    }

    console.log('\n  ── REJECTION REASONS ──');
    for (const [reason, count] of Object.entries(rejByReason)) {
        console.log(`  ${reason}: ${count}`);
    }

    console.log('\n  ── FALSE POSITIVE ANALYSIS ──');
    console.log(`  Suspected false positives: ${falsePositiveCount} / ${dupCount} (${summary.falsePositiveAnalysis.percentOfDuplicates})`);
    for (const fp of falsePositives.slice(0, 5)) {
        console.log(`    ❌ "${fp.title?.substring(0, 50)}" @ ${fp.company}`);
        console.log(`       → matched: "${(fp.stage7_matchedTitle || '').substring(0, 50)}" @ ${fp.stage7_matchedEmployer}`);
        console.log(`       Reason: ${fp.falsePositiveReason}`);
    }

    console.log('\n  Output files:');
    console.log('    tmp/fantastic-e2e-trace.json       — full trace (every job)');
    console.log('    tmp/fantastic-e2e-summary.json     — aggregated analysis');
    console.log('    tmp/fantastic-false-positives.json  — suspected FPs');
    console.log('='.repeat(80) + '\n');

    await prisma.$disconnect();
}

run().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
