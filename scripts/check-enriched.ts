/**
 * Show recently enriched JDs.
 *   npx tsx scripts/check-enriched.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

function visibleLength(html: string): number {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

async function main(): Promise<void> {
    const rows = await prisma.job.findMany({
        where: { lastEnrichedAt: { not: null } },
        select: { id: true, title: true, description: true, slug: true, lastEnrichedAt: true },
        orderBy: { lastEnrichedAt: 'desc' },
        take: 12,
    });
    console.log(`Recently enriched: ${rows.length}`);
    for (const r of rows) {
        const len = visibleLength(r.description ?? '');
        console.log(`  ${(r.lastEnrichedAt as Date).toISOString()}  ${String(len).padStart(5)}c  ${r.title}  /jobs/${r.slug ?? r.id}`);
    }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
