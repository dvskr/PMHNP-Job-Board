/**
 * Deep relevance + rejection audit.
 *
 * 1. Scans EVERY published job for PMHNP relevance signals
 * 2. Samples rejected_jobs to verify the relevance filter isn't over- or
 *    under-rejecting
 * 3. Checks for normalization artifacts (encoding, truncation, dupes)
 * 4. Reports anything that warrants follow-up
 *
 * Read-only.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

// ── Relevance signal lexicon ─────────────────────────────────────────────
// POSITIVE signals — at least ONE must appear in the title.
// Word-boundary anchored to avoid partial matches like "psychic" → "psych".
const POSITIVE_PATTERNS: RegExp[] = [
    /\bpmhnp\b/i,
    /\bpsychiatric\b/i,
    /\bpsychiatry\b/i,
    /\bmental\s+health\b/i,
    /\bbehavioral\s+health\b/i,
    /\btele[-\s]?psych/i,
    /\bpsych\s+np\b/i,
    /\bpsych\s+nurse\b/i,
    /\bpsych\s+aprn\b/i,
    /\bpsych\s+(prescriber|provider|practitioner)\b/i,
    /\baddiction\b/i,
    /\bsubstance\s+(use|abuse)\b/i,
    /\bsuboxone\b/i,
    /\bMAT\b/, // Medication-Assisted Treatment, case-sensitive (avoid "format")
    /\bsubstance\s+use\s+disorder\b/i,
    /\bdetox\b/i,
];

// NEGATIVE signals — clear non-PMHNP roles. If ANY of these match without
// a positive psychiatric signal, the job should be unpublished.
const HARD_NEGATIVES: RegExp[] = [
    /\bpeer\s+specialist\b/i,
    /\bcase\s+manager\b/i,
    /\bcoordinator\b/i,
    /\bmedical\s+assistant\b/i,
    /\bphlebotom/i,
    /\bsecurity\s+officer\b/i,
    /\bjanitor/i,
    /\bfood\s+service/i,
    /\bdriver\b/i,
    /\bcustodi/i,
    /\bplumber\b/i,
    /\bsurgeon\b/i,
    /\bdentist\b/i,
    /\bdental\s+(hygienist|assistant)\b/i,
    /\bdietitian\b/i,
    /\bnutritionist\b/i,
    /\bpharmacist\b/i,
    /\bphysical\s+therap/i,
    /\boccupational\s+therap/i,
    /\bspeech\s+therap/i,
    /\b(home\s+health\s+aide|HHA)\b/i,
    /\b(certified\s+nursing\s+assistant|\bCNA\b)/i,
    /\b(licensed\s+practical\s+nurse|\bLPN\b)/i,
    /\bemergency\s+medical\s+technician\b/i,
    /\b(EMT|paramedic)\b/i,
    /\bsales\s+(rep|representative|associate)\b/i,
    /\bbilling\s+specialist\b/i,
    /\baccount\s+(executive|manager)\b/i,
    /\bsoftware\s+engineer\b/i,
    /\bdeveloper\b/i,
    /\bdata\s+(scientist|analyst|engineer)\b/i,
];

interface Issue {
    id: string;
    title: string;
    employer: string;
    sourceProvider: string | null;
    qualityScore: number;
    reason: string;
}

function pct(n: number, d: number): string {
    if (d === 0) return '0%';
    return `${((n / d) * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
    console.log('Deep relevance + rejection audit\n');

    // ─── 1. Scan EVERY published job ───────────────────────────────────
    const allPub = await prisma.job.findMany({
        where: { isPublished: true },
        select: { id: true, title: true, employer: true, sourceProvider: true, qualityScore: true, slug: true },
    });
    console.log(`Scanning ${allPub.length} published jobs...\n`);

    const noPositive: Issue[] = [];
    const hardNegative: Issue[] = [];
    const both: Issue[] = []; // has positive AND negative — borderline

    for (const job of allPub) {
        const title = job.title;
        const hasPositive = POSITIVE_PATTERNS.some((p) => p.test(title));
        const negativeMatch = HARD_NEGATIVES.find((p) => p.test(title));

        if (negativeMatch && !hasPositive) {
            hardNegative.push({
                id: job.id,
                title,
                employer: job.employer,
                sourceProvider: job.sourceProvider,
                qualityScore: job.qualityScore,
                reason: `hard-negative: ${negativeMatch.source}`,
            });
        } else if (negativeMatch && hasPositive) {
            both.push({
                id: job.id,
                title,
                employer: job.employer,
                sourceProvider: job.sourceProvider,
                qualityScore: job.qualityScore,
                reason: `borderline: matches both positive and ${negativeMatch.source}`,
            });
        } else if (!hasPositive) {
            noPositive.push({
                id: job.id,
                title,
                employer: job.employer,
                sourceProvider: job.sourceProvider,
                qualityScore: job.qualityScore,
                reason: 'no-positive-signal',
            });
        }
    }

    console.log(`PUBLISHED RELEVANCE SCAN — ${allPub.length} jobs`);
    console.log(`  ✓ Clear PMHNP (positive only)        ${allPub.length - noPositive.length - hardNegative.length - both.length}  (${pct(allPub.length - noPositive.length - hardNegative.length - both.length, allPub.length)})`);
    console.log(`  ⚠ Borderline (positive + negative)   ${both.length}`);
    console.log(`  ✗ No positive PMHNP signal           ${noPositive.length}  (${pct(noPositive.length, allPub.length)})`);
    console.log(`  ✗ Hard non-PMHNP signal              ${hardNegative.length}  (${pct(hardNegative.length, allPub.length)})`);

    // Group "no positive" by source to see which sources leak
    console.log('\nNo-positive-signal breakdown by source:');
    const noPosBySource = new Map<string, number>();
    for (const j of noPositive) {
        const s = j.sourceProvider ?? 'unknown';
        noPosBySource.set(s, (noPosBySource.get(s) ?? 0) + 1);
    }
    for (const [s, n] of [...noPosBySource.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${s.padEnd(22)} ${n}`);
    }

    // Show worst-quality "no positive" rows (most likely to be junk)
    console.log('\nSample 20 lowest-quality no-positive titles:');
    for (const j of noPositive.sort((a, b) => a.qualityScore - b.qualityScore).slice(0, 20)) {
        console.log(`  [Q${j.qualityScore.toString().padStart(2)}] [${j.sourceProvider}] "${j.title}" @ ${j.employer}`);
    }

    // Show all hard-negative titles
    console.log(`\nAll ${hardNegative.length} hard-negative titles (should be unpublished):`);
    for (const j of hardNegative.slice(0, 30)) {
        console.log(`  [${j.sourceProvider}] "${j.title}" @ ${j.employer}  (${j.reason})`);
    }
    if (hardNegative.length > 30) console.log(`  ... and ${hardNegative.length - 30} more`);

    // ─── 2. Rejection sampling ────────────────────────────────────────
    console.log('\n' + '═'.repeat(78));
    console.log('REJECTED JOBS SAMPLING');
    console.log('═'.repeat(78));

    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const reasons = await prisma.rejectedJob.groupBy({
        by: ['rejectionReason'],
        where: { createdAt: { gte: week } },
        _count: { _all: true },
        orderBy: { _count: { rejectionReason: 'desc' } },
    });
    console.log('\nLast 7 days:');
    for (const r of reasons) console.log(`  ${(r.rejectionReason ?? 'unknown').padEnd(40)} ${r._count._all}`);

    // Sample relevance_filter rejections to verify they really aren't PMHNP
    console.log('\n— Sample 20 relevance_filter rejections (verify these are TRULY non-PMHNP):');
    const relevanceRej = await prisma.rejectedJob.findMany({
        where: { rejectionReason: 'relevance_filter', createdAt: { gte: week } },
        select: { rawData: true, sourceProvider: true },
        take: 20,
    });
    let falseNegatives = 0;
    for (const r of relevanceRej) {
        const title = (r.rawData as { title?: string } | null)?.title ?? '(no title)';
        const hasPositive = POSITIVE_PATTERNS.some((p) => p.test(title));
        const flag = hasPositive ? ' ⚠ HAS POSITIVE SIGNAL — possible false rejection' : '';
        if (hasPositive) falseNegatives++;
        console.log(`  [${r.sourceProvider}] "${title.slice(0, 80)}"${flag}`);
    }
    if (falseNegatives > 0) {
        console.log(`\n  ⚠ ${falseNegatives}/20 sampled relevance rejections have a PMHNP-positive title — relevance filter may be over-aggressive`);
    } else {
        console.log(`\n  ✓ All 20 sampled relevance rejections look correctly non-PMHNP`);
    }

    // Sample other rejection reasons
    console.log('\n— Sample 5 normalizer rejections (these are the post-relevance edge cases):');
    const normRej = await prisma.rejectedJob.findMany({
        where: { rejectionReason: { startsWith: 'normalizer' }, createdAt: { gte: week } },
        select: { rawData: true, sourceProvider: true, rejectionReason: true },
        take: 5,
    });
    for (const r of normRej) {
        const title = (r.rawData as { title?: string } | null)?.title ?? '(no title)';
        console.log(`  [${r.sourceProvider}] "${title.slice(0, 80)}"  →  ${r.rejectionReason}`);
    }

    console.log('\n— Sample 5 dead_at_ingest rejections:');
    const deadRej = await prisma.rejectedJob.findMany({
        where: { rejectionReason: { startsWith: 'dead_at_ingest' }, createdAt: { gte: week } },
        select: { rawData: true, sourceProvider: true, applyLink: true, rejectionReason: true },
        take: 5,
    });
    for (const r of deadRej) {
        const title = (r.rawData as { title?: string } | null)?.title ?? '(no title)';
        console.log(`  [${r.sourceProvider}] "${title.slice(0, 60)}"  url=${r.applyLink?.slice(0, 60)}`);
    }

    // ─── 3. Normalization artifacts ────────────────────────────────────
    console.log('\n' + '═'.repeat(78));
    console.log('NORMALIZATION ARTIFACTS');
    console.log('═'.repeat(78));

    const truncated = await prisma.job.count({
        where: { isPublished: true, OR: [{ title: { endsWith: '...' } }, { title: { endsWith: '…' } }] },
    });
    console.log(`Truncated titles ending in '...' or '…': ${truncated}`);

    const veryShort = await prisma.job.count({
        where: { isPublished: true, title: { lt: 'aa' } },
    });
    console.log(`Suspiciously short titles (< 2 chars): ${veryShort}`);

    const mojibake = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'â€' } },
                { title: { contains: 'Ã©' } },
                { title: { contains: 'Â' } },
            ],
        },
        select: { title: true, employer: true },
        take: 5,
    });
    console.log(`Mojibake-encoded titles: ${mojibake.length}${mojibake.length > 0 ? ' (sample below)' : ''}`);
    for (const j of mojibake) console.log(`  "${j.title}" @ ${j.employer}`);

    const emptyDesc = await prisma.job.count({
        where: { isPublished: true, description: '' },
    });
    console.log(`Empty descriptions on published rows: ${emptyDesc}`);

    const noEmployer = await prisma.job.count({
        where: { isPublished: true, OR: [{ employer: '' }, { employer: 'Unknown' }, { employer: 'unknown' }] },
    });
    console.log(`Generic / empty employer names: ${noEmployer}`);

    // City/state mismatch heuristic
    const cityNoState = await prisma.job.count({
        where: { isPublished: true, city: { not: null }, state: null },
    });
    const stateNoCity = await prisma.job.count({
        where: { isPublished: true, state: { not: null }, city: null, isRemote: false },
    });
    console.log(`Has city but no state (parser miss): ${cityNoState}`);
    console.log(`Has state but no city, not remote: ${stateNoCity}`);

    // ─── 4. Employer dedup spot-check ──────────────────────────────────
    console.log('\n' + '═'.repeat(78));
    console.log('EMPLOYER DEDUP SPOT-CHECK');
    console.log('═'.repeat(78));
    const empGroups = await prisma.job.groupBy({
        by: ['employer'],
        where: { isPublished: true },
        _count: { _all: true },
    });
    // Find employers whose lowercase forms collide
    const lcMap = new Map<string, { name: string; count: number }[]>();
    for (const e of empGroups) {
        const key = e.employer.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!lcMap.has(key)) lcMap.set(key, []);
        lcMap.get(key)!.push({ name: e.employer, count: e._count._all });
    }
    let dupGroups = 0;
    for (const [key, names] of lcMap) {
        if (names.length < 2) continue;
        dupGroups++;
        if (dupGroups > 15) continue;
        console.log(`  ${key}: ${names.map((n) => `"${n.name}" (${n.count})`).join(', ')}`);
    }
    console.log(`Total dedup-collision groups: ${dupGroups}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
