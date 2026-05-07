import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const all = await m.prisma.cronRun.findMany({
        where: { startedAt: { gte: since } },
        orderBy: { startedAt: 'asc' },
        select: { name: true, startedAt: true, success: true, durationMs: true, metrics: true },
    });
    const byName = new Map<string, { runs: number; succeeded: number; sample: unknown }>();
    for (const c of all) {
        const cur = byName.get(c.name) ?? { runs: 0, succeeded: 0, sample: null as unknown };
        cur.runs++;
        if (c.success) cur.succeeded++;
        if (!cur.sample && c.metrics) cur.sample = c.metrics;
        byName.set(c.name, cur);
    }
    console.log('Cron firings in last 36h:');
    for (const [name, agg] of [...byName.entries()].sort()) {
        const s = agg.sample ? '  ' + JSON.stringify(agg.sample).slice(0, 200) : '';
        console.log(`  ${name.padEnd(35)} runs=${agg.runs} ok=${agg.succeeded}${s}`);
    }
    await m.prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
