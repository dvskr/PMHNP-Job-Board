/**
 * Audit prod applyLink hosts vs job-classifier tier output.
 *
 * Question we're answering: do `sourceType='external'` rows in prod hold
 * unwrapped employer ATS URLs (→ direct_apply) or aggregator-tracking
 * redirects that the classifier mis-tiers as `external`?
 *
 * If the latter exists in non-trivial volume, the directApply patch in
 * components/JobStructuredData.tsx will silently emit `directApply: false`
 * on jobs that actually go straight to an employer ATS, which is the
 * opposite mistake from today's blanket `directApply: true`.
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
    const { classifyJob, ATS_HOST_SUBSTRINGS } = await import('@/lib/ai/job-classifier');

    console.log('\n=== APPLY-LINK TIER AUDIT (prod) ===\n');

    // 1. Tier breakdown for ALL active published jobs
    const all = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
            id: true,
            sourceType: true,
            sourceProvider: true,
            applyOnPlatform: true,
            applyLink: true,
            healthConsecutiveMissing: true,
        },
    });

    const tierCount = { easy_apply: 0, direct_apply: 0, external: 0 };
    const externalByHost: Record<string, number> = {};
    const directByHost: Record<string, number> = {};
    const externalSamples: Array<{ id: string; provider: string | null; link: string }> = [];

    for (const j of all) {
        const c = classifyJob({
            sourceType: j.sourceType,
            applyOnPlatform: j.applyOnPlatform,
            applyLink: j.applyLink,
            healthConsecutiveMissing: j.healthConsecutiveMissing ?? 0,
        });
        tierCount[c.tier]++;

        if (j.applyLink) {
            try {
                const host = new URL(j.applyLink).hostname.replace(/^www\./, '');
                if (c.tier === 'external') {
                    externalByHost[host] = (externalByHost[host] || 0) + 1;
                    if (externalSamples.length < 30 && j.sourceType === 'external') {
                        externalSamples.push({
                            id: j.id,
                            provider: j.sourceProvider,
                            link: j.applyLink,
                        });
                    }
                } else if (c.tier === 'direct_apply') {
                    directByHost[host] = (directByHost[host] || 0) + 1;
                }
            } catch {
                // malformed URL — count separately
                externalByHost['(malformed-url)'] = (externalByHost['(malformed-url)'] || 0) + 1;
            }
        }
    }

    console.log(`Total active published jobs: ${all.length}`);
    console.log(`  easy_apply:   ${tierCount.easy_apply}`);
    console.log(`  direct_apply: ${tierCount.direct_apply}`);
    console.log(`  external:     ${tierCount.external}`);

    // 2. external-tier hosts (these are what currently render directApply:false
    //    if we ship the patch). Sorted by count desc.
    console.log('\n--- TOP HOSTS classified as `external` ---');
    console.log('(if any of these are actually employer ATS, classifier needs a new substring)');
    const externalSorted = Object.entries(externalByHost).sort((a, b) => b[1] - a[1]).slice(0, 25);
    for (const [host, n] of externalSorted) {
        console.log(`  ${String(n).padStart(5)}  ${host}`);
    }

    // 3. direct_apply tier hosts (sanity: should look like real ATSes)
    console.log('\n--- TOP HOSTS classified as `direct_apply` ---');
    console.log('(sanity check: should be ATS / careers.* domains, not aggregator UIs)');
    const directSorted = Object.entries(directByHost).sort((a, b) => b[1] - a[1]).slice(0, 25);
    for (const [host, n] of directSorted) {
        console.log(`  ${String(n).padStart(5)}  ${host}`);
    }

    // 4. Sample 30 external-tier rows to eyeball whether they're really aggregator UIs
    console.log('\n--- 30 SAMPLE `external`-tier jobs (sourceType=external) ---');
    for (const s of externalSamples) {
        console.log(`  [${s.provider}]  ${s.link.slice(0, 120)}`);
    }

    // 5. ATS substring list reference
    console.log('\n--- Current ATS_HOST_SUBSTRINGS in classifier ---');
    console.log('  ' + ATS_HOST_SUBSTRINGS.join(', '));

    // 6. external rows whose hostname includes a careers./jobs. prefix that the
    //    classifier MAY have missed because the substring is "careers." with the
    //    trailing dot — a hostname like "careers-acme.com" wouldn't match.
    console.log('\n--- external-tier hosts that LOOK like employer career pages ---');
    console.log('(potential mis-tiers — classifier should probably catch these)');
    const looksLikeCareer = externalSorted.filter(([h]) =>
        /\bcareers?[-.]/i.test(h) || /\bjobs[-.]/i.test(h) || /\.greenhouse\b/.test(h) || /\.lever\b/.test(h),
    );
    if (looksLikeCareer.length === 0) {
        console.log('  (none)');
    } else {
        for (const [h, n] of looksLikeCareer) {
            console.log(`  ${String(n).padStart(5)}  ${h}`);
        }
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
