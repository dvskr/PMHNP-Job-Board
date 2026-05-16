/**
 * Feature 9 — SEO plumbing verification.
 *
 * 1. JD page emits <script type="application/ld+json"> with a JobPosting
 *    that declares experienceRequirements (monthsOfExperience).
 * 2. <meta property="og:image"> includes the experience chip via
 *    ?experience= query param.
 *
 *   npx tsx scripts/trace-seo-schema.ts
 */
import { chromium, type Page } from 'playwright';

const BASE = 'http://localhost:3000';

async function checkJd(page: Page, slug: string): Promise<void> {
    await page.goto(`${BASE}/jobs/${slug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);

    const title = (await page.locator('h1').first().textContent().catch(() => null))?.trim().slice(0, 70);
    console.log(`\n[/jobs/${slug.slice(0, 50)}...]`);
    console.log(`  title: ${title}`);

    // ── JSON-LD ──
    const ldScripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    let jobPosting: Record<string, unknown> | null = null;
    for (const raw of ldScripts) {
        try {
            const parsed = JSON.parse(raw);
            const candidates = Array.isArray(parsed) ? parsed : [parsed];
            for (const c of candidates) {
                if (c && (c['@type'] === 'JobPosting' || (Array.isArray(c['@type']) && c['@type'].includes('JobPosting')))) {
                    jobPosting = c;
                    break;
                }
            }
            if (jobPosting) break;
        } catch { /* skip non-JSON */ }
    }

    if (!jobPosting) {
        console.log(`  jsonld:               ❌ JobPosting block not found`);
    } else {
        const expReq = jobPosting.experienceRequirements as Record<string, unknown> | string | undefined;
        if (expReq && typeof expReq === 'object') {
            const monthsRaw = expReq.monthsOfExperience;
            const type = expReq['@type'];
            console.log(`  jsonld:               ✅ JobPosting present`);
            console.log(`    experienceRequirements:    ${JSON.stringify(expReq)}`);
            const monthsOk = typeof monthsRaw === 'number' || (typeof monthsRaw === 'string' && /^\d+$/.test(monthsRaw));
            console.log(`    @type:                     ${type === 'OccupationalExperienceRequirements' ? '✅' : '⚠️'} ${type ?? '(missing)'}`);
            console.log(`    monthsOfExperience:        ${monthsOk ? '✅' : '⚠️'} ${monthsRaw}`);
        } else if (typeof expReq === 'string') {
            console.log(`  jsonld:               ✅ JobPosting present`);
            console.log(`    experienceRequirements:    (string) "${expReq}"`);
        } else {
            console.log(`  jsonld:               ⚠️ JobPosting present but no experienceRequirements field`);
        }
    }

    // ── OG image ──
    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content').catch(() => null);
    if (!ogImage) {
        console.log(`  og:image:             ❌ missing`);
    } else {
        const hasExp = /[?&]experience=/.test(ogImage);
        console.log(`  og:image:             ${hasExp ? '✅' : '⚠️'} ${ogImage.slice(0, 140)}`);
        if (hasExp) {
            const m = ogImage.match(/[?&]experience=([^&]+)/);
            if (m) console.log(`    experience param:          ${decodeURIComponent(m[1])}`);
        }
    }
}

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    /* eslint-disable @typescript-eslint/no-require-imports */
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env' });
    const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
    /* eslint-enable @typescript-eslint/no-require-imports */

    // One of each experience profile so we cover the schema branches:
    //   (a) new-grad-friendly (minYears=0 or null + flag=true)
    //   (b) explicit min > 0
    //   (c) min null & flag false → no experienceRequirements expected
    const newGradJob = await prisma.job.findFirst({
        where: { isPublished: true, slug: { not: null }, newGradFriendly: true },
        select: { slug: true },
        orderBy: { createdAt: 'desc' },
    });
    const mid = await prisma.job.findFirst({
        where: { isPublished: true, slug: { not: null }, minYearsExperience: { gte: 2 } },
        select: { slug: true },
        orderBy: { createdAt: 'desc' },
    });
    const noExp = await prisma.job.findFirst({
        where: { isPublished: true, slug: { not: null }, minYearsExperience: null, newGradFriendly: false },
        select: { slug: true },
        orderBy: { createdAt: 'desc' },
    });
    await prisma.$disconnect();

    const slugs = [newGradJob?.slug, mid?.slug, noExp?.slug].filter((s): s is string => !!s);
    console.log(`Testing ${slugs.length} JDs (new-grad, min≥2, no-exp)`);

    for (const slug of slugs) {
        await checkJd(page, slug);
    }

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
