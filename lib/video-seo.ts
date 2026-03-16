/**
 * Video SEO Configuration
 *
 * Maps site routes to their scroll-recording video, title, description,
 * thumbnail (reuses existing WebP), and estimated duration for use in
 * video sitemap and VideoObject JSON-LD.
 */

export interface PageVideoSEO {
    /** Path to video relative to public, e.g. /videos/pmhnp-job-board-homepage-scroll.webm */
    video: string;
    /** Path to thumbnail image (reuses WebP from image-seo) */
    thumbnail: string;
    /** Video title for sitemap and JSON-LD */
    title: string;
    /** Video description for sitemap and JSON-LD */
    description: string;
    /** Estimated duration in seconds */
    duration: number;
    /** Upload date in ISO format */
    uploadDate: string;
}

const VBASE = '/videos';
const IBASE = '/images/pages';
const UPLOAD_DATE = '2026-02-20';

export const PAGE_VIDEO_SEO: Record<string, PageVideoSEO> = {
    '/': {
        video: `${VBASE}/pmhnp-job-board-homepage-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-job-board-homepage.webp`,
        title: 'PMHNP Job Board Homepage Walkthrough',
        description: 'Scroll through the PMHNP Hiring homepage — browse 10,000+ psychiatric nurse practitioner jobs from 3,000+ companies across all 50 states with salary transparency.',
        duration: 20,
        uploadDate: UPLOAD_DATE,
    },
    '/about': {
        video: `${VBASE}/about-pmhnp-hiring-platform-scroll.webm`,
        thumbnail: `${IBASE}/about-pmhnp-hiring-platform.webp`,
        title: 'About PMHNP Hiring Platform',
        description: 'Learn about PMHNP Hiring — our mission, data methodology, and how we aggregate psychiatric mental health nurse practitioner jobs from thousands of sources.',
        duration: 20,
        uploadDate: UPLOAD_DATE,
    },
    '/for-employers': {
        video: `${VBASE}/pmhnp-employer-hiring-solutions-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-employer-hiring-solutions.webp`,
        title: 'PMHNP Employer Hiring Solutions Overview',
        description: 'See how employers can post PMHNP jobs, access targeted recruitment, and connect with qualified psychiatric nurse practitioners on PMHNP Hiring.',
        duration: 18,
        uploadDate: UPLOAD_DATE,
    },
    '/for-job-seekers': {
        video: `${VBASE}/pmhnp-job-seeker-career-resources-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-job-seeker-career-resources.webp`,
        title: 'PMHNP Job Seeker Career Resources',
        description: 'Explore career resources for PMHNP job seekers — job search tools, salary data, application features, and career guidance for psychiatric nurse practitioners.',
        duration: 18,
        uploadDate: UPLOAD_DATE,
    },
    '/faq': {
        video: `${VBASE}/pmhnp-hiring-faq-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-hiring-frequently-asked-questions.webp`,
        title: 'PMHNP Hiring FAQ — Frequently Asked Questions',
        description: 'Answers to common questions about PMHNP Hiring — job posting, salary transparency, job alerts, employer features, and how the platform works.',
        duration: 17,
        uploadDate: UPLOAD_DATE,
    },
    '/contact': {
        video: `${VBASE}/contact-pmhnp-hiring-support-scroll.webm`,
        thumbnail: `${IBASE}/contact-pmhnp-hiring-support.webp`,
        title: 'Contact PMHNP Hiring Support',
        description: 'Get in touch with the PMHNP Hiring support team for help with job postings, account issues, or general inquiries.',
        duration: 17,
        uploadDate: UPLOAD_DATE,
    },
    '/privacy': {
        video: `${VBASE}/pmhnp-hiring-privacy-policy-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-hiring-privacy-policy.webp`,
        title: 'PMHNP Hiring Privacy Policy',
        description: 'Review the PMHNP Hiring privacy policy — how we collect, use, and protect your personal information on our psychiatric nurse practitioner job board.',
        duration: 30,
        uploadDate: UPLOAD_DATE,
    },
    '/terms': {
        video: `${VBASE}/pmhnp-hiring-terms-of-service-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-hiring-terms-of-service.webp`,
        title: 'PMHNP Hiring Terms of Service',
        description: 'Read the PMHNP Hiring terms of service covering user rights, employer responsibilities, job posting guidelines, and platform usage policies.',
        duration: 28,
        uploadDate: UPLOAD_DATE,
    },
    '/resources': {
        video: `${VBASE}/pmhnp-career-resources-guides-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-career-resources-guides.webp`,
        title: 'PMHNP Career Resources and Guides',
        description: 'Free career resources for psychiatric nurse practitioners — salary guides, certification info, interview prep, remote work advice, and professional development tools.',
        duration: 17,
        uploadDate: UPLOAD_DATE,
    },
    '/salary-guide': {
        video: `${VBASE}/pmhnp-salary-guide-2026-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-salary-guide-2026.webp`,
        title: '2026 PMHNP Salary Guide — State by State Comparison',
        description: 'Comprehensive 2026 PMHNP salary guide showing national averages of $155,000+ with state-by-state comparisons, experience level breakdowns, and tips to maximize earnings.',
        duration: 28,
        uploadDate: UPLOAD_DATE,
    },
    '/blog': {
        video: `${VBASE}/pmhnp-career-insights-blog-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-career-insights-blog.webp`,
        title: 'PMHNP Career Insights Blog',
        description: 'Expert PMHNP career guides, salary negotiation tips, state spotlights, and job market insights for psychiatric mental health nurse practitioners.',
        duration: 18,
        uploadDate: UPLOAD_DATE,
    },
    '/jobs': {
        video: `${VBASE}/pmhnp-job-search-listings-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-job-search-listings.webp`,
        title: 'PMHNP Job Search — Browse Thousands of Listings',
        description: 'Search and filter thousands of PMHNP job listings by salary, location, job type, and more on the #1 psychiatric nurse practitioner job board.',
        duration: 35,
        uploadDate: UPLOAD_DATE,
    },
    '/jobs/remote': {
        video: `${VBASE}/remote-pmhnp-jobs-telehealth-scroll.webm`,
        thumbnail: `${IBASE}/remote-pmhnp-jobs-telehealth.webp`,
        title: 'Remote PMHNP Jobs — Work From Home Positions',
        description: 'Browse remote and work-from-home PMHNP jobs with average salaries of $171,000+. Telehealth psychiatric nurse practitioner positions across all 50 states.',
        duration: 28,
        uploadDate: UPLOAD_DATE,
    },
    '/jobs/telehealth': {
        video: `${VBASE}/telehealth-pmhnp-positions-scroll.webm`,
        thumbnail: `${IBASE}/telehealth-pmhnp-positions.webp`,
        title: 'Telehealth PMHNP Positions — Virtual Psychiatric Care',
        description: 'Find telehealth PMHNP positions delivering virtual psychiatric care. Browse online psychiatric nurse practitioner jobs from leading telehealth platforms.',
        duration: 28,
        uploadDate: UPLOAD_DATE,
    },
    '/jobs/travel': {
        video: `${VBASE}/travel-pmhnp-nursing-jobs-scroll.webm`,
        thumbnail: `${IBASE}/travel-pmhnp-nursing-jobs.webp`,
        title: 'Travel PMHNP Nursing Jobs — Contract Positions',
        description: 'Explore travel PMHNP nursing jobs with competitive weekly pay rates. Contract psychiatric nurse practitioner positions with housing and benefits.',
        duration: 22,
        uploadDate: UPLOAD_DATE,
    },
    '/jobs/per-diem': {
        video: `${VBASE}/per-diem-pmhnp-jobs-scroll.webm`,
        thumbnail: `${IBASE}/per-diem-pmhnp-jobs.webp`,
        title: 'Per Diem PMHNP Jobs — Flexible Positions',
        description: 'Browse per diem PMHNP jobs with flexible scheduling and competitive hourly rates. Part-time psychiatric nurse practitioner positions near you.',
        duration: 22,
        uploadDate: UPLOAD_DATE,
    },
    '/jobs/new-grad': {
        video: `${VBASE}/new-graduate-pmhnp-jobs-scroll.webm`,
        thumbnail: `${IBASE}/new-graduate-pmhnp-jobs.webp`,
        title: 'New Graduate PMHNP Jobs — Entry Level Positions',
        description: 'Find entry-level PMHNP jobs perfect for new graduates. Psychiatric nurse practitioner positions with mentorship programs and clinical support.',
        duration: 24,
        uploadDate: UPLOAD_DATE,
    },
    '/jobs/locations': {
        video: `${VBASE}/pmhnp-jobs-by-state-location-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-jobs-by-state-location.webp`,
        title: 'PMHNP Jobs by State and Location',
        description: 'Browse PMHNP jobs organized by state and city. Find psychiatric nurse practitioner positions near you with job counts and salary data for every location.',
        duration: 24,
        uploadDate: UPLOAD_DATE,
    },
    '/post-job': {
        video: `${VBASE}/post-pmhnp-job-listing-scroll.webm`,
        thumbnail: `${IBASE}/post-pmhnp-job-listing.webp`,
        title: 'Post a PMHNP Job Listing',
        description: 'Post a psychiatric nurse practitioner job on PMHNP Hiring. Reach thousands of qualified PMHNPs with targeted job listings, salary transparency, and employer branding.',
        duration: 19,
        uploadDate: UPLOAD_DATE,
    },
    '/job-alerts': {
        video: `${VBASE}/pmhnp-job-alerts-signup-scroll.webm`,
        thumbnail: `${IBASE}/pmhnp-job-alerts-signup.webp`,
        title: 'PMHNP Job Alerts — Get Notified of New Positions',
        description: 'Sign up for PMHNP job alerts and receive email notifications when new psychiatric nurse practitioner positions match your criteria.',
        duration: 15,
        uploadDate: UPLOAD_DATE,
    },
};

/**
 * Get video SEO config for a given pathname.
 * Returns null if no video is mapped for this route.
 */
export function getPageVideoSEO(pathname: string): PageVideoSEO | null {
    return PAGE_VIDEO_SEO[pathname] ?? null;
}

/**
 * Get all page video entries for building the video sitemap.
 */
export function getAllPageVideos(): Array<{ url: string } & PageVideoSEO> {
    return Object.entries(PAGE_VIDEO_SEO).map(([url, seo]) => ({ url, ...seo }));
}
