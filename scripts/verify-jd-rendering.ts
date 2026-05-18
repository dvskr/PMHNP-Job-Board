/**
 * Open a handful of aggregated JDs in a local browser and assert:
 *   - no empty bullets (a "•" element with empty trailing text)
 *   - no consecutive blank-line gaps inside the description block
 *   - no run-on paragraph longer than ~1200 chars (legacy aggregator blob)
 *
 *   npx tsx scripts/verify-jd-rendering.ts
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
// Pick 5 aggregated jobs across different sources so the verifier hits
// Ashby, BambooHR, SmartRecruiters, etc. Source slugs are pulled at
// runtime so we don't hardcode IDs that go stale.
async function pickJobSlugs(): Promise<string[]> {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env' });
    const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const rows = await prisma.job.findMany({
        where: { isPublished: true, slug: { not: null }, sourceType: 'external' },
        select: { slug: true, sourceProvider: true, title: true, employer: true },
        orderBy: { createdAt: 'desc' },
        take: 60,
    });
    await prisma.$disconnect();
    const bySource = new Map<string, typeof rows[number]>();
    for (const r of rows) {
        const key = r.sourceProvider ?? 'unknown';
        if (!bySource.has(key)) bySource.set(key, r);
        if (bySource.size >= 6) break;
    }
    const slugs = Array.from(bySource.values()).map((r) => r.slug!);
    console.log('Sampling', bySource.size, 'jobs across', Array.from(bySource.keys()).join(', '));
    return slugs;
}

async function main(): Promise<void> {
    const slugs = await pickJobSlugs();
    if (slugs.length === 0) {
        console.error('No aggregated jobs found in dev DB');
        return;
    }
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    let totalIssues = 0;
    for (const slug of slugs) {
        const url = `${BASE}/jobs/${slug}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);

        const result = await page.evaluate(() => {
            const desc = document.querySelector('.prose');
            if (!desc) return { found: false, emptyBullets: 0, blankGaps: 0, longParas: 0, longestPara: 0 };
            // Empty bullets: a bullet wrapper whose text content is just the bullet character.
            const bulletRows = Array.from(desc.querySelectorAll('div.flex.items-start'));
            let emptyBullets = 0;
            for (const row of bulletRows) {
                const text = (row.textContent ?? '').replace(/[•\s]/g, '');
                if (text.length === 0) emptyBullets += 1;
            }
            // Blank-line gap divs (h-4) — multiple in a row is bad
            const gapDivs = Array.from(desc.querySelectorAll('div.h-4'));
            let blankGaps = 0;
            for (const gap of gapDivs) {
                const next = gap.nextElementSibling;
                if (next && next.classList.contains('h-4')) blankGaps += 1;
            }
            // Long paragraphs (>1200 chars) signal the legacy aggregator blob
            const paras = Array.from(desc.querySelectorAll('p, span'));
            let longParas = 0;
            let longestPara = 0;
            for (const p of paras) {
                const len = (p.textContent ?? '').length;
                if (len > longestPara) longestPara = len;
                if (len > 1200) longParas += 1;
            }
            return { found: true, emptyBullets, blankGaps, longParas, longestPara };
        });

        const verdict = !result.found
            ? '❌ no description found'
            : result.emptyBullets + result.blankGaps + result.longParas === 0
                ? '✅'
                : '⚠';
        console.log(`  ${verdict}  emptyBullets=${result.emptyBullets}  consecGaps=${result.blankGaps}  longParas=${result.longParas}  longestPara=${result.longestPara}  ${url}`);
        totalIssues += result.emptyBullets + result.blankGaps + result.longParas;
    }

    await browser.close();
    console.log('');
    console.log(`Total issues across ${slugs.length} JDs: ${totalIssues}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
