/**
 * Image SEO Configuration
 *
 * Maps site routes to their optimised page-screenshot image, alt text,
 * and caption for use in OG tags, image sitemap, and on-page alt.
 */

export interface PageImageSEO {
    /** Path to WebP image relative to public, e.g. /images/pages/pmhnp-job-board-homepage.webp */
    image: string;
    /** Descriptive alt text with keywords */
    alt: string;
    /** Short caption for image sitemap */
    caption: string;
    /** Title for image sitemap */
    title: string;
}

const BASE = '/images/pages';

export const PAGE_IMAGE_SEO: Record<string, PageImageSEO> = {
    '/': {
        image: `${BASE}/pmhnp-job-board-homepage.webp`,
        alt: 'PMHNP Hiring job board homepage showing 10,000 plus psychiatric nurse practitioner jobs from 3,000 plus companies across 50 states',
        caption: 'The #1 job board for psychiatric mental health nurse practitioners',
        title: 'PMHNP Hiring Homepage',
    },
    '/about': {
        image: `${BASE}/about-pmhnp-hiring-platform.webp`,
        alt: 'About PMHNP Hiring platform showing mission, methodology, and data sources for psychiatric nurse practitioner job board',
        caption: 'About PMHNP Hiring - mission and methodology',
        title: 'About PMHNP Hiring',
    },
    '/for-employers': {
        image: `${BASE}/pmhnp-employer-hiring-solutions.webp`,
        alt: 'PMHNP employer hiring solutions page showing job posting options, pricing tiers, and targeted recruitment for psychiatric nurse practitioners',
        caption: 'Employer solutions for hiring PMHNPs',
        title: 'PMHNP Employer Hiring Solutions',
    },
    '/for-job-seekers': {
        image: `${BASE}/pmhnp-job-seeker-career-resources.webp`,
        alt: 'PMHNP job seeker career resources page showing job search tools, salary data, and application features for psychiatric nurse practitioners',
        caption: 'Career resources for PMHNP job seekers',
        title: 'PMHNP Job Seeker Resources',
    },
    '/faq': {
        image: `${BASE}/pmhnp-hiring-frequently-asked-questions.webp`,
        alt: 'PMHNP Hiring FAQ page with answers about job posting, salary transparency, job alerts, and employer features',
        caption: 'Frequently asked questions about PMHNP Hiring',
        title: 'PMHNP Hiring FAQ',
    },
    '/contact': {
        image: `${BASE}/contact-pmhnp-hiring-support.webp`,
        alt: 'Contact PMHNP Hiring support page with email form for job seekers and employers needing assistance',
        caption: 'Contact PMHNP Hiring support team',
        title: 'Contact PMHNP Hiring',
    },
    '/privacy': {
        image: `${BASE}/pmhnp-hiring-privacy-policy.webp`,
        alt: 'PMHNP Hiring privacy policy page detailing data protection practices for psychiatric nurse practitioner job seekers and employers',
        caption: 'PMHNP Hiring privacy policy',
        title: 'Privacy Policy',
    },
    '/terms': {
        image: `${BASE}/pmhnp-hiring-terms-of-service.webp`,
        alt: 'PMHNP Hiring terms of service page outlining usage policies for the psychiatric nurse practitioner job board',
        caption: 'PMHNP Hiring terms of service',
        title: 'Terms of Service',
    },
    '/resources': {
        image: `${BASE}/pmhnp-career-resources-guides.webp`,
        alt: 'PMHNP career resources page with salary guides, certification information, and professional development tools for psychiatric nurse practitioners',
        caption: 'Career resources and guides for PMHNPs',
        title: 'PMHNP Career Resources',
    },
    '/salary-guide': {
        image: `${BASE}/pmhnp-salary-guide-2026.webp`,
        alt: '2026 PMHNP Salary Guide showing national average of 155,000 dollars with state-by-state comparison and compensation data',
        caption: '2026 PMHNP salary guide with state comparisons',
        title: '2026 PMHNP Salary Guide',
    },
    '/blog': {
        image: `${BASE}/pmhnp-career-insights-blog.webp`,
        alt: 'PMHNP Career Insights blog with salary guides, career strategies, interview tips, and industry news for psychiatric nurse practitioners',
        caption: 'PMHNP career insights and industry blog',
        title: 'PMHNP Career Blog',
    },
    '/jobs': {
        image: `${BASE}/pmhnp-job-search-listings.webp`,
        alt: 'PMHNP job search results page with salary filters, location search, and thousands of psychiatric nurse practitioner positions',
        caption: 'Browse PMHNP job listings with salary data',
        title: 'PMHNP Job Search',
    },
    '/jobs/remote': {
        image: `${BASE}/remote-pmhnp-jobs-telehealth.webp`,
        alt: 'Remote PMHNP jobs page showing work from home psychiatric nurse practitioner positions with average salary of 171,000 dollars',
        caption: 'Remote and work-from-home PMHNP positions',
        title: 'Remote PMHNP Jobs',
    },
    '/jobs/telehealth': {
        image: `${BASE}/telehealth-pmhnp-positions.webp`,
        alt: 'Telehealth PMHNP jobs page showing virtual psychiatric care positions for nurse practitioners across all 50 states',
        caption: 'Telehealth PMHNP job opportunities',
        title: 'Telehealth PMHNP Jobs',
    },
    '/jobs/travel': {
        image: `${BASE}/travel-pmhnp-nursing-jobs.webp`,
        alt: 'Travel PMHNP nursing jobs page showing contract psychiatric nurse practitioner positions with weekly pay rates',
        caption: 'Travel PMHNP contract positions',
        title: 'Travel PMHNP Jobs',
    },
    '/jobs/per-diem': {
        image: `${BASE}/per-diem-pmhnp-jobs.webp`,
        alt: 'Per diem PMHNP jobs page showing flexible psychiatric nurse practitioner positions with hourly rates',
        caption: 'Per diem PMHNP flexible positions',
        title: 'Per Diem PMHNP Jobs',
    },
    '/jobs/new-grad': {
        image: `${BASE}/new-graduate-pmhnp-jobs.webp`,
        alt: 'New graduate PMHNP jobs page with entry-level psychiatric nurse practitioner positions and mentorship programs',
        caption: 'Entry-level jobs for new PMHNP graduates',
        title: 'New Graduate PMHNP Jobs',
    },
    '/jobs/locations': {
        image: `${BASE}/pmhnp-jobs-by-state-location.webp`,
        alt: 'PMHNP jobs by state and location page showing psychiatric nurse practitioner positions across all 50 states with job counts',
        caption: 'Browse PMHNP jobs by state and city',
        title: 'PMHNP Jobs by Location',
    },
    '/post-job': {
        image: `${BASE}/post-pmhnp-job-listing.webp`,
        alt: 'Post a PMHNP job listing page with form fields for salary, location, and job details on the psychiatric nurse practitioner job board',
        caption: 'Post a PMHNP job on our board',
        title: 'Post a PMHNP Job',
    },
    '/job-alerts': {
        image: `${BASE}/pmhnp-job-alerts-signup.webp`,
        alt: 'PMHNP job alerts signup page to receive email notifications for new psychiatric nurse practitioner positions matching your criteria',
        caption: 'Sign up for PMHNP job alerts',
        title: 'PMHNP Job Alerts',
    },
};

/**
 * Get SEO image config for a given pathname.
 * Falls back to homepage config if no match.
 */
export function getPageImageSEO(pathname: string): PageImageSEO {
    return PAGE_IMAGE_SEO[pathname] ?? PAGE_IMAGE_SEO['/'];
}

/**
 * Get all page image entries for building the image sitemap.
 */
export function getAllPageImages(): Array<{ url: string } & PageImageSEO> {
    return Object.entries(PAGE_IMAGE_SEO).map(([url, seo]) => ({ url, ...seo }));
}
