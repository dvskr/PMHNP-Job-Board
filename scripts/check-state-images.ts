/**
 * Build-time validator: every US-state slug we render in /jobs/state/[slug],
 * /jobs/locations, /resources, etc. must have a corresponding webp file
 * at `images/states/{slug}.webp` in the Supabase `site-assets` bucket.
 *
 * Why: SEO Fix M20. The audit found `district-of-columbia.webp` was 404 in
 * Supabase, breaking 5 components. The fix in Phase A added a runtime
 * onError fallback (StateImage), but the underlying asset gap is the
 * real bug. This script catches the gap at CI time so missing assets
 * don't ship to prod silently.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register --project scripts/tsconfig.json \
 *     scripts/check-state-images.ts
 *
 * Exit codes:
 *   0 — all states have a webp
 *   1 — at least one state is missing a webp (CI fails)
 *
 * Wire into CI before deploy:
 *   "predeploy": "ts-node ... scripts/check-state-images.ts"
 *
 * Override the bucket via SUPABASE_STATE_IMAGE_BASE env if it ever moves.
 */
import 'dotenv/config';

const STATE_IMAGE_BASE =
    process.env.SUPABASE_STATE_IMAGE_BASE
    || 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/states';

// Match app/sitemap.ts US_STATES exactly so this validator stays in lockstep
// with what the sitemap declares as indexable.
const US_STATE_SLUGS = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
    'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
    'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
    'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
    'new-hampshire', 'new-jersey', 'new-mexico', 'new-york',
    'north-carolina', 'north-dakota', 'ohio', 'oklahoma', 'oregon',
    'pennsylvania', 'rhode-island', 'south-carolina', 'south-dakota',
    'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
    'west-virginia', 'wisconsin', 'wyoming', 'district-of-columbia',
];

async function checkOne(slug: string): Promise<{ slug: string; ok: boolean; status: number }> {
    const url = `${STATE_IMAGE_BASE}/${slug}.webp`;
    try {
        const res = await fetch(url, { method: 'HEAD' });
        return { slug, ok: res.ok, status: res.status };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[check-state-images] HEAD ${url} threw: ${message}`);
        return { slug, ok: false, status: 0 };
    }
}

async function main() {
    console.log(`[check-state-images] checking ${US_STATE_SLUGS.length} state webps at ${STATE_IMAGE_BASE}`);
    const results = await Promise.all(US_STATE_SLUGS.map(checkOne));
    const missing = results.filter((r) => !r.ok);

    if (missing.length === 0) {
        console.log(`[check-state-images] all ${US_STATE_SLUGS.length} state images present.`);
        return;
    }

    console.error(`[check-state-images] MISSING (${missing.length}):`);
    for (const r of missing) {
        console.error(`  - ${r.slug}.webp  (HTTP ${r.status})`);
    }
    console.error('');
    console.error('Upload the missing webps to the Supabase site-assets bucket');
    console.error(`under  images/states/{slug}.webp  to fix.`);
    process.exit(1);
}

main().catch((err) => {
    console.error('[check-state-images] unexpected failure:', err);
    process.exit(1);
});
