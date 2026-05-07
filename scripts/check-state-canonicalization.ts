/**
 * Verify the sitemap state-gating slugify logic catches all active-job rows.
 *
 * Question: are there rows in `jobs` where `state` is stored as a 2-char code
 * ("WY") rather than the full name ("Wyoming")? If so, my slugify approach
 * (`state.toLowerCase().replace(/\s+/g, '-')`) won't produce the canonical
 * slug used in URLs ("wyoming"), and the state would be silently dropped
 * from the sitemap.
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

    const distinct = await prisma.$queryRawUnsafe<Array<{ state: string; n: bigint }>>(`
        SELECT state, COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = true
          AND (expires_at IS NULL OR expires_at > NOW())
          AND state IS NOT NULL
        GROUP BY state
        ORDER BY n DESC
    `);

    console.log('\n=== DISTINCT state VALUES IN active jobs ===\n');
    let codeOnly = 0;
    let fullName = 0;
    let weird = 0;
    for (const r of distinct) {
        const len = r.state.length;
        const flag = len === 2 ? '🚨 code-only' : len > 4 ? '   full-name' : '⚠️  weird';
        if (len === 2) codeOnly += Number(r.n);
        else if (len > 4) fullName += Number(r.n);
        else weird += Number(r.n);
        console.log(`  ${flag}  ${String(r.n).padStart(4)}  "${r.state}"`);
    }
    console.log(`\nTotals: full-name=${fullName}  code-only=${codeOnly}  weird=${weird}`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
