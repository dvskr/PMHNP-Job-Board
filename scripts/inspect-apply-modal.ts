/**
 * Playwright inspector for the Easy Apply modal — dumps computed CSS
 * (animation, transition, transform, opacity) so we can pinpoint
 * what's still animating.
 *
 *   npx tsx scripts/inspect-apply-modal.ts
 */
import { chromium } from 'playwright';

// Credentials come from the environment — never hardcode real accounts in a
// git-tracked file. Set TEST_LOGIN_EMAIL / TEST_LOGIN_PASSWORD before running:
//   $env:TEST_LOGIN_EMAIL='...'; $env:TEST_LOGIN_PASSWORD='...'; npx tsx scripts/inspect-apply-modal.ts
const EMAIL = process.env.TEST_LOGIN_EMAIL;
const PASSWORD = process.env.TEST_LOGIN_PASSWORD;
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

if (!EMAIL || !PASSWORD) {
    console.error('Set TEST_LOGIN_EMAIL and TEST_LOGIN_PASSWORD env vars before running this script.');
    process.exit(1);
}

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Log in (some JD apply buttons gate behind login)
    await page.goto(`${BASE}/login?role=job_seeker`);
    await page.fill('input[type=email]', EMAIL).catch(() => null);
    await page.fill('input[type=password]', PASSWORD).catch(() => null);
    await page.click('button[type=submit]').catch(() => null);
    await page.waitForTimeout(2000);

    // Find a job with applyOnPlatform=true so the Easy Apply modal exists
    /* eslint-disable @typescript-eslint/no-require-imports */
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env' });
    const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const j = await prisma.job.findFirst({
        where: { isPublished: true, applyOnPlatform: true, slug: { not: null } },
        select: { slug: true },
    });
    await prisma.$disconnect();
    if (!j?.slug) {
        console.error('No applyOnPlatform job found');
        await browser.close();
        return;
    }

    await page.goto(`${BASE}/jobs/${j.slug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click Easy Apply
    const easyApply = page.locator('button:has-text("Easy Apply"), a:has-text("Easy Apply")').first();
    const modalSelector = 'div.relative.w-full.max-w-2xl.rounded-2xl';

    // Click and record every ~30ms what the modal looks like
    await easyApply.click();
    const samples: { t: number; opacity: string; transform: string; height: number; width: number }[] = [];
    const start = Date.now();
    for (let i = 0; i < 25; i += 1) {
        try {
            const snap = await page.locator(modalSelector).first().evaluate((el) => {
                const cs = window.getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return { opacity: cs.opacity, transform: cs.transform, height: Math.round(r.height), width: Math.round(r.width) };
            });
            samples.push({ t: Date.now() - start, ...snap });
        } catch { /* modal not yet in DOM */ }
        await page.waitForTimeout(30);
    }
    console.log('[modal over time]');
    for (const s of samples) {
        console.log(`  +${String(s.t).padStart(4)}ms  opacity=${s.opacity}  transform=${s.transform.slice(0, 40).padEnd(40)}  size=${s.width}x${s.height}`);
    }

    const css = await page.locator(modalSelector).first().evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return {
            className: el.className,
            animation: cs.animation,
            animationName: cs.animationName,
            animationDuration: cs.animationDuration,
            transition: cs.transition,
            transitionProperty: cs.transitionProperty,
            transform: cs.transform,
            opacity: cs.opacity,
        };
    });
    console.log('[modal-css]', JSON.stringify(css, null, 2));

    // Also inspect the backdrop
    const backdropCss = await page.locator('div.fixed.inset-0').first().evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return {
            className: el.className,
            animation: cs.animation,
            transition: cs.transition,
            opacity: cs.opacity,
        };
    });
    console.log('[backdrop-css]', JSON.stringify(backdropCss, null, 2));

    // And anything else on the page with non-none animation that might be visible
    const animating = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        const hits: string[] = [];
        for (const el of all) {
            const cs = window.getComputedStyle(el);
            if (cs.animationName && cs.animationName !== 'none') {
                const e = el as HTMLElement;
                if (e.offsetParent !== null) {
                    hits.push(`${e.tagName.toLowerCase()}.${e.className.toString().slice(0, 60)} — anim=${cs.animationName} dur=${cs.animationDuration}`);
                }
            }
            if (hits.length > 12) break;
        }
        return hits;
    });
    console.log('[other-animating-visible-elements]');
    for (const h of animating) console.log('  ' + h);

    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
