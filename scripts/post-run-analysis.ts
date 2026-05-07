/**
 * Post-ingestion forensics. Reads the dev DB after a full run and
 * answers:
 *   - per-source funnel (fetched / added / dup / rejected by reason)
 *   - per-source field completeness (% non-null for each schema field)
 *   - originalPostedAt distribution buckets
 *   - PMHNP-relevance check on TODAY's added rows using the real
 *     classifyRelevance function
 *   - sample of added rows per source
 */
import 'dotenv/config';

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { classifyRelevance } = await import('@/lib/utils/job-filter');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    console.log(`\n=== POST-RUN ANALYSIS (UTC ${today.toISOString().slice(0, 10)}, dev DB) ===\n`);

    // 1. Per-source funnel — today's source_stats row
    console.log('--- 1. PER-SOURCE FUNNEL (source_stats, today) ---');
    const funnel = await prisma.sourceStats.findMany({
        where: { date: today },
        orderBy: { jobsFetched: 'desc' },
    });
    console.log('source                fetched   added   dup    rejected   avgQ');
    for (const r of funnel) {
        const q = r.avgQualityScore != null ? r.avgQualityScore.toFixed(0) : '-';
        console.log(
            `  ${r.source.padEnd(20)} ${String(r.jobsFetched).padStart(6)}  ${String(r.jobsAdded).padStart(5)}  ${String(r.jobsDuplicate).padStart(5)}  ${String(r.jobsRejected).padStart(8)}  ${q.padStart(4)}`,
        );
    }

    // Sub-bucket per-source rejection reasons (today)
    console.log('\n--- 2. REJECTION REASONS BY SOURCE (today) ---');
    const rej = await prisma.$queryRawUnsafe<Array<{ source: string; reason: string; n: bigint }>>(`
    SELECT source_provider as source, rejection_reason as reason, COUNT(*)::bigint as n
    FROM rejected_jobs
    WHERE created_at >= $1
    GROUP BY source_provider, rejection_reason
    ORDER BY source_provider, n DESC
  `, today);
    let curSource = '';
    for (const r of rej) {
        if (r.source !== curSource) {
            console.log(`\n  ${r.source}:`);
            curSource = r.source;
        }
        console.log(`    ${r.reason.padEnd(35)} ${String(r.n).padStart(5)}`);
    }

    // 3. Per-source field completeness for jobs added TODAY
    console.log('\n--- 3. FIELD COMPLETENESS (jobs added today) ---');
    const sources = funnel.map((f) => f.source);
    for (const src of sources) {
        const stats = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(`
      SELECT COUNT(*)::bigint AS total,
        SUM(CASE WHEN title IS NOT NULL AND title <> '' THEN 1 ELSE 0 END)::bigint AS title,
        SUM(CASE WHEN employer IS NOT NULL AND employer <> '' THEN 1 ELSE 0 END)::bigint AS employer,
        SUM(CASE WHEN location IS NOT NULL AND location <> '' THEN 1 ELSE 0 END)::bigint AS location,
        SUM(CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END)::bigint AS city,
        SUM(CASE WHEN state IS NOT NULL THEN 1 ELSE 0 END)::bigint AS state,
        SUM(CASE WHEN description IS NOT NULL AND description <> '' THEN 1 ELSE 0 END)::bigint AS description,
        SUM(CASE WHEN description_summary IS NOT NULL AND description_summary <> '' THEN 1 ELSE 0 END)::bigint AS desc_summary,
        SUM(CASE WHEN apply_link IS NOT NULL AND apply_link <> '' THEN 1 ELSE 0 END)::bigint AS apply_link,
        SUM(CASE WHEN min_salary IS NOT NULL THEN 1 ELSE 0 END)::bigint AS min_salary,
        SUM(CASE WHEN max_salary IS NOT NULL THEN 1 ELSE 0 END)::bigint AS max_salary,
        SUM(CASE WHEN job_type IS NOT NULL THEN 1 ELSE 0 END)::bigint AS job_type,
        SUM(CASE WHEN mode IS NOT NULL THEN 1 ELSE 0 END)::bigint AS mode,
        SUM(CASE WHEN experience_level IS NOT NULL THEN 1 ELSE 0 END)::bigint AS exp_level,
        SUM(CASE WHEN clinical_setting IS NOT NULL THEN 1 ELSE 0 END)::bigint AS setting,
        SUM(CASE WHEN patient_population IS NOT NULL THEN 1 ELSE 0 END)::bigint AS population,
        SUM(CASE WHEN array_length(benefits, 1) > 0 THEN 1 ELSE 0 END)::bigint AS benefits,
        SUM(CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END)::bigint AS company_id,
        SUM(CASE WHEN slug IS NOT NULL THEN 1 ELSE 0 END)::bigint AS slug,
        SUM(CASE WHEN quality_score > 0 THEN 1 ELSE 0 END)::bigint AS quality_score
      FROM jobs WHERE source_provider = $1 AND created_at >= $2
    `, src, today);
        const s = stats[0];
        if (!s) continue;
        const tot = Number(s.total);
        if (tot === 0) continue;
        const pct = (n: bigint) => ((Number(n) / tot) * 100).toFixed(0).padStart(3);
        console.log(`\n  ${src} (${tot} added):`);
        console.log(`    title:${pct(s.title)}%  employer:${pct(s.employer)}%  location:${pct(s.location)}%  city:${pct(s.city)}%  state:${pct(s.state)}%`);
        console.log(`    description:${pct(s.description)}%  desc_summary:${pct(s.desc_summary)}%  apply_link:${pct(s.apply_link)}%`);
        console.log(`    min_salary:${pct(s.min_salary)}%  max_salary:${pct(s.max_salary)}%  job_type:${pct(s.job_type)}%  mode:${pct(s.mode)}%`);
        console.log(`    exp_level:${pct(s.exp_level)}%  setting:${pct(s.setting)}%  population:${pct(s.population)}%  benefits:${pct(s.benefits)}%`);
        console.log(`    company_id:${pct(s.company_id)}%  slug:${pct(s.slug)}%  quality_score:${pct(s.quality_score)}%`);
    }

    // 4. originalPostedAt freshness buckets per source
    console.log('\n--- 4. originalPostedAt DISTRIBUTION (jobs added today) ---');
    for (const src of sources) {
        const buckets = await prisma.$queryRawUnsafe<Array<{ bucket: string; n: bigint }>>(`
      SELECT
        CASE
          WHEN original_posted_at IS NULL THEN 'null'
          WHEN original_posted_at >= NOW() - INTERVAL '1 day' THEN '<1d'
          WHEN original_posted_at >= NOW() - INTERVAL '7 days' THEN '1-7d'
          WHEN original_posted_at >= NOW() - INTERVAL '30 days' THEN '7-30d'
          WHEN original_posted_at >= NOW() - INTERVAL '60 days' THEN '30-60d'
          ELSE '>60d'
        END AS bucket,
        COUNT(*)::bigint AS n
      FROM jobs
      WHERE source_provider = $1 AND created_at >= $2
      GROUP BY bucket
      ORDER BY MIN(original_posted_at) DESC NULLS LAST
    `, src, today);
        if (buckets.length === 0) continue;
        const line = buckets.map((b) => `${b.bucket}=${b.n}`).join('  ');
        console.log(`  ${src.padEnd(20)} ${line}`);
    }

    // 5. PMHNP relevance check on TODAY's added rows
    console.log('\n--- 5. PMHNP RELEVANCE (jobs added today) ---');
    const addedToday = await prisma.job.findMany({
        where: { createdAt: { gte: today } },
        select: { sourceProvider: true, title: true, description: true, employer: true },
    });
    const relBySrc = new Map<string, { passes: number; reasons: Map<string, number> }>();
    for (const j of addedToday) {
        const src = j.sourceProvider ?? '(none)';
        const cur = relBySrc.get(src) ?? { passes: 0, reasons: new Map() };
        const r = classifyRelevance(j.title ?? '', j.description ?? '', j.employer ?? '');
        if (r.passes) cur.passes++;
        else cur.reasons.set(r.reason, (cur.reasons.get(r.reason) ?? 0) + 1);
        relBySrc.set(src, cur);
    }
    console.log('source                added   PMHNP-pass   non-PMHNP (reason)');
    for (const [src, c] of [...relBySrc.entries()].sort()) {
        const total = c.passes + [...c.reasons.values()].reduce((s, n) => s + n, 0);
        const reasonStr = [...c.reasons.entries()].map(([r, n]) => `${r}=${n}`).join(', ') || '—';
        console.log(`  ${src.padEnd(20)} ${String(total).padStart(5)}   ${String(c.passes).padStart(5)}        ${reasonStr}`);
    }

    // 6. Sample 3 newly-added rows per source
    console.log('\n--- 6. SAMPLE ROWS (3 random per source, added today) ---');
    for (const src of sources) {
        const samples = await prisma.$queryRawUnsafe<Array<{ title: string; employer: string; original_posted_at: Date | null; description: string | null; min_salary: number | null; mode: string | null; job_type: string | null }>>(`
      SELECT title, employer, original_posted_at, description, min_salary, mode, job_type
      FROM jobs
      WHERE source_provider = $1 AND created_at >= $2
      ORDER BY RANDOM()
      LIMIT 3
    `, src, today);
        if (samples.length === 0) continue;
        console.log(`\n  ${src}:`);
        for (const s of samples) {
            const dlen = s.description?.length ?? 0;
            console.log(`    ${s.title.slice(0, 55)}  /  ${s.employer.slice(0, 30)}`);
            console.log(`      posted=${s.original_posted_at?.toISOString().slice(0, 10)}  desc=${dlen}ch  mode=${s.mode ?? '-'}  jobType=${s.job_type ?? '-'}  minSal=${s.min_salary ?? '-'}`);
        }
    }

    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
