/**
 * Count thin-JD candidates for /api/cron/enrich-thin-jds.
 *   npx tsx scripts/count-thin-jds.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

const COOLDOWN_DAYS = 30;
const MIN_VISIBLE_CHARS = 1500;

function visibleLength(html: string): number {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

async function main(): Promise<void> {
    const cooldown = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await prisma.job.findMany({
        where: {
            isPublished: true,
            sourceType: { not: 'employer' },
            OR: [{ lastEnrichedAt: null }, { lastEnrichedAt: { lt: cooldown } }],
        },
        select: { id: true, title: true, description: true },
    });
    const thin = candidates.filter((c) => c.description && visibleLength(c.description) < MIN_VISIBLE_CHARS);
    console.log(`Total candidates: ${candidates.length}`);
    console.log(`Thin (<${MIN_VISIBLE_CHARS} visible chars): ${thin.length}`);
    console.log(`\nFirst 5 thin examples:`);
    for (const j of thin.slice(0, 5)) {
        console.log(`  ${j.id.slice(0, 8)}  ${visibleLength(j.description ?? '').toString().padStart(4)} chars  —  ${j.title}`);
    }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
