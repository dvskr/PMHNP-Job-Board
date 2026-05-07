/**
 * Audit hosts that return 403 to our probe so we can decide whether to
 * skip probing them entirely (some ATS providers block anonymous probes
 * but the listing is fine for users).
 *
 * 7,257 inconclusive_403s / week is high enough to justify a per-host
 * bypass rule if a few hosts dominate the distribution.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    console.log('\n--- inconclusive_403 HOST DISTRIBUTION (last 7d) ---\n');

    // Extract host directly in SQL so we don't lose volume to GROUP-BY-URL fragmentation.
    const rows = await prisma.$queryRawUnsafe<Array<{ host: string; n: bigint }>>(`
    SELECT
      LOWER(SUBSTRING(COALESCE(final_url, api_url) FROM 'https?://([^/]+)')) AS host,
      COUNT(*)::bigint AS n
    FROM job_health_checks
    WHERE checked_at > NOW() - INTERVAL '7 days'
      AND outcome = 'inconclusive_403'
    GROUP BY host
    ORDER BY n DESC
  `);

    if (rows.length === 0) {
        console.log('No inconclusive_403 outcomes in last 7d.');
        await prisma.$disconnect();
        return;
    }

    const sorted: Array<[string, number]> = rows.map((r) => [r.host ?? '(null)', Number(r.n)]);
    const total = sorted.reduce((s, [, n]) => s + n, 0);

    console.log(`Total 403s mapped to a host: ${total} across ${sorted.length} unique hosts.\n`);
    console.log('Top hosts (covering ≥ 90% of volume):');
    let cum = 0;
    let n = 0;
    for (const [host, count] of sorted) {
        cum += count;
        n++;
        const pct = ((count / total) * 100).toFixed(1);
        const cumPct = ((cum / total) * 100).toFixed(1);
        console.log(`  ${String(count).padStart(5)} (${pct.padStart(4)}%, cum ${cumPct.padStart(4)}%)  ${host}`);
        if (cum / total >= 0.9 || n >= 30) break;
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
