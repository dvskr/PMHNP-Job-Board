/**
 * Audit employer duplicates in prod.
 * Finds employer strings that look like the same company but differ in
 * casing, spacing, or trailing department/suffix. Read-only.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

interface EmployerRow {
    employer: string;
    count: number;
}

interface CompanyRow {
    id: string;
    name: string;
    normalizedName: string;
    jobCount: number;
}

/** Aggressive normalization for clustering — uses normalizer rules + collapses
 *  CamelCase ("BlueSky" → "blue sky") and strips trailing "- department" tails. */
function clusterKey(s: string): string {
    let k = s.trim();
    // strip trailing " - whatever"
    k = k.replace(/\s*[-–—]\s+.*$/, '');
    // insert space at lower-Upper boundaries: "BlueSky" → "Blue Sky"
    k = k.replace(/([a-z])([A-Z])/g, '$1 $2');
    // lowercase + collapse non-alphanumeric to single space
    k = k.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // strip common suffixes
    const suffixes = ['inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'health', 'healthcare', 'medical', 'group', 'services', 'solutions', 'partners', 'associates', 'pllc', 'pc', 'pa'];
    for (const s of suffixes) {
        const re = new RegExp(`\\b${s}\\b`, 'g');
        k = k.replace(re, ' ');
    }
    k = k.replace(/\s+/g, ' ').trim();
    return k;
}

async function main(): Promise<void> {
    console.log('Loading employer + company state from prod...\n');

    // Top employers by job count (all states)
    const employers = await prisma.job.groupBy({
        by: ['employer'],
        _count: { _all: true },
        orderBy: { _count: { employer: 'desc' } },
        take: 200,
    });

    const employerRows: EmployerRow[] = employers
        .filter((e) => e.employer)
        .map((e) => ({ employer: e.employer, count: e._count._all }));

    // Cluster by aggressive key
    const clusters = new Map<string, EmployerRow[]>();
    for (const e of employerRows) {
        const k = clusterKey(e.employer);
        if (!k) continue;
        if (!clusters.has(k)) clusters.set(k, []);
        clusters.get(k)!.push(e);
    }

    console.log('═'.repeat(80));
    console.log('Employer clusters with >= 2 distinct strings (top 25 by total job count):');
    console.log('═'.repeat(80));

    const dupClusters = [...clusters.entries()]
        .filter(([, members]) => members.length >= 2)
        .map(([key, members]) => ({
            key,
            members,
            total: members.reduce((acc, m) => acc + m.count, 0),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 25);

    for (const c of dupClusters) {
        console.log(`\n  cluster="${c.key}"  total=${c.total}`);
        for (const m of c.members.sort((a, b) => b.count - a.count)) {
            console.log(`    ${String(m.count).padStart(4)}  "${m.employer}"`);
        }
    }

    // Company rows audit
    console.log();
    console.log('═'.repeat(80));
    console.log('Company-row duplicates (same cluster key → multiple Company rows):');
    console.log('═'.repeat(80));

    const companies = await prisma.company.findMany({
        select: { id: true, name: true, normalizedName: true, jobCount: true },
    });

    const compClusters = new Map<string, CompanyRow[]>();
    for (const c of companies) {
        const k = clusterKey(c.name);
        if (!k) continue;
        if (!compClusters.has(k)) compClusters.set(k, []);
        compClusters.get(k)!.push(c);
    }

    let dupCount = 0;
    for (const [key, rows] of compClusters) {
        if (rows.length < 2) continue;
        dupCount++;
        if (dupCount > 25) continue;
        console.log(`\n  cluster="${key}"`);
        for (const r of rows.sort((a, b) => b.jobCount - a.jobCount)) {
            console.log(`    [${r.jobCount.toString().padStart(4)} jobs]  ${r.name}  (id=${r.id.slice(0, 8)}, normalized="${r.normalizedName}")`);
        }
    }

    console.log(`\nTotal Company rows: ${companies.length}`);
    console.log(`Cluster groups with >= 2 Company rows: ${dupCount}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
