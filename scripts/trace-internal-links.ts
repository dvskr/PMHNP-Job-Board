/**
 * Playwright trace for Feature 6 — internal linking sections on JD pages.
 *
 * Visits several JDs and checks for the three named sections:
 *   1. "More from {employer}"
 *   2. "More PMHNP jobs in {city}"
 *   3. "More new-grad-friendly PMHNP jobs"
 *
 *   npx tsx scripts/trace-internal-links.ts
 */
import { chromium, type Page } from 'playwright';

const BASE = 'http://localhost:3000';

async function checkJob(page: Page, slug: string): Promise<void> {
    await page.goto(`${BASE}/jobs/${slug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const moreFromEmployer = await page
        .locator('h2, h3').filter({ hasText: /More from / }).count();
    const moreInCity = await page
        .locator('h2, h3').filter({ hasText: /More PMHNP jobs in / }).count();
    const moreNewGrad = await page
        .locator('h2, h3').filter({ hasText: /More new-grad-friendly/ }).count();
    const similarJobs = await page
        .locator('h2, h3').filter({ hasText: /Similar PMHNP/ }).count();

    // Headline of the JD for context
    const title = await page.locator('h1').first().textContent().catch(() => null);

    console.log(`\n[/jobs/${slug.slice(0, 60)}${slug.length > 60 ? '...' : ''}]`);
    console.log(`  title: ${title?.trim().slice(0, 80)}`);
    console.log(`  Similar PMHNP Jobs:          ${similarJobs}`);
    console.log(`  More from {employer}:        ${moreFromEmployer}`);
    console.log(`  More PMHNP jobs in {city}:   ${moreInCity}`);
    console.log(`  More new-grad-friendly:      ${moreNewGrad}`);

    // Count links inside each named section to verify the lists actually have content
    if (moreFromEmployer > 0) {
        const links = await page
            .locator('section, div')
            .filter({ has: page.locator('h2:has-text("More from "), h3:has-text("More from ")') })
            .locator('a[href^="/jobs/"]')
            .count();
        console.log(`     ↳ ${links} job links`);
    }
}

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Pull representative slugs directly from the DB. Mix of:
    //   - employer-posted (should have moreFromEmployer + city links)
    //   - aggregated (might only have moreInCity / moreNewGrad)
    //   - new-grad-friendly (should have moreNewGrad links)
    /* eslint-disable @typescript-eslint/no-require-imports */
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env' });
    const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
    /* eslint-enable @typescript-eslint/no-require-imports */
    // Pick a job that has city set AND comes from a populous employer
    // so all three internal-link sections have a chance to render.
    const jobs = await prisma.job.findMany({
        where: { isPublished: true, slug: { not: null }, city: { not: null } },
        select: { slug: true, sourceType: true, newGradFriendly: true, employer: true, city: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    // Find the employer with the most published jobs — its job will have a populated moreFromEmployer
    const employerCount = new Map<string, number>();
    for (const j of jobs) employerCount.set(j.employer, (employerCount.get(j.employer) ?? 0) + 1);
    const topEmployer = [...employerCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const fromTopEmployerSlug = jobs.find((j) => j.employer === topEmployer)?.slug;
    const newGradWithCitySlug = jobs.find((j) => j.newGradFriendly && j.city)?.slug;
    const aggregatedWithCitySlug = jobs.find((j) => j.sourceType !== 'employer' && j.city)?.slug;
    await prisma.$disconnect();
    const slugs: string[] = [fromTopEmployerSlug, newGradWithCitySlug, aggregatedWithCitySlug]
        .filter((s): s is string => !!s)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .slice(0, 3);

    if (slugs.length === 0) {
        console.error('No published jobs in the DB');
        await browser.close();
        return;
    }
    console.log(`Testing ${slugs.length} jobs (employer + new-grad + aggregated mix)`);

    for (const slug of slugs) {
        await checkJob(page, slug);
    }

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
