/**
 * Full prod catalog quality audit. Read-only.
 *
 * Sections:
 *   1. Volume — total active jobs, breakdown by source, by day (30d)
 *   2. Relevance bugs — jobs that fail isRelevantJob (shouldn't be in catalog)
 *   3. Schema issues — nulls, malformed dates, salary inversions, slug drift,
 *      employer normalization variations
 *   4. SEO issues — short descriptions, missing summary, missing location,
 *      missing salary, low qualityScore, expired-but-published, duplicate slugs
 *   5. Freshness — distribution of originalPostedAt age buckets
 *
 * Outputs compact tables + sample IDs for each issue class. Never mutates.
 *
 * Run (PowerShell):
 *   .\scripts\run-prod-audit.ps1
 *
 * Or direct (bash/git-bash):
 *   DATABASE_URL=$(grep ^PROD_DATABASE_URL= .env.prod | cut -d= -f2-) \
 *     npx tsx scripts/audit-catalog-quality.ts > tmp/catalog-audit.log 2>&1
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { classifyRelevance } from '@/lib/utils/job-filter';

const NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

function fmtPct(n: number, d: number): string {
    if (d === 0) return '0%';
    return `${((n / d) * 100).toFixed(1)}%`;
}

function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function section1Volume(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('SECTION 1 — VOLUME');
    console.log('═'.repeat(80));

    const totalActive = await prisma.job.count({ where: { isPublished: true } });
    const totalAll = await prisma.job.count();
    console.log(`Total jobs in DB: ${totalAll}`);
    console.log(`Currently published: ${totalActive}`);
    console.log();

    // By source — published only
    const bySource = await prisma.job.groupBy({
        by: ['sourceProvider'],
        where: { isPublished: true },
        _count: true,
    });
    bySource.sort((a, b) => b._count - a._count);
    console.log('Per source (published only):');
    console.log('  source                       count    %catalog');
    console.log('  ─'.repeat(55));
    for (const r of bySource) {
        const src = (r.sourceProvider ?? '(null)').padEnd(28);
        console.log(`  ${src} ${String(r._count).padStart(6)}    ${fmtPct(r._count, totalActive)}`);
    }
    console.log();

    // Added per day (last 30 days)
    const cutoff = new Date(NOW.getTime() - 30 * DAY_MS);
    const recent = await prisma.job.findMany({
        where: { createdAt: { gte: cutoff } },
        select: { createdAt: true, sourceProvider: true, isPublished: true },
    });
    const byDay = new Map<string, { added: number; published: number; bySource: Map<string, number> }>();
    for (const j of recent) {
        const day = isoDay(j.createdAt);
        let agg = byDay.get(day);
        if (!agg) {
            agg = { added: 0, published: 0, bySource: new Map() };
            byDay.set(day, agg);
        }
        agg.added++;
        if (j.isPublished) agg.published++;
        const src = j.sourceProvider ?? '(null)';
        agg.bySource.set(src, (agg.bySource.get(src) ?? 0) + 1);
    }
    const days = [...byDay.keys()].sort().reverse();
    console.log('Per day (last 30 days, all sources):');
    console.log('  date          added  published');
    console.log('  ─'.repeat(40));
    for (const d of days.slice(0, 30)) {
        const agg = byDay.get(d)!;
        console.log(`  ${d}    ${String(agg.added).padStart(5)}    ${String(agg.published).padStart(5)}`);
    }
    console.log();

    // Per source per day matrix (last 7 days)
    console.log('Per source per day (last 7 days):');
    const lastWeek = days.slice(0, 7);
    const allSources = [...new Set(recent.map((j) => j.sourceProvider ?? '(null)'))].sort();
    const header = '  date          ' + allSources.map((s) => s.slice(0, 10).padStart(10)).join(' ');
    console.log(header);
    console.log('  ─'.repeat(header.length));
    for (const d of lastWeek) {
        const agg = byDay.get(d)!;
        const row = '  ' + d + '    ' + allSources.map((s) => String(agg.bySource.get(s) ?? 0).padStart(10)).join(' ');
        console.log(row);
    }
    console.log();
}

async function section2RelevanceBugs(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('SECTION 2 — RELEVANCE BUGS (jobs that shouldn\'t be in a PMHNP catalog)');
    console.log('═'.repeat(80));

    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true,
            slug: true,
            title: true,
            employer: true,
            description: true,
            sourceProvider: true,
            createdAt: true,
        },
    });
    let totalChecked = jobs.length;
    let failed = 0;
    const byReason: Record<string, { count: number; samples: Array<{ slug: string; title: string; employer: string; source: string }> }> = {};

    for (const j of jobs) {
        const result = classifyRelevance(j.title ?? '', j.description ?? '', j.employer ?? '');
        if (!result.passes) {
            failed++;
            const reason = result.reason;
            const bucket = byReason[reason] ?? { count: 0, samples: [] };
            bucket.count++;
            if (bucket.samples.length < 8) {
                bucket.samples.push({
                    slug: j.slug ?? '(no-slug)',
                    title: j.title ?? '(no-title)',
                    employer: j.employer ?? '(no-employer)',
                    source: j.sourceProvider ?? '(null)',
                });
            }
            byReason[reason] = bucket;
        }
    }

    console.log(`Checked ${totalChecked} published jobs`);
    console.log(`Failed isRelevantJob: ${failed} (${fmtPct(failed, totalChecked)})`);
    console.log();
    const sortedReasons = Object.entries(byReason).sort((a, b) => b[1].count - a[1].count);
    for (const [reason, bucket] of sortedReasons) {
        console.log(`─── ${reason}: ${bucket.count} jobs ───`);
        for (const s of bucket.samples) {
            console.log(`  [${s.source.padEnd(18)}] ${s.title.slice(0, 70)}`);
            console.log(`     ${s.employer.slice(0, 50).padEnd(50)} /jobs/${s.slug}`);
        }
        console.log();
    }
}

async function section3SchemaIssues(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('SECTION 3 — SCHEMA ISSUES');
    console.log('═'.repeat(80));

    // Null / empty required fields
    // title and employer are NOT NULL in Prisma schema → only empty-string check.
    const nullTitle = await prisma.job.count({ where: { isPublished: true, title: '' } });
    const nullEmployer = await prisma.job.count({ where: { isPublished: true, employer: '' } });
    // applyLink NULL is OK for employer-posted jobs IFF they have an
    // EmployerJob.contactEmail (apply-by-email flow). Only flag aggregated
    // (sourceProvider != null) rows or employer-posted rows missing BOTH.
    const nullApplyAggregated = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true
          AND source_provider IS NOT NULL
          AND (apply_link IS NULL OR apply_link = '')
    `;
    const nullApplyEmployerNoContact = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM jobs j
        LEFT JOIN employer_jobs ej ON ej.job_id = j.id
        WHERE j.is_published = true
          AND j.source_provider IS NULL
          AND (j.apply_link IS NULL OR j.apply_link = '')
          AND (ej.contact_email IS NULL OR ej.contact_email = '')
    `;
    const nullSlug = await prisma.job.count({ where: { isPublished: true, OR: [{ slug: null }, { slug: '' }] } });
    const nullOrigPosted = await prisma.job.count({ where: { isPublished: true, originalPostedAt: null } });
    const nullExpires = await prisma.job.count({ where: { isPublished: true, expiresAt: null } });

    console.log('Null / empty required fields (published jobs):');
    console.log(`  title (empty):                                 ${nullTitle}`);
    console.log(`  employer (empty):                              ${nullEmployer}`);
    console.log(`  applyLink missing on aggregated job (BUG):     ${nullApplyAggregated[0]?.count ?? 0n}`);
    console.log(`  applyLink AND contactEmail both missing (BUG): ${nullApplyEmployerNoContact[0]?.count ?? 0n}`);
    console.log(`  slug:                                          ${nullSlug}`);
    console.log(`  originalPostedAt:                              ${nullOrigPosted}`);
    console.log(`  expiresAt:                                     ${nullExpires}`);
    console.log();

    // Salary inversions
    const salaryInverted = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true
          AND min_salary IS NOT NULL
          AND max_salary IS NOT NULL
          AND min_salary > max_salary
    `;
    console.log(`Salary min > max:    ${salaryInverted[0]?.count ?? 0n}`);

    // Suspicious salary outliers (annual > $500k for non-physician role, or < $20k)
    const salaryOutliers = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true
          AND normalized_max_salary IS NOT NULL
          AND (normalized_max_salary > 500000 OR normalized_min_salary < 20000)
    `;
    console.log(`Salary outliers (>$500k or <$20k):  ${salaryOutliers[0]?.count ?? 0n}`);

    // expiresAt in the past but still published
    const expiredButPublished = await prisma.job.count({
        where: { isPublished: true, expiresAt: { lt: NOW } },
    });
    console.log(`expiresAt in past but isPublished=true:  ${expiredButPublished}`);

    // originalPostedAt > 60 days but still published
    const cutoff60 = new Date(NOW.getTime() - 60 * DAY_MS);
    const aged60 = await prisma.job.count({
        where: { isPublished: true, originalPostedAt: { lt: cutoff60 } },
    });
    console.log(`originalPostedAt > 60 days but published: ${aged60}`);

    // Duplicate slugs
    const dupSlugs = await prisma.$queryRaw<Array<{ slug: string; count: bigint }>>`
        SELECT slug, count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true AND slug IS NOT NULL
        GROUP BY slug
        HAVING count(*) > 1
        ORDER BY count(*) DESC
        LIMIT 20
    `;
    console.log(`Duplicate slugs (published, top 20):  ${dupSlugs.length}`);
    for (const r of dupSlugs.slice(0, 10)) {
        console.log(`  ${r.slug} → ${r.count}`);
    }
    console.log();

    // Same externalId across providers — should be unique by (externalId, source)
    const idCollisions = await prisma.$queryRaw<Array<{ external_id: string; count: bigint }>>`
        SELECT external_id, count(DISTINCT source_provider)::bigint AS count
        FROM jobs
        WHERE external_id IS NOT NULL AND is_published = true
        GROUP BY external_id
        HAVING count(DISTINCT source_provider) > 1
        LIMIT 10
    `;
    console.log(`externalId shared across multiple providers: ${idCollisions.length}`);
    for (const r of idCollisions) {
        console.log(`  ${r.external_id}`);
    }
    console.log();

    // Invalid stateCode (not 2-letter or not US state)
    const validStates = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP']);
    const stateRows = await prisma.job.findMany({
        where: { isPublished: true, stateCode: { not: null } },
        select: { stateCode: true },
    });
    const badStateCounts = new Map<string, number>();
    for (const r of stateRows) {
        const code = r.stateCode!;
        if (code.length !== 2 || !validStates.has(code.toUpperCase())) {
            badStateCounts.set(code, (badStateCounts.get(code) ?? 0) + 1);
        }
    }
    console.log(`Bad stateCode values (not valid US 2-letter):  ${[...badStateCounts.values()].reduce((a, b) => a + b, 0)} jobs across ${badStateCounts.size} distinct codes`);
    [...badStateCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`  "${k}" → ${v}`));
    console.log();

    // Bad applyLink hosts (e.g. localhost, ip, missing protocol)
    const badUrls = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true
          AND apply_link IS NOT NULL
          AND (
            apply_link !~* '^https?://'
            OR apply_link ~* 'localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0'
          )
    `;
    console.log(`Malformed applyLink (non-http or localhost):  ${badUrls[0]?.count ?? 0n}`);
    console.log();

    // Employer-posted vs aggregated breakdown (for context)
    const employerPosted = await prisma.job.count({ where: { isPublished: true, sourceProvider: null } });
    const aggregated = await prisma.job.count({ where: { isPublished: true, NOT: { sourceProvider: null } } });
    console.log(`Employer-posted published:  ${employerPosted}`);
    console.log(`Aggregated published:       ${aggregated}`);
    console.log();

    // Employer normalization candidates — same employer with different casing/whitespace
    const employerVariants = await prisma.$queryRaw<Array<{ canonical: string; variants: bigint; total_jobs: bigint }>>`
        SELECT
            LOWER(REGEXP_REPLACE(TRIM(employer), '\\s+', ' ', 'g')) AS canonical,
            count(DISTINCT employer)::bigint AS variants,
            count(*)::bigint AS total_jobs
        FROM jobs
        WHERE is_published = true AND employer IS NOT NULL
        GROUP BY canonical
        HAVING count(DISTINCT employer) > 1
        ORDER BY count(DISTINCT employer) DESC, count(*) DESC
        LIMIT 15
    `;
    console.log(`Employers with multiple casing/whitespace variants (top 15):`);
    for (const r of employerVariants) {
        console.log(`  "${r.canonical}" → ${r.variants} variants, ${r.total_jobs} jobs`);
    }
    console.log();
}

async function section4SeoIssues(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('SECTION 4 — SEO ISSUES');
    console.log('═'.repeat(80));

    // Short descriptions (low SEO + low completeness)
    const descBuckets = await prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT
            CASE
                WHEN description IS NULL THEN 'a_null'
                WHEN LENGTH(description) = 0 THEN 'b_empty'
                WHEN LENGTH(description) < 200 THEN 'c_<200_chars'
                WHEN LENGTH(description) < 500 THEN 'd_200-500'
                WHEN LENGTH(description) < 1000 THEN 'e_500-1k'
                WHEN LENGTH(description) < 2000 THEN 'f_1-2k'
                ELSE 'g_>2k'
            END AS bucket,
            count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true
        GROUP BY bucket
        ORDER BY bucket
    `;
    console.log('Description length distribution (published):');
    for (const r of descBuckets) {
        console.log(`  ${r.bucket.replace(/^[a-g]_/, '').padEnd(15)} ${String(r.count).padStart(7)}`);
    }
    console.log();

    // descriptionSummary missing (needed for meta description SEO)
    const noSummary = await prisma.job.count({
        where: { isPublished: true, OR: [{ descriptionSummary: null }, { descriptionSummary: '' }] },
    });
    console.log(`descriptionSummary missing (meta description SEO):  ${noSummary}`);

    // Missing location signals (city/state combo)
    const noCity = await prisma.job.count({
        where: { isPublished: true, city: null, isRemote: false },
    });
    const noState = await prisma.job.count({
        where: { isPublished: true, stateCode: null, isRemote: false },
    });
    console.log(`No city (non-remote):    ${noCity}`);
    console.log(`No stateCode (non-remote): ${noState}`);

    // Missing salary (hurts ranking + structured data)
    const noSalary = await prisma.job.count({
        where: { isPublished: true, normalizedMinSalary: null, normalizedMaxSalary: null },
    });
    console.log(`No salary (no min and no max):  ${noSalary}`);
    console.log();

    // qualityScore distribution
    const qBuckets = await prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT
            CASE
                WHEN quality_score < 10 THEN 'a_<10'
                WHEN quality_score < 20 THEN 'b_10-19'
                WHEN quality_score < 30 THEN 'c_20-29'
                WHEN quality_score < 40 THEN 'd_30-39'
                WHEN quality_score < 50 THEN 'e_40-49'
                WHEN quality_score < 70 THEN 'f_50-69'
                ELSE 'g_70+'
            END AS bucket,
            count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true
        GROUP BY bucket
        ORDER BY bucket
    `;
    console.log('qualityScore distribution (published):');
    for (const r of qBuckets) {
        console.log(`  ${r.bucket.replace(/^[a-g]_/, '').padEnd(8)} ${String(r.count).padStart(7)}`);
    }
    console.log();

    // Slug quality
    const longSlugs = await prisma.job.count({
        where: { isPublished: true, slug: { not: null } },
    });
    const slugStats = await prisma.$queryRaw<Array<{ avg: number; max: number; over_80: bigint }>>`
        SELECT
            AVG(LENGTH(slug))::float AS avg,
            MAX(LENGTH(slug))::int AS max,
            COUNT(*) FILTER (WHERE LENGTH(slug) > 80)::bigint AS over_80
        FROM jobs
        WHERE is_published = true AND slug IS NOT NULL
    `;
    if (slugStats[0]) {
        console.log(`Slug stats (${longSlugs} published):`);
        console.log(`  avg length: ${Math.round(slugStats[0].avg)}`);
        console.log(`  max length: ${slugStats[0].max}`);
        console.log(`  > 80 chars (URL-quality concern): ${slugStats[0].over_80}`);
    }
    console.log();

    // Same applyLink across many jobs (canonical-conflict / duplicate)
    const dupApply = await prisma.$queryRaw<Array<{ apply_link: string; count: bigint }>>`
        SELECT apply_link, count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true AND apply_link IS NOT NULL
        GROUP BY apply_link
        HAVING count(*) > 1
        ORDER BY count(*) DESC
        LIMIT 10
    `;
    console.log(`Same applyLink shared across multiple published jobs (top 10):`);
    for (const r of dupApply) {
        console.log(`  ${r.apply_link.slice(0, 100)} → ${r.count}`);
    }
    console.log();
}

async function section5Freshness(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('SECTION 5 — FRESHNESS');
    console.log('═'.repeat(80));
    const buckets = await prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT
            CASE
                WHEN original_posted_at IS NULL THEN 'a_null'
                WHEN original_posted_at >= NOW() - INTERVAL '1 day' THEN 'b_0-1d'
                WHEN original_posted_at >= NOW() - INTERVAL '3 days' THEN 'c_1-3d'
                WHEN original_posted_at >= NOW() - INTERVAL '7 days' THEN 'd_3-7d'
                WHEN original_posted_at >= NOW() - INTERVAL '14 days' THEN 'e_7-14d'
                WHEN original_posted_at >= NOW() - INTERVAL '30 days' THEN 'f_14-30d'
                WHEN original_posted_at >= NOW() - INTERVAL '60 days' THEN 'g_30-60d'
                ELSE 'h_>60d'
            END AS bucket,
            count(*)::bigint AS count
        FROM jobs
        WHERE is_published = true
        GROUP BY bucket
        ORDER BY bucket
    `;
    console.log('originalPostedAt age distribution (published):');
    for (const r of buckets) {
        console.log(`  ${r.bucket.replace(/^[a-h]_/, '').padEnd(10)} ${String(r.count).padStart(7)}`);
    }
    console.log();
}

async function main(): Promise<void> {
    console.log(`Catalog quality audit — ${NOW.toISOString()}`);
    console.log();
    await section1Volume();
    await section2RelevanceBugs();
    await section3SchemaIssues();
    await section4SeoIssues();
    await section5Freshness();
    await prisma.$disconnect();
    console.log('\nDone.');
}

main().catch((err) => {
    console.error('Audit crashed:', err);
    process.exit(1);
});
