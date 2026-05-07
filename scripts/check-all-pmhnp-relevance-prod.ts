/**
 * Run classifyRelevance over EVERY published job in prod and report
 * how many fail, grouped by source + reason. The /api/cron/ingest gate
 * is supposed to keep non-PMHNP jobs out, but legacy rows from before
 * the gate tightened can still be live — this audit catches them.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { classifyRelevance } = await import('@/lib/utils/job-filter');

    console.log('\n=== PMHNP RELEVANCE AUDIT (PROD, isPublished=true) ===\n');

    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true, title: true, employer: true, description: true,
            sourceProvider: true, sourceType: true, slug: true, createdAt: true,
        },
    });
    console.log(`Total published jobs: ${jobs.length}\n`);

    const passBySource = new Map<string, number>();
    const failBySource = new Map<string, Map<string, number>>();
    const failedSamples: Array<{ source: string; reason: string; title: string; employer: string; slug: string | null }> = [];

    for (const j of jobs) {
        const src = j.sourceProvider ?? (j.sourceType === 'employer' ? 'employer' : '(none)');
        const r = classifyRelevance(j.title ?? '', j.description ?? '', j.employer ?? '');
        if (r.passes) {
            passBySource.set(src, (passBySource.get(src) ?? 0) + 1);
        } else {
            const m = failBySource.get(src) ?? new Map<string, number>();
            m.set(r.reason, (m.get(r.reason) ?? 0) + 1);
            failBySource.set(src, m);
            if (failedSamples.length < 20) {
                failedSamples.push({
                    source: src,
                    reason: r.reason,
                    title: j.title?.slice(0, 65) ?? '',
                    employer: j.employer?.slice(0, 30) ?? '',
                    slug: j.slug,
                });
            }
        }
    }

    const allSources = new Set([...passBySource.keys(), ...failBySource.keys()]);
    let totalPass = 0;
    let totalFail = 0;

    console.log('--- 1. PER-SOURCE PASS/FAIL ---');
    console.log('source                pass   fail   fail%');
    for (const src of [...allSources].sort()) {
        const pass = passBySource.get(src) ?? 0;
        const fail = [...(failBySource.get(src) ?? new Map()).values()].reduce((a, b) => a + b, 0);
        const pct = pass + fail > 0 ? ((fail / (pass + fail)) * 100).toFixed(1) : '0.0';
        totalPass += pass;
        totalFail += fail;
        console.log(`  ${src.padEnd(20)} ${String(pass).padStart(5)}  ${String(fail).padStart(5)}   ${pct.padStart(5)}%`);
    }
    const totalPct = totalPass + totalFail > 0 ? ((totalFail / (totalPass + totalFail)) * 100).toFixed(2) : '0.00';
    console.log(`  ${'TOTAL'.padEnd(20)} ${String(totalPass).padStart(5)}  ${String(totalFail).padStart(5)}   ${totalPct.padStart(5)}%`);

    if (totalFail === 0) {
        console.log('\n✅ Every published job passes classifyRelevance. Catalog is clean.');
        await prisma.$disconnect();
        return;
    }

    console.log('\n--- 2. FAILURES BY REASON ---');
    const reasonTotal = new Map<string, number>();
    for (const m of failBySource.values()) {
        for (const [r, n] of m.entries()) {
            reasonTotal.set(r, (reasonTotal.get(r) ?? 0) + n);
        }
    }
    for (const [r, n] of [...reasonTotal.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${r.padEnd(35)} ${String(n).padStart(5)}`);
    }

    console.log('\n--- 3. SAMPLE OF FAILED ROWS (up to 20) ---');
    for (const s of failedSamples) {
        console.log(`  [${s.source.padEnd(18)}] ${s.reason.padEnd(28)} ${s.title}  /  ${s.employer}`);
        if (s.slug) console.log(`    slug: ${s.slug.slice(0, 80)}`);
    }

    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
