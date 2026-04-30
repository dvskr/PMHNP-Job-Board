/**
 * Audit which Greenhouse tenants are actually contributing jobs.
 *
 * external_id format is `greenhouse-<companySlug>-<jobId>`. We split on
 * `-` and bucket by slug. For each tenant: total live jobs, last job
 * created_at. Dead tenants (zero adds in N days) are recommended for
 * removal from GREENHOUSE_COMPANIES.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import * as fs from 'fs';

const STALE_DAYS = 90;
const REPORT = '.tmp_greenhouse_tenant_audit.json';

async function main(): Promise<void> {
    // Pull every greenhouse external_id (published or not — we want the
    // full activity picture, not just current catalog).
    const rows = await prisma.job.findMany({
        where: { sourceProvider: 'greenhouse' },
        select: {
            externalId: true,
            createdAt: true,
            isPublished: true,
        },
    });
    console.log(`Greenhouse rows in DB: ${rows.length}\n`);

    type Stat = {
        slug: string;
        total: number;
        live: number;
        lastSeen: Date;
        firstSeen: Date;
    };
    const byTenant = new Map<string, Stat>();

    for (const r of rows) {
        const id = r.externalId ?? '';
        if (!id.startsWith('greenhouse-')) continue;
        const rest = id.slice('greenhouse-'.length);
        // companySlug ends at last `-` before numeric jobId
        const lastDash = rest.lastIndexOf('-');
        if (lastDash === -1) continue;
        const slug = rest.slice(0, lastDash);
        if (!slug) continue;
        const cur = byTenant.get(slug);
        if (cur) {
            cur.total++;
            if (r.isPublished) cur.live++;
            if (r.createdAt > cur.lastSeen) cur.lastSeen = r.createdAt;
            if (r.createdAt < cur.firstSeen) cur.firstSeen = r.createdAt;
        } else {
            byTenant.set(slug, {
                slug,
                total: 1,
                live: r.isPublished ? 1 : 0,
                lastSeen: r.createdAt,
                firstSeen: r.createdAt,
            });
        }
    }

    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    // Load the configured tenant list to find ones in code but never seen.
    const code = fs.readFileSync('lib/aggregators/greenhouse.ts', 'utf8');
    const inCode = new Set<string>();
    const codeMatch = code.match(/const GREENHOUSE_COMPANIES = \[([\s\S]*?)\];/);
    if (codeMatch) {
        for (const line of codeMatch[1].split('\n')) {
            const m = /^\s*'([a-z0-9_]+)'/.exec(line);
            if (m) inCode.add(m[1]);
        }
    }
    console.log(`Configured GREENHOUSE_COMPANIES tenants: ${inCode.size}`);

    const all = [...byTenant.values()].sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
    const fresh = all.filter((t) => t.lastSeen >= cutoff);
    const stale = all.filter((t) => t.lastSeen < cutoff);
    const deadInCode: string[] = [];
    for (const slug of inCode) {
        if (!byTenant.has(slug)) deadInCode.push(slug);
    }

    console.log(`Tenants with at least 1 job ever:        ${all.length}`);
    console.log(`  ... fresh (last seen <${STALE_DAYS}d):        ${fresh.length}`);
    console.log(`  ... stale (last seen >${STALE_DAYS}d):        ${stale.length}`);
    console.log(`Configured tenants with ZERO ever-added: ${deadInCode.length}`);
    console.log();

    console.log(`Top 25 productive tenants:`);
    console.log('  slug                                            total   live   lastSeen');
    for (const t of all.slice(0, 25)) {
        console.log(`  ${t.slug.padEnd(45)} ${t.total.toString().padStart(5)}  ${t.live.toString().padStart(5)}  ${t.lastSeen.toISOString().slice(0, 10)}`);
    }
    console.log();

    console.log(`Stale tenants (last seen >${STALE_DAYS}d, configured but cold) — keep, kill, or rework?`);
    const staleAndConfigured = stale.filter((t) => inCode.has(t.slug));
    for (const t of staleAndConfigured.slice(0, 50)) {
        console.log(`  ${t.slug.padEnd(45)} total=${t.total.toString().padStart(4)} live=${t.live.toString().padStart(3)}  lastSeen=${t.lastSeen.toISOString().slice(0, 10)}`);
    }
    console.log();

    console.log(`Configured tenants that have NEVER added a job (${deadInCode.length}):`);
    for (const s of deadInCode.slice(0, 100)) console.log(`  ${s}`);
    if (deadInCode.length > 100) console.log(`  ... and ${deadInCode.length - 100} more`);
    console.log();

    // JSON dump of the final purge list — these are slugs safe to drop.
    const purge = [
        ...deadInCode,
        ...staleAndConfigured.map((t) => t.slug),
    ];
    fs.writeFileSync(REPORT, JSON.stringify({
        generatedAt: new Date().toISOString(),
        configuredCount: inCode.size,
        productiveCount: all.length,
        purgeRecommendedCount: purge.length,
        purgeRecommendedSlugs: purge,
        topProductive: all.slice(0, 50).map((t) => ({
            slug: t.slug,
            total: t.total,
            live: t.live,
            lastSeen: t.lastSeen.toISOString(),
        })),
    }, null, 2));

    console.log(`Recommendation: purge ${purge.length} of ${inCode.size} tenants (~${((purge.length / inCode.size) * 100).toFixed(0)}%).`);
    console.log(`Full report → ${REPORT}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
