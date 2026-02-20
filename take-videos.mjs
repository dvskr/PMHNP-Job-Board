import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://pmhnphiring.com';
const OUT_DIR = join(process.cwd(), 'screenshots', 'scroll-videos-mobile-dark');

mkdirSync(OUT_DIR, { recursive: true });

const pages = [
    ['01-homepage', '/'],
    ['02-about', '/about'],
    ['03-for-employers', '/for-employers'],
    ['04-for-job-seekers', '/for-job-seekers'],
    ['05-faq', '/faq'],
    ['06-contact', '/contact'],
    ['07-privacy', '/privacy'],
    ['08-terms', '/terms'],
    ['09-resources', '/resources'],
    ['10-salary-guide', '/salary-guide'],
    ['11-blog', '/blog'],
    ['12-jobs', '/jobs'],
    ['13-jobs-remote', '/jobs/remote'],
    ['14-jobs-telehealth', '/jobs/telehealth'],
    ['15-jobs-travel', '/jobs/travel'],
    ['16-jobs-per-diem', '/jobs/per-diem'],
    ['17-jobs-new-grad', '/jobs/new-grad'],
    ['18-jobs-locations', '/jobs/locations'],
    ['19-post-job', '/post-job'],
    ['20-login', '/login'],
    ['21-signup', '/signup'],
    ['22-forgot-password', '/forgot-password'],
    ['23-employer-login', '/employer/login'],
    ['24-employer-signup', '/employer/signup'],
    ['25-job-alerts', '/job-alerts'],
    ['26-saved', '/saved'],
    ['27-dashboard', '/dashboard'],
    ['28-settings', '/settings'],
    ['29-email-preferences', '/email-preferences'],
    ['30-employer-dashboard', '/employer/dashboard'],
    ['31-employer-candidates', '/employer/candidates'],
    ['32-admin', '/admin'],
    ['33-post-job-preview', '/post-job/preview'],
    ['34-post-job-checkout', '/post-job/checkout'],
    ['35-job-alerts-manage', '/job-alerts/manage'],
    ['36-unauthorized', '/unauthorized'],
    ['37-unsubscribe', '/unsubscribe'],
    ['38-success', '/success'],
    ['39-renewal-success', '/employer/renewal-success'],
    ['40-upgrade-success', '/employer/upgrade-success'],
];

const SCROLL_DURATION_MS = 5000;
const FRAME_INTERVAL_MS = 50; // smooth 20fps scroll steps

(async () => {
    const browser = await chromium.launch();

    for (const [name, path] of pages) {
        const url = `${BASE_URL}${path}`;
        console.log(`🎥 ${name} → ${url}`);

        try {
            // Each page gets its own context with video recording enabled
            const context = await browser.newContext({
                viewport: { width: 375, height: 812 },
                colorScheme: 'dark',
                isMobile: true,
                recordVideo: { dir: OUT_DIR, size: { width: 375, height: 812 } },
            });

            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(1000); // let page settle

            // Get total scrollable height
            const scrollHeight = await page.evaluate(() =>
                Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight
            );

            if (scrollHeight > 0) {
                // Smooth scroll over 5 seconds
                const steps = Math.floor(SCROLL_DURATION_MS / FRAME_INTERVAL_MS);
                const scrollPerStep = scrollHeight / steps;

                for (let i = 0; i <= steps; i++) {
                    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollPerStep * i);
                    await page.waitForTimeout(FRAME_INTERVAL_MS);
                }
            } else {
                // Short page — just hold for 5 seconds
                await page.waitForTimeout(SCROLL_DURATION_MS);
            }

            // Small pause at end
            await page.waitForTimeout(500);

            // Close context to finalize the video file
            const videoPath = await page.video().path();
            await context.close();

            // Rename the auto-generated file to our naming convention
            const finalPath = join(OUT_DIR, `${name}.webm`);
            renameSync(videoPath, finalPath);
            console.log(`   ✅ Saved: ${finalPath}`);
        } catch (err) {
            console.log(`   ❌ Failed: ${err.message}`);
        }
    }

    await browser.close();
    console.log('\n🎉 Done! All scroll videos saved to ./screenshots/scroll-videos/');
})();
