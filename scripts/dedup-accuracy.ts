/**
 * Sharper dedup-accuracy audit. Answers two questions the user cares about:
 *
 *   1. Of the "95% dup rate" claim, how much is unambiguous (Strategy 1
 *      exact-externalId match — same job returned by source twice) vs
 *      ambiguous (fuzzy / apply_url / exact_title across-source)?
 *
 *   2. Of the AMBIGUOUS classifications, how often is the "matched" job
 *      truly the same posting? Spot-check 50 random fuzzy + 50 random
 *      apply_url + 50 random exact_title and present the side-by-side.
 *
 * Read-only.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const SAMPLE_SIZE = 30;

async function main() {
    const { prisma } = await import('@/lib/prisma');
    console.log('\n--- DEDUP ACCURACY DEEP-DIVE — LAST 7d ---\n');

    // 1. Funnel by source
    const stats = await prisma.$queryRawUnsafe<Array<{ source: string; fetched: bigint; added: bigint; dup: bigint }>>(`
    SELECT source, SUM(jobs_fetched)::bigint as fetched, SUM(jobs_added)::bigint as added, SUM(jobs_duplicate)::bigint as dup
    FROM source_stats
    WHERE date > CURRENT_DATE - INTERVAL '7 days'
    GROUP BY source
    ORDER BY fetched DESC
  `);
    console.log('Funnel (last 7d):');
    console.log('  source                    fetched   added    dup    dup% of (added+dup)');
    for (const s of stats) {
        const fetched = Number(s.fetched);
        const added = Number(s.added);
        const dup = Number(s.dup);
        const denom = added + dup;
        const dupPct = denom > 0 ? ((dup / denom) * 100).toFixed(1) : '—';
        const fetchedRejPct = fetched > 0 ? ((1 - (added + dup) / fetched) * 100).toFixed(1) : '—';
        console.log(
            `  ${s.source.padEnd(20)} ${String(fetched).padStart(8)} ${String(added).padStart(7)} ${String(dup).padStart(7)}     ${dupPct}%   (pre-dedup reject ${fetchedRejPct}%)`,
        );
    }
    console.log();

    // 2. Dup match-type breakdown (last 7d) + per-source
    const byType = await prisma.$queryRawUnsafe<Array<{ source_provider: string; rejection_reason: string; n: bigint }>>(`
    SELECT source_provider, rejection_reason, COUNT(*)::bigint as n
    FROM rejected_jobs
    WHERE rejection_reason LIKE 'duplicate_%'
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY source_provider, rejection_reason
    ORDER BY source_provider, n DESC
  `);
    console.log('Dup classifications by source × type (last 7d):');
    const grouped = new Map<string, Map<string, number>>();
    for (const r of byType) {
        if (!grouped.has(r.source_provider)) grouped.set(r.source_provider, new Map());
        grouped.get(r.source_provider)!.set(r.rejection_reason, Number(r.n));
    }
    for (const [src, types] of grouped) {
        const total = [...types.values()].reduce((a, b) => a + b, 0);
        const id = (types.get('duplicate_externalid') ?? 0) + (types.get('duplicate_exact_id') ?? 0);
        const fuzzy = types.get('duplicate_fuzzy_title') ?? 0;
        const url = types.get('duplicate_apply_url') ?? 0;
        const title = types.get('duplicate_exact_title') ?? 0;
        const idPct = total > 0 ? ((id / total) * 100).toFixed(0) : '—';
        const ambig = fuzzy + url + title;
        const ambigPct = total > 0 ? ((ambig / total) * 100).toFixed(0) : '—';
        console.log(
            `  ${src.padEnd(20)} total=${total.toString().padStart(5)}  exactId=${id.toString().padStart(5)} (${idPct}%)  fuzzy/url/title=${ambig.toString().padStart(4)} (${ambigPct}%)`,
        );
    }
    console.log();

    // 3. Spot-check the AMBIGUOUS classifications: are the matches real?
    const targets: Array<{ kind: string; reason: string }> = [
        { kind: 'fuzzy_title', reason: 'duplicate_fuzzy_title' },
        { kind: 'exact_title', reason: 'duplicate_exact_title' },
        { kind: 'apply_url', reason: 'duplicate_apply_url' },
    ];
    for (const t of targets) {
        const samples = await prisma.$queryRawUnsafe<Array<{ id: string; title: string; employer: string; location: string; apply_link: string | null; raw_data: any }>>(`
      SELECT id, title, employer, location, apply_link, raw_data
      FROM rejected_jobs
      WHERE rejection_reason = '${t.reason}'
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY RANDOM()
      LIMIT ${SAMPLE_SIZE}
    `);
        console.log(`\n[${t.kind}] random ${samples.length} samples — judge accuracy by side-by-side:`);
        let truePositive = 0;
        let suspicious = 0;
        for (const r of samples) {
            const matched = r.raw_data?.matchedJobId;
            if (!matched) continue;
            const j = await prisma.job.findUnique({
                where: { id: matched },
                select: { title: true, employer: true, location: true, applyLink: true },
            });
            if (!j) {
                suspicious++;
                continue;
            }
            // Heuristic flag: titles look very different (Levenshtein-ish)
            const sameTitle = r.title.toLowerCase().slice(0, 30) === (j.title ?? '').toLowerCase().slice(0, 30);
            const sameEmp = (r.employer ?? '').toLowerCase().slice(0, 20) === (j.employer ?? '').toLowerCase().slice(0, 20);
            if (sameTitle && sameEmp) truePositive++;
            else suspicious++;
        }
        const accPct = samples.length > 0 ? ((truePositive / samples.length) * 100).toFixed(0) : '—';
        console.log(`  → looks-like-same-job (title30 + emp20 prefix match): ${truePositive}/${samples.length} (${accPct}%)`);
        console.log(`  → suspicious / different: ${suspicious}/${samples.length}`);

        // Show 5 suspicious cases for human eyeball
        if (suspicious > 0) {
            console.log(`  Suspicious examples:`);
            let shown = 0;
            for (const r of samples) {
                if (shown >= 5) break;
                const matched = r.raw_data?.matchedJobId;
                if (!matched) continue;
                const j = await prisma.job.findUnique({
                    where: { id: matched },
                    select: { title: true, employer: true, location: true, applyLink: true },
                });
                if (!j) continue;
                const sameTitle = r.title.toLowerCase().slice(0, 30) === (j.title ?? '').toLowerCase().slice(0, 30);
                const sameEmp = (r.employer ?? '').toLowerCase().slice(0, 20) === (j.employer ?? '').toLowerCase().slice(0, 20);
                if (sameTitle && sameEmp) continue;
                shown++;
                console.log(`    REJECT: ${(r.employer ?? '').slice(0, 25)} / ${(r.title ?? '').slice(0, 50)} / ${(r.location ?? '').slice(0, 25)}`);
                console.log(`    MATCH→  ${(j.employer ?? '').slice(0, 25)} / ${(j.title ?? '').slice(0, 50)} / ${(j.location ?? '').slice(0, 25)}`);
                console.log();
            }
        }
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
