/**
 * Playwright trace for Feature 8 — home page "How employers hire" section.
 * Verifies the 4 step titles + that each description mentions a
 * specific new feature.
 *
 *   npx tsx scripts/trace-how-it-works.ts
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

const EXPECTED_TITLES = [
    'Post Your Listing',
    'Reach Every PMHNP',
    'Browse & Unlock in Bulk',
    'Track & Hire',
];

// Each step's description should mention at least one of these tokens
// (case-insensitive) — proves the copy references the new features.
const EXPECTED_KEYWORDS_PER_STEP: string[][] = [
    ['template', 'AI', 'experience'],                  // step 1: AI JD writer
    ['semantic', 'digest', 'new-grad'],                // step 2: discovery channels
    ['bulk', 'multiple', 'credits'],                   // step 3: bulk unlock
    ['analytics', 'CTR', 'CSV', 'dashboard'],          // step 4: analytics
];

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // Section heading
    const heading = await page.locator('h2:has-text("How employers hire")').first().textContent().catch(() => null);
    console.log(`[heading] ${heading}`);

    // Step titles (h4)
    const titles = await page.locator('section.ehw-wrap h4').allTextContents();
    console.log(`[step-titles] ${JSON.stringify(titles)}`);

    // Step descriptions (p inside ehw-step)
    const descs = await page.locator('section.ehw-wrap .ehw-step p').allTextContents();

    let allPass = true;
    for (let i = 0; i < EXPECTED_TITLES.length; i += 1) {
        const titleOk = titles[i] === EXPECTED_TITLES[i];
        const desc = descs[i] ?? '';
        const keywords = EXPECTED_KEYWORDS_PER_STEP[i];
        const hits = keywords.filter((k) => desc.toLowerCase().includes(k.toLowerCase()));
        const descOk = hits.length > 0;
        if (!titleOk || !descOk) allPass = false;
        console.log(`[step ${i + 1}] title=${titleOk ? 'OK' : `MISMATCH ("${titles[i]}")`}  keywords-hit=${hits.length}/${keywords.length} (${hits.join(', ')})`);
    }

    // CTA
    const cta = await page.locator('section.ehw-wrap a:has-text("Post a Job")').first().textContent().catch(() => null);
    console.log(`[cta] ${cta?.trim()}`);

    console.log(`\n[result] ${allPass ? '✅ all 4 steps reference new features' : '❌ at least one step has stale copy'}`);

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
