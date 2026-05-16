/**
 * Audit 4 specialty category filters: child-adolescent, community-health,
 * correctional, substance-abuse. Read-only.
 *
 * Usage:
 *   npx tsx scripts/_audit-cat-specialty.ts            → all 4, prod DB
 *   npx tsx scripts/_audit-cat-specialty.ts --dev      → local dev DB
 *   npx tsx scripts/_audit-cat-specialty.ts child-adolescent
 */
import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
    if (process.argv.includes('--dev')) return 'dev';
    return 'prod';
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCategoryWhereClause } = require('@/lib/filters') as typeof import('@/lib/filters');

const SLUGS = ['child-adolescent', 'community-health', 'correctional', 'substance-abuse'];

async function auditSlug(slug: string) {
    const where = buildCategoryWhereClause(slug);
    const total = await prisma.job.count({ where });

    // Random 15 sample: order by id desc-skipped pseudo-random; use a simple
    // OFFSET-based scatter rather than ORDER BY random() to stay portable.
    const sampleSize = Math.min(15, total);
    let sample: { title: string; city: string | null; state: string | null; experienceLevel: string | null }[] = [];
    if (sampleSize > 0) {
        // Pull a generous slice then pick spread indices.
        const all = await prisma.job.findMany({
            where,
            select: { title: true, city: true, state: true, experienceLevel: true },
            take: Math.min(total, 500),
            orderBy: { id: 'asc' },
        });
        const step = Math.max(1, Math.floor(all.length / sampleSize));
        for (let i = 0; i < all.length && sample.length < sampleSize; i += step) {
            sample.push(all[i]);
        }
    }

    console.log(`\n=== ${slug} ===`);
    console.log(`DB count (buildCategoryWhereClause): ${total}`);
    console.log(`Sample (${sample.length}):`);
    sample.forEach((j, idx) => {
        const loc = [j.city, j.state].filter(Boolean).join(', ') || '—';
        console.log(`  ${String(idx + 1).padStart(2)}. [${j.experienceLevel ?? '—'}] ${j.title}  | ${loc}`);
    });
}

async function main() {
    const arg = process.argv.find((a) => SLUGS.includes(a));
    const slugs = arg ? [arg] : SLUGS;
    for (const s of slugs) {
        await auditSlug(s);
    }
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
