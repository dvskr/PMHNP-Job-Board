/**
 * Video copy + rename script
 * Copies the 20 public-page scroll recordings from screenshots/ to public/videos/
 * with SEO-friendly names.
 */
import { mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const BASE = process.cwd();
const SRC = join(BASE, 'screenshots', 'scroll-videos-landscape-light');
const DEST = join(BASE, 'public', 'videos');

mkdirSync(DEST, { recursive: true });

// Map source filenames → SEO-friendly names (public pages only)
const nameMap = {
    '01-homepage.webm': 'pmhnp-job-board-homepage-scroll.webm',
    '02-about.webm': 'about-pmhnp-hiring-platform-scroll.webm',
    '03-for-employers.webm': 'pmhnp-employer-hiring-solutions-scroll.webm',
    '04-for-job-seekers.webm': 'pmhnp-job-seeker-career-resources-scroll.webm',
    '05-faq.webm': 'pmhnp-hiring-faq-scroll.webm',
    '06-contact.webm': 'contact-pmhnp-hiring-support-scroll.webm',
    '07-privacy.webm': 'pmhnp-hiring-privacy-policy-scroll.webm',
    '08-terms.webm': 'pmhnp-hiring-terms-of-service-scroll.webm',
    '09-resources.webm': 'pmhnp-career-resources-guides-scroll.webm',
    '10-salary-guide.webm': 'pmhnp-salary-guide-2026-scroll.webm',
    '11-blog.webm': 'pmhnp-career-insights-blog-scroll.webm',
    '12-jobs.webm': 'pmhnp-job-search-listings-scroll.webm',
    '13-jobs-remote.webm': 'remote-pmhnp-jobs-telehealth-scroll.webm',
    '14-jobs-telehealth.webm': 'telehealth-pmhnp-positions-scroll.webm',
    '15-jobs-travel.webm': 'travel-pmhnp-nursing-jobs-scroll.webm',
    '16-jobs-per-diem.webm': 'per-diem-pmhnp-jobs-scroll.webm',
    '17-jobs-new-grad.webm': 'new-graduate-pmhnp-jobs-scroll.webm',
    '18-jobs-locations.webm': 'pmhnp-jobs-by-state-location-scroll.webm',
    '19-post-job.webm': 'post-pmhnp-job-listing-scroll.webm',
    '25-job-alerts.webm': 'pmhnp-job-alerts-signup-scroll.webm',
};

console.log(`🎬 Copying ${Object.keys(nameMap).length} scroll recordings to public/videos/...`);

for (const [src, dest] of Object.entries(nameMap)) {
    const srcPath = join(SRC, src);
    const destPath = join(DEST, dest);
    copyFileSync(srcPath, destPath);
    console.log(`   ✅ ${src} → ${dest}`);
}

console.log('\n🎉 Done! All videos saved to public/videos/');
