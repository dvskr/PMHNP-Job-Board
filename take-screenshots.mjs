import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://pmhnphiring.com';
const OUT_DIR = join(process.cwd(), 'screenshots', 'mobile-view-dark-theme');

mkdirSync(OUT_DIR, { recursive: true });

// All public pages (skip auth-gated & dynamic-slug pages)
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

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: 'dark', isMobile: true });

    for (const [name, path] of pages) {
        const url = `${BASE_URL}${path}`;
        console.log(`📸 ${name} → ${url}`);
        try {
            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(1500);
            const filePath = join(OUT_DIR, `${name}.png`);
            await page.screenshot({ path: filePath, fullPage: false });
            console.log(`   ✅ Saved: ${filePath}`);
            await page.close();
        } catch (err) {
            console.log(`   ❌ Failed: ${err.message}`);
        }
    }

    await browser.close();
    console.log('\n🎉 Done! All screenshots saved to ./screenshots/');
})();
