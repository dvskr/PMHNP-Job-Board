/**
 * Read-only: show what's in prod cron_runs, grouped by cron name, so we can
 * verify the P5.D wrapping is recording runs in live prod. No mutations.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
  const runs = await prisma.cronRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 500,
    select: { name: true, startedAt: true, finishedAt: true, success: true, durationMs: true },
  });

  const byName = new Map<string, { runs: number; last: Date; failures: number; lastSuccess: boolean }>();
  for (const r of runs) {
    const e = byName.get(r.name) ?? { runs: 0, last: r.startedAt, failures: 0, lastSuccess: r.success };
    e.runs += 1;
    if (r.startedAt > e.last) { e.last = r.startedAt; e.lastSuccess = r.success; }
    if (!r.success && r.finishedAt) e.failures += 1; // finished + not success = real failure
    byName.set(r.name, e);
  }

  const sorted = [...byName.entries()].sort((a, b) => b[1].last.getTime() - a[1].last.getTime());
  console.log(`cron_runs: ${runs.length} rows in the last 500, ${byName.size} distinct crons\n`);
  console.log('name                          runs  last_run(UTC)              lastOK  failures');
  for (const [name, e] of sorted) {
    console.log(
      `${name.padEnd(28)} ${String(e.runs).padStart(4)}  ${e.last.toISOString()}  ${e.lastSuccess ? 'yes ' : 'NO  '}   ${e.failures}`,
    );
  }

  const since3h = runs.filter((r) => r.startedAt.getTime() > Date.now() - 3 * 3600_000);
  console.log(`\nruns in last 3h: ${since3h.length} (${new Set(since3h.map((r) => r.name)).size} distinct crons)`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
