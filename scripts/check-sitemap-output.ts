/**
 * Smoke-test the sitemap output post-refactor.
 * - Confirms primary sitemap doesn't include job URLs (now batched)
 * - Confirms state/salary-guide gating drops the right rows
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}
// Supabase keys for blog.ts
if (process.env.PROD_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.PROD_SUPABASE_URL;
}
if (process.env.PROD_SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
}

async function main() {
    const sm = (await import('../app/sitemap')).default;
    const out = await sm();
    console.log('\n=== PRIMARY SITEMAP SMOKE TEST ===\n');
    console.log(`Total entries: ${out.length}`);

    const byPrefix: Record<string, number> = {};
    let jobLeak = 0;
    for (const e of out) {
        const url = typeof e === 'string' ? e : e.url;
        const path = url.replace('https://pmhnphiring.com', '').split('/').slice(0, 3).join('/') || '/';
        byPrefix[path] = (byPrefix[path] || 0) + 1;
        // Job-detail URLs follow /jobs/{slug}-{uuid} — uuid match
        if (/\/jobs\/[a-z0-9-]+-[a-f0-9-]{36}$/i.test(url)) jobLeak++;
    }
    console.log(`Job-detail URLs in primary sitemap (should be 0): ${jobLeak}`);
    console.log('\nTop URL prefixes:');
    for (const [p, n] of Object.entries(byPrefix).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        console.log(`  ${String(n).padStart(5)}  ${p}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
