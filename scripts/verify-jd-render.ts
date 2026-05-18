/**
 * Verify the JD page no longer renders empty bullets or oversized gaps
 * between sibling bullets. Pulls a sample of aggregated jobs from prod,
 * loads each /jobs/<slug> on the live site, and inspects the rendered
 * description block for:
 *   1. bullet items with empty content (·empty-bullet bug)
 *   2. two consecutive blank-line spacer divs between bullets
 *
 *   npx tsx scripts/verify-jd-render.ts                  # against localhost:3000
 *   npx tsx scripts/verify-jd-render.ts --base=https://pmhnphiring.com
 *   npx tsx scripts/verify-jd-render.ts --env=prod --base=https://pmhnphiring.com
 */
import { config as dotenvConfig } from 'dotenv';
const isProd = process.argv.includes('--env=prod');
const baseArg = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1];
const BASE = baseArg ?? 'http://localhost:3000';
if (isProd) {
    dotenvConfig({ path: '.env.prod' });
    if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
    if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
} else {
    dotenvConfig({ path: '.env' });
}
/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
const { chromium } = require('playwright') as typeof import('playwright');
/* eslint-enable @typescript-eslint/no-require-imports */

async function main(): Promise<void> {
    // Sample aggregator-sourced jobs with a slug and a non-trivial description.
    // Lean on sources known to produce bad structure (LifeStance is workday,
    // Pharia is greenhouse/lever-like, Ashby has been the worst).
    const samples = await prisma.job.findMany({
        where: {
            isPublished: true,
            sourceType: { not: 'employer' },
            slug: { not: null },
            description: { not: '' },
        },
        select: { slug: true, employer: true, title: true, sourceProvider: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
    });
    await prisma.$disconnect();

    if (samples.length === 0) {
        console.log('No aggregator-sourced JDs found in DB');
        return;
    }

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    console.log(`base=${BASE}  samples=${samples.length}\n`);
    let cleanCount = 0;
    let bugCount = 0;

    for (const j of samples) {
        if (!j.slug) continue;
        const url = `${BASE}/jobs/${j.slug}`;
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
            await page.waitForSelector('h2:has-text("About this role")', { timeout: 8000 }).catch(() => null);

            const stats = await page.evaluate(() => {
                const heading = Array.from(document.querySelectorAll('h2')).find((h) => h.textContent?.includes('About this role'));
                if (!heading) return { found: false, empty: 0, doubleGap: 0, totalBullets: 0 };
                const root = heading.parentElement;
                if (!root) return { found: false, empty: 0, doubleGap: 0, totalBullets: 0 };
                // Bullet items are rendered as <div className="flex items-start gap-2 ml-4 my-1">
                const bullets = Array.from(root.querySelectorAll('div.flex.items-start.gap-2.ml-4'));
                let empty = 0;
                for (const b of bullets) {
                    const text = (b.textContent ?? '').replace(/^[\s•]+/, '').trim();
                    if (text.length === 0) empty += 1;
                }
                // Spacer blocks rendered as <div className="h-4">; count adjacent pairs
                const spacers = Array.from(root.querySelectorAll('div.h-4'));
                let doubleGap = 0;
                for (let i = 0; i < spacers.length - 1; i += 1) {
                    if (spacers[i].nextElementSibling === spacers[i + 1]) doubleGap += 1;
                }
                return { found: true, empty, doubleGap, totalBullets: bullets.length };
            });

            const flag = stats.empty > 0 || stats.doubleGap > 0 ? '❌' : '✅';
            if (stats.empty > 0 || stats.doubleGap > 0) bugCount += 1;
            else cleanCount += 1;

            const provider = j.sourceProvider ?? '?';
            const employer = (j.employer ?? '').slice(0, 25).padEnd(25);
            console.log(`  ${flag}  bullets=${String(stats.totalBullets).padStart(3)} empty=${stats.empty} doubleGap=${stats.doubleGap}  [${provider.padEnd(10)}] ${employer}  ${j.slug}`);
        } catch (err) {
            console.log(`  ⚠   ${(err as Error).message.slice(0, 60)}  ${url}`);
        }
    }

    await browser.close();
    console.log(`\n  clean=${cleanCount} bugged=${bugCount}`);
    process.exit(bugCount > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
