import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/prisma';

// ============================================
// HELPER FUNCTIONS
// ============================================

function normalizeUrl(url: string): string {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid', 'from', 'source', 'sn_source', 'sn_category'];
        stripParams.forEach(p => parsed.searchParams.delete(p));
        let normalized = parsed.origin + parsed.pathname;
        normalized = normalized.replace(/\/+$/, '');
        normalized = normalized.toLowerCase();
        normalized = normalized.replace('://www.', '://');
        parsed.searchParams.sort();
        const remaining = parsed.searchParams.toString();
        if (remaining) normalized += '?' + remaining;
        return normalized;
    } catch {
        return url.toLowerCase().trim();
    }
}

function normalizeText(text: string): string {
    if (!text) return '';
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
}

function normalizeEmployer(name: string): string {
    if (!name) return '';
    let n = name.toLowerCase().trim();
    // Remove common suffixes
    const suffixes = ['inc', 'llc', 'corp', 'corporation', 'company', 'co', 'ltd', 'pllc', 'pc', 'pa', 'group', 'services'];
    for (const suffix of suffixes) {
        n = n.replace(new RegExp(`\\b${suffix}\\.?\\s*$`, 'g'), '');
        n = n.replace(new RegExp(`\\b${suffix}\\.?\\b`, 'g'), '');
    }
    n = n.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    return n;
}

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

// ============================================
// MAIN AUDIT
// ============================================

async function main() {
    console.log('='.repeat(70));
    console.log('  PMHNP HIRING — DEDUPLICATION AUDIT REPORT');
    console.log('  ' + new Date().toISOString());
    console.log('='.repeat(70));

    const allJobs = await prisma.job.findMany({
        orderBy: { createdAt: 'desc' },
    });

    console.log(`\n📊 TOTAL JOBS IN DATABASE: ${allJobs.length}\n`);

    // ============================================
    // SECTION 1: Source Breakdown
    // ============================================
    console.log('─'.repeat(70));
    console.log('SECTION 1: JOBS BY SOURCE');
    console.log('─'.repeat(70));

    const sourceCounts = new Map<string, number>();
    for (const job of allJobs) {
        const src = job.sourceProvider || 'unknown';
        sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
    }

    // Sort by count descending
    const sortedSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [source, count] of sortedSources) {
        const pct = ((count / allJobs.length) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(count / allJobs.length * 40));
        console.log(`  ${source.padEnd(15)} ${String(count).padStart(5)} jobs  (${pct}%)  ${bar}`);
    }

    // ============================================
    // SECTION 2: Exact Apply Link Duplicates
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 2: EXACT APPLY LINK DUPLICATES');
    console.log('─'.repeat(70));

    const urlGroups = new Map<string, typeof allJobs>();
    let jobsWithApplyLink = 0;
    let jobsWithoutApplyLink = 0;

    for (const job of allJobs) {
        if (!job.applyLink) {
            jobsWithoutApplyLink++;
            continue;
        }
        jobsWithApplyLink++;
        const normalized = normalizeUrl(job.applyLink);
        if (!urlGroups.has(normalized)) urlGroups.set(normalized, []);
        urlGroups.get(normalized)!.push(job);
    }

    const urlDupeGroups = [...urlGroups.entries()].filter(([, g]) => g.length > 1);
    const urlDupeCount = urlDupeGroups.reduce((sum, [, g]) => sum + g.length - 1, 0);

    console.log(`  Jobs WITH apply link:    ${jobsWithApplyLink}`);
    console.log(`  Jobs WITHOUT apply link: ${jobsWithoutApplyLink}`);
    console.log(`  Duplicate groups found:  ${urlDupeGroups.length}`);
    console.log(`  Total removable dupes:   ${urlDupeCount}`);

    // Show top 5 examples
    if (urlDupeGroups.length > 0) {
        console.log('\n  📋 TOP 5 APPLY LINK DUPLICATE EXAMPLES:');
        const sorted = urlDupeGroups.sort((a, b) => b[1].length - a[1].length);
        for (let i = 0; i < Math.min(5, sorted.length); i++) {
            const [url, group] = sorted[i];
            console.log(`\n  Group ${i + 1} (${group.length} copies):`);
            console.log(`  URL: ${url.substring(0, 80)}...`);
            for (const job of group) {
                console.log(`    → [${(job.sourceProvider || '?').padEnd(10)}] "${job.title}" at ${job.employer}`);
            }
        }
    }

    // Source pair overlap for URL dupes
    console.log('\n  📊 WHICH SOURCE PAIRS OVERLAP MOST (by apply link):');
    const sourcePairCounts = new Map<string, number>();
    for (const [, group] of urlDupeGroups) {
        const sources = [...new Set(group.map(j => j.sourceProvider || 'unknown'))];
        for (let i = 0; i < sources.length; i++) {
            for (let j = i + 1; j < sources.length; j++) {
                const pair = [sources[i], sources[j]].sort().join(' ↔ ');
                sourcePairCounts.set(pair, (sourcePairCounts.get(pair) || 0) + 1);
            }
        }
    }
    const sortedPairs = [...sourcePairCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pair, count] of sortedPairs.slice(0, 10)) {
        console.log(`    ${pair.padEnd(30)} ${count} overlapping jobs`);
    }

    // ============================================
    // SECTION 3: Exact Title + Employer Duplicates
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 3: EXACT TITLE + EMPLOYER DUPLICATES');
    console.log('─'.repeat(70));

    const titleEmpGroups = new Map<string, typeof allJobs>();
    for (const job of allJobs) {
        const key = `${normalizeText(job.title)}|||${normalizeEmployer(job.employer)}`;
        if (!titleEmpGroups.has(key)) titleEmpGroups.set(key, []);
        titleEmpGroups.get(key)!.push(job);
    }

    const titleEmpDupeGroups = [...titleEmpGroups.entries()].filter(([, g]) => g.length > 1);
    const titleEmpDupeCount = titleEmpDupeGroups.reduce((sum, [, g]) => sum + g.length - 1, 0);

    console.log(`  Duplicate groups found:  ${titleEmpDupeGroups.length}`);
    console.log(`  Total removable dupes:   ${titleEmpDupeCount}`);

    // Subtract URL dupes already counted (avoid double counting)
    // Show unique-to-this-pass count
    const alreadyCountedIds = new Set<string>();
    for (const [, group] of urlDupeGroups) {
        for (let i = 1; i < group.length; i++) {
            alreadyCountedIds.add(group[i].id);
        }
    }

    let newDupesThisPass = 0;
    for (const [, group] of titleEmpDupeGroups) {
        for (let i = 1; i < group.length; i++) {
            if (!alreadyCountedIds.has(group[i].id)) newDupesThisPass++;
        }
    }
    console.log(`  NEW dupes (not caught by URL): ${newDupesThisPass}`);

    if (titleEmpDupeGroups.length > 0) {
        console.log('\n  📋 TOP 5 TITLE+EMPLOYER DUPLICATE EXAMPLES:');
        const sorted = titleEmpDupeGroups.sort((a, b) => b[1].length - a[1].length);
        for (let i = 0; i < Math.min(5, sorted.length); i++) {
            const [, group] = sorted[i];
            console.log(`\n  Group ${i + 1} (${group.length} copies):`);
            for (const job of group) {
                console.log(`    → [${(job.sourceProvider || '?').padEnd(10)}] "${job.title}" at ${job.employer} | ${job.location || 'no location'}`);
            }
        }
    }

    // ============================================
    // SECTION 4: Fuzzy Duplicates (sample check)
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 4: FUZZY DUPLICATE SAMPLE (same employer, similar title)');
    console.log('─'.repeat(70));

    // Group by normalized employer
    const byEmployer = new Map<string, typeof allJobs>();
    for (const job of allJobs) {
        const emp = normalizeEmployer(job.employer);
        if (!emp) continue;
        if (!byEmployer.has(emp)) byEmployer.set(emp, []);
        byEmployer.get(emp)!.push(job);
    }

    let fuzzyDupeCount = 0;
    const fuzzyExamples: Array<{ a: typeof allJobs[0]; b: typeof allJobs[0]; sim: number }> = [];

    for (const [, empJobs] of byEmployer) {
        if (empJobs.length < 2) continue;
        for (let i = 0; i < empJobs.length && i < 50; i++) {
            for (let j = i + 1; j < empJobs.length && j < 50; j++) {
                const sim = wordOverlapSimilarity(empJobs[i].title, empJobs[j].title);
                if (sim >= 0.75 && sim < 1.0) {
                    fuzzyDupeCount++;
                    if (fuzzyExamples.length < 10) {
                        fuzzyExamples.push({ a: empJobs[i], b: empJobs[j], sim });
                    }
                }
            }
        }
    }

    console.log(`  Potential fuzzy duplicates found: ${fuzzyDupeCount}`);

    if (fuzzyExamples.length > 0) {
        console.log('\n  📋 FUZZY DUPLICATE EXAMPLES (same employer, similar but not identical title):');
        for (let i = 0; i < fuzzyExamples.length; i++) {
            const { a, b, sim } = fuzzyExamples[i];
            console.log(`\n  Example ${i + 1} (similarity: ${(sim * 100).toFixed(0)}%):`);
            console.log(`    A: [${(a.sourceProvider || '?').padEnd(10)}] "${a.title}"`);
            console.log(`    B: [${(b.sourceProvider || '?').padEnd(10)}] "${b.title}"`);
            console.log(`    Employer: ${a.employer}`);
        }
    }

    // ============================================
    // SECTION 5: ExternalId Coverage Check
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 5: EXTERNAL ID COVERAGE');
    console.log('─'.repeat(70));

    let hasExternalId = 0;
    let missingExternalId = 0;
    const missingBySource = new Map<string, number>();

    for (const job of allJobs) {
        if (job.externalId) {
            hasExternalId++;
        } else {
            missingExternalId++;
            const src = job.sourceProvider || 'unknown';
            missingBySource.set(src, (missingBySource.get(src) || 0) + 1);
        }
    }

    console.log(`  Jobs WITH externalId:    ${hasExternalId} (${((hasExternalId / allJobs.length) * 100).toFixed(1)}%)`);
    console.log(`  Jobs WITHOUT externalId: ${missingExternalId} (${((missingExternalId / allJobs.length) * 100).toFixed(1)}%)`);

    if (missingExternalId > 0) {
        console.log('\n  Missing externalId by source:');
        for (const [src, count] of [...missingBySource.entries()].sort((a, b) => b[1] - a[1])) {
            console.log(`    ${src.padEnd(15)} ${count} jobs missing externalId`);
        }
    }

    // ============================================
    // SECTION 6: Apply Link Quality Check
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 6: APPLY LINK QUALITY');
    console.log('─'.repeat(70));

    const redirectDomains = new Map<string, number>();
    const directDomains = new Map<string, number>();
    let redirectCount = 0;
    let directCount = 0;

    const knownRedirectors = ['adzuna.com', 'jooble.org', 'indeed.com', 'ziprecruiter.com', 'linkedin.com', 'glassdoor.com', 'talent.com', 'neuvoo.com'];

    for (const job of allJobs) {
        if (!job.applyLink) continue;
        try {
            const domain = new URL(job.applyLink).hostname.replace('www.', '');
            const isRedirect = knownRedirectors.some(r => domain.includes(r));
            if (isRedirect) {
                redirectCount++;
                redirectDomains.set(domain, (redirectDomains.get(domain) || 0) + 1);
            } else {
                directCount++;
                directDomains.set(domain, (directDomains.get(domain) || 0) + 1);
            }
        } catch {
            // skip invalid URLs
        }
    }

    console.log(`  Redirect URLs (adzuna, jooble, etc): ${redirectCount} — HARD to dedup by URL`);
    console.log(`  Direct employer URLs:                ${directCount} — EASY to dedup by URL`);

    console.log('\n  Top redirect domains:');
    for (const [domain, count] of [...redirectDomains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        console.log(`    ${domain.padEnd(30)} ${count}`);
    }

    console.log('\n  Top direct employer domains:');
    for (const [domain, count] of [...directDomains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`    ${domain.padEnd(30)} ${count}`);
    }

    // ============================================
    // SECTION 7: SUMMARY & HEALTH SCORE
    // ============================================
    console.log('\n' + '='.repeat(70));
    console.log('  DEDUPLICATION HEALTH SUMMARY');
    console.log('='.repeat(70));

    const totalDupes = urlDupeCount + newDupesThisPass;
    const dupeRate = ((totalDupes / allJobs.length) * 100).toFixed(1);
    const uniqueEstimate = allJobs.length - totalDupes;

    console.log(`\n  Total jobs:              ${allJobs.length}`);
    console.log(`  Confirmed duplicates:    ${totalDupes} (${dupeRate}%)`);
    console.log(`  Likely fuzzy dupes:      ${fuzzyDupeCount} (need manual review)`);
    console.log(`  Estimated unique jobs:   ${uniqueEstimate}`);
    console.log(`  Duplicate rate:          ${dupeRate}%`);

    let healthScore = 'UNKNOWN';
    const dupeRateNum = parseFloat(dupeRate);
    if (dupeRateNum < 5) healthScore = '🟢 EXCELLENT — dedup is working great';
    else if (dupeRateNum < 15) healthScore = '🟡 OKAY — some dupes slipping through, run cleanup script';
    else if (dupeRateNum < 30) healthScore = '🟠 NEEDS WORK — significant dupes, run cleanup + review fuzzy matches';
    else healthScore = '🔴 CRITICAL — dedup may not be running properly, check ingestion-service.ts';

    console.log(`\n  HEALTH: ${healthScore}`);

    console.log('\n  RECOMMENDATIONS:');
    if (urlDupeCount > 0) {
        console.log(`  ⚠️  ${urlDupeCount} jobs share exact apply links — run deduplicate-database.ts to clean`);
    }
    if (newDupesThisPass > 0) {
        console.log(`  ⚠️  ${newDupesThisPass} jobs have identical title+employer — run deduplicate-database.ts to clean`);
    }
    if (fuzzyDupeCount > 10) {
        console.log(`  ⚠️  ${fuzzyDupeCount} likely fuzzy dupes — run cleanup script Pass 3 for CSV review`);
    }
    if (missingExternalId > allJobs.length * 0.3) {
        console.log(`  ⚠️  ${missingExternalId} jobs missing externalId — Strategy 1 (exact ID) not effective for these`);
    }
    if (redirectCount > directCount) {
        console.log(`  ⚠️  Most apply links are redirects — URL-based dedup is limited, title+employer matching is critical`);
    }
    if (totalDupes === 0 && fuzzyDupeCount === 0) {
        console.log('  ✅ No duplicates found! Database is clean.');
    }

    console.log('\n' + '='.repeat(70));

    await prisma.$disconnect();
}

main().catch(console.error);
