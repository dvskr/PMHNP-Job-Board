import sharp from 'sharp';
import { mkdirSync, copyFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const BASE = process.cwd();
const SRC_LIGHT = join(BASE, 'screenshots', 'landscape-view-light-theme');
const DEST = join(BASE, 'public', 'images', 'pages');

mkdirSync(DEST, { recursive: true });

// Map screenshot filenames → SEO-friendly names with "pmhnp" keyword
const nameMap = {
    '01-homepage.png': 'pmhnp-job-board-homepage.webp',
    '02-about.png': 'about-pmhnp-hiring-platform.webp',
    '03-for-employers.png': 'pmhnp-employer-hiring-solutions.webp',
    '04-for-job-seekers.png': 'pmhnp-job-seeker-career-resources.webp',
    '05-faq.png': 'pmhnp-hiring-frequently-asked-questions.webp',
    '06-contact.png': 'contact-pmhnp-hiring-support.webp',
    '07-privacy.png': 'pmhnp-hiring-privacy-policy.webp',
    '08-terms.png': 'pmhnp-hiring-terms-of-service.webp',
    '09-resources.png': 'pmhnp-career-resources-guides.webp',
    '10-salary-guide.png': 'pmhnp-salary-guide-2026.webp',
    '11-blog.png': 'pmhnp-career-insights-blog.webp',
    '12-jobs.png': 'pmhnp-job-search-listings.webp',
    '13-jobs-remote.png': 'remote-pmhnp-jobs-telehealth.webp',
    '14-jobs-telehealth.png': 'telehealth-pmhnp-positions.webp',
    '15-jobs-travel.png': 'travel-pmhnp-nursing-jobs.webp',
    '16-jobs-per-diem.png': 'per-diem-pmhnp-jobs.webp',
    '17-jobs-new-grad.png': 'new-graduate-pmhnp-jobs.webp',
    '18-jobs-locations.png': 'pmhnp-jobs-by-state-location.webp',
    '19-post-job.png': 'post-pmhnp-job-listing.webp',
    '20-login.png': 'pmhnp-hiring-login-page.webp',
    '21-signup.png': 'pmhnp-hiring-signup-page.webp',
    '22-forgot-password.png': 'pmhnp-hiring-forgot-password.webp',
    '23-employer-login.png': 'pmhnp-employer-login-portal.webp',
    '24-employer-signup.png': 'pmhnp-employer-signup-portal.webp',
    '25-job-alerts.png': 'pmhnp-job-alerts-signup.webp',
    '26-saved.png': 'saved-pmhnp-jobs-bookmarks.webp',
    '27-dashboard.png': 'pmhnp-job-seeker-dashboard.webp',
    '28-settings.png': 'pmhnp-profile-settings.webp',
    '29-email-preferences.png': 'pmhnp-email-notification-preferences.webp',
    '30-employer-dashboard.png': 'pmhnp-employer-dashboard.webp',
    '31-employer-candidates.png': 'pmhnp-employer-candidate-management.webp',
    '32-admin.png': 'pmhnp-hiring-admin-panel.webp',
    '33-post-job-preview.png': 'pmhnp-job-posting-preview.webp',
    '34-post-job-checkout.png': 'pmhnp-job-posting-checkout.webp',
    '35-job-alerts-manage.png': 'manage-pmhnp-job-alerts.webp',
    '36-unauthorized.png': 'pmhnp-hiring-access-restricted.webp',
    '37-unsubscribe.png': 'pmhnp-email-unsubscribe.webp',
    '38-success.png': 'pmhnp-job-posting-success.webp',
    '39-renewal-success.png': 'pmhnp-job-renewal-success.webp',
    '40-upgrade-success.png': 'pmhnp-job-upgrade-success.webp',
};

(async () => {
    const files = readdirSync(SRC_LIGHT).filter(f => f.endsWith('.png'));
    console.log(`📸 Converting ${files.length} screenshots to WebP...`);

    for (const file of files) {
        const seoName = nameMap[file];
        if (!seoName) {
            console.log(`   ⚠️  No mapping for ${file}, skipping`);
            continue;
        }
        const src = join(SRC_LIGHT, file);
        const dest = join(DEST, seoName);
        await sharp(src)
            .webp({ quality: 85 })
            .toFile(dest);
        console.log(`   ✅ ${file} → ${seoName}`);
    }

    // Also convert the logo
    const logoPng = join(BASE, 'public', 'pmhnp_logo.png');
    if (existsSync(logoPng)) {
        await sharp(logoPng)
            .webp({ quality: 90 })
            .toFile(join(BASE, 'public', 'images', 'pmhnp-hiring-logo.webp'));
        console.log('   ✅ pmhnp_logo.png → pmhnp-hiring-logo.webp');
    }

    console.log('\n🎉 Done! All images saved to public/images/pages/');
})();
