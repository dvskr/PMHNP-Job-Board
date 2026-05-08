/**
 * Backfill jobs missing addressRegion (stateCode/state) data.
 *
 * Why: Google JobPosting requires `addressRegion` for in-person roles. When
 * the parser stored only `addressLocality` (e.g. "Brentwood") with no state,
 * Google can't disambiguate (Brentwood TN vs Brentwood CA), so the posting
 * loses geo-targeting in Google Jobs city filters.
 *
 * Strategy:
 *   1. Find published jobs where stateCode IS NULL but city IS NOT NULL.
 *   2. For each, try to enrich state from CITIES (lib/pseo/city-data/cities.ts).
 *      - Exact city-name match → if uniquely identified to one state, update.
 *      - Multiple matches      → log as ambiguous, skip (needs human review).
 *      - No match              → skip.
 *   3. Output a CSV of changes (dry-run by default; --apply to write).
 *
 * Usage:
 *   npm run backfill:region                   # dry-run against PROD (default)
 *   npm run backfill:region -- --apply        # commit writes to PROD
 *   npm run backfill:region:dev               # dry-run against dev
 *   npm run backfill:region:dev -- --apply    # commit writes to dev
 */
import { config as dotenvConfig } from 'dotenv';

// ─── env selection (mirrors scripts/check-schema.ts pattern) ────────────────

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
    const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
    if (flag === 'dev' || flag === 'prod') return flag;
    if (process.argv.includes('--dev')) return 'dev';
    if (process.argv.includes('--prod')) return 'prod';
    return 'prod'; // safe default — dev DB usually has stale fixture data
}
const ENV: EnvKind = parseEnvFlag();
if (ENV === 'prod') {
    dotenvConfig({ path: '.env.prod' });
    if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
    }
    if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
        process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
    }
} else {
    dotenvConfig({ path: '.env' });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
import { CITIES } from '@/lib/pseo/city-data/cities';

interface CityMatch {
    state: string;
    stateCode: string;
}

const APPLY = process.argv.includes('--apply');

// Build city-name → [matches] index from CITIES.
function buildCityIndex(): Map<string, CityMatch[]> {
    const idx = new Map<string, CityMatch[]>();
    for (const c of CITIES) {
        const key = c.name.toLowerCase().trim();
        const existing = idx.get(key) ?? [];
        existing.push({ state: c.state, stateCode: c.stateCode });
        idx.set(key, existing);
    }
    return idx;
}

async function main() {
    console.log(`[backfill-state-region] env=${ENV}  mode: ${APPLY ? 'APPLY (writes will be made)' : 'DRY RUN (no writes)'}`);

    const cityIdx = buildCityIndex();

    // Pull jobs missing region data. We deliberately scope to currently-active
    // postings — old/expired rows aren't worth a write.
    const candidates = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            stateCode: null,
            city: { not: null },
            isRemote: false, // remote jobs don't need addressRegion per Google's spec
        },
        select: {
            id: true,
            title: true,
            employer: true,
            city: true,
            state: true,
            stateCode: true,
        },
        take: 5000, // hard cap; rerun for more
    });

    console.log(`[backfill-state-region] candidates: ${candidates.length}`);

    let resolved = 0;
    let ambiguous = 0;
    let unmatched = 0;
    const updates: Array<{ id: string; state: string; stateCode: string }> = [];

    for (const job of candidates) {
        const cityKey = (job.city ?? '').toLowerCase().trim();
        const matches = cityIdx.get(cityKey) ?? [];

        if (matches.length === 0) {
            unmatched++;
            continue;
        }

        if (matches.length === 1) {
            updates.push({ id: job.id, state: matches[0].state, stateCode: matches[0].stateCode });
            resolved++;
            continue;
        }

        // Multiple matches. If `state` is set but `stateCode` is missing,
        // we can still resolve uniquely by intersecting against `state`.
        if (job.state) {
            const filtered = matches.filter(
                (m) => m.state.toLowerCase() === job.state!.toLowerCase()
                    || m.stateCode === job.state,
            );
            if (filtered.length === 1) {
                updates.push({ id: job.id, state: filtered[0].state, stateCode: filtered[0].stateCode });
                resolved++;
                continue;
            }
        }

        ambiguous++;
        console.log(
            `[ambiguous] job=${job.id} city="${job.city}" state="${job.state ?? ''}" → matches: ` +
            matches.map((m) => `${m.state} (${m.stateCode})`).join(', '),
        );
    }

    console.log(`[backfill-state-region] resolved=${resolved} ambiguous=${ambiguous} unmatched=${unmatched}`);

    if (!APPLY) {
        console.log('[backfill-state-region] dry run — re-run with --apply to write the resolved updates.');
        return;
    }

    // Apply in batches to avoid one massive transaction.
    const BATCH = 100;
    for (let i = 0; i < updates.length; i += BATCH) {
        const slice = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            slice.map((u) =>
                prisma.job.update({
                    where: { id: u.id },
                    data: { state: u.state, stateCode: u.stateCode },
                }),
            ),
        );
        console.log(`[backfill-state-region] wrote ${i + slice.length}/${updates.length}`);
    }

    console.log('[backfill-state-region] done.');
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
