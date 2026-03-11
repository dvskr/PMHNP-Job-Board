import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.prod' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
    const r = await pool.query(`
    SELECT date::date as day, source,
           SUM(jobs_fetched)::int as fetched,
           SUM(jobs_added)::int as added,
           SUM(jobs_duplicate)::int as dups
    FROM source_stats
    WHERE date >= NOW() - INTERVAL '14 days'
    GROUP BY day, source
    ORDER BY day DESC, added DESC
  `);

    const sources = ['jsearch', 'adzuna', 'jooble', 'lever', 'greenhouse', 'workday', 'ashby', 'usajobs'];

    // Group by day
    const days: Record<string, Record<string, { fetched: number, added: number, dups: number }>> = {};
    for (const row of r.rows) {
        const d = row.day.toISOString().split('T')[0];
        if (!days[d]) days[d] = {};
        days[d][row.source] = { fetched: row.fetched, added: row.added, dups: row.dups };
    }

    // Print table
    console.log('\n=== PER-DAY VOLUME: FETCHED / NEW ADDED ===\n');
    console.log('Date       |' + sources.map(s => s.padStart(10)).join('|') + '|   TOTAL');
    console.log('-'.repeat(110));

    for (const day of Object.keys(days).sort().reverse()) {
        let totalA = 0;
        const cols = sources.map(s => {
            const d = days[day][s] || { fetched: 0, added: 0 };
            totalA += d.added;
            if (d.added === 0) return '·'.padStart(10);
            return (`+${d.added}`).padStart(10);
        });
        console.log(`${day} |${cols.join('|')}|   +${totalA}`);
    }

    // Daily averages
    console.log('\n\n=== DAILY AVERAGES (14 days) ===\n');
    const avgBySource: Record<string, { fetched: number[], added: number[] }> = {};
    for (const data of Object.values(days)) {
        for (const [src, d] of Object.entries(data)) {
            if (!avgBySource[src]) avgBySource[src] = { fetched: [], added: [] };
            avgBySource[src].fetched.push(d.fetched);
            avgBySource[src].added.push(d.added);
        }
    }

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    console.log('Source         Fetched/day   New/day   14d Total   Hit Rate   Type');
    console.log('-'.repeat(80));
    for (const s of sources) {
        const d = avgBySource[s] || { fetched: [0], added: [0] };
        const type = ['greenhouse', 'lever', 'ashby', 'workday', 'ats-jobs-db'].includes(s) ? 'DIRECT ATS' : 'AGGREGATOR';
        console.log(
            `${s.padEnd(15)}${String(avg(d.fetched)).padStart(8)}/day   ${String(avg(d.added)).padStart(4)}/day   ${String(sum(d.added)).padStart(6)}       ${(avg(d.added) / Math.max(avg(d.fetched), 1) * 100).toFixed(1).padStart(5)}%   ${type}`
        );
    }

    // Direct vs aggregator totals
    const directSources = ['greenhouse', 'lever', 'ashby', 'workday'];
    const aggSources = ['jsearch', 'adzuna', 'jooble'];

    let directTotal = 0, aggTotal = 0;
    for (const data of Object.values(days)) {
        for (const [src, d] of Object.entries(data)) {
            if (directSources.includes(src)) directTotal += d.added;
            if (aggSources.includes(src)) aggTotal += d.added;
        }
    }

    console.log('\n\n=== DIRECT ATS vs AGGREGATOR (14 day totals) ===\n');
    console.log(`  DIRECT ATS (Greenhouse, Lever, Workday, Ashby):  +${directTotal} new jobs`);
    console.log(`  AGGREGATOR (JSearch, Adzuna, Jooble):            +${aggTotal} new jobs`);
    console.log(`  USAJobs:                                         +${sum(avgBySource['usajobs']?.added || [0])} new jobs`);
    console.log(`\n  Direct ATS share of new jobs: ${(directTotal / (directTotal + aggTotal) * 100).toFixed(1)}%`);
    console.log(`  Aggregator share of new jobs: ${(aggTotal / (directTotal + aggTotal) * 100).toFixed(1)}%`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
