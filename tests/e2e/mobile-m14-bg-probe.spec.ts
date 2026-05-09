// One-off probe for runbook M14 — verify the homepage's hero <Image> doesn't
// bleed through sections below it on mobile. The hero <section> has
// `overflow: hidden` so the image should be clipped to that section's box.
// Below the hero, the parent <div> gradient (#FDFBF7 → #F5D5C4 → ...) is
// what users should see, NOT the hero's nurse-crowd photo.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

test('M14: hero image is clipped to hero section, no bleed below', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Identify the hero section's bottom edge.
    const heroBottom = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('section'));
        const hero = sections.find((s) => {
            const img = s.querySelector('img');
            return img && /hero-nurses/.test((img as HTMLImageElement).src || '');
        });
        if (!hero) return null;
        const r = hero.getBoundingClientRect();
        return r.bottom + window.scrollY;
    });
    expect(heroBottom, 'expected to find hero section').not.toBeNull();

    // Scroll well past the hero so any "bleed" image would be visible.
    await page.evaluate((y) => window.scrollTo(0, y as number + 200), heroBottom);
    await page.waitForTimeout(300);

    // No <img> with hero-nurses in the src should remain in the viewport now.
    const inViewport = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs
            .filter((i) => /hero-nurses/.test(i.src || ''))
            .map((i) => {
                const r = i.getBoundingClientRect();
                const visible = r.bottom > 0 && r.top < window.innerHeight;
                return { src: i.src, visible, top: r.top, bottom: r.bottom };
            });
    });
    for (const probe of inViewport) {
        expect(probe.visible, `hero image still visible at scroll position: ${JSON.stringify(probe)}`).toBe(false);
    }
});
