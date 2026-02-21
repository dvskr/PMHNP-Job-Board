/**
 * Playwright Feature Recording Script
 *
 * Records smooth video demos of all website features at 4K resolution.
 * Usage:
 *   npx tsx scripts/record-features.ts                 # Run all stories
 *   npx tsx scripts/record-features.ts --story 1       # Run story #1 only
 *   npx tsx scripts/record-features.ts --story 1,3,5   # Run stories 1, 3, 5
 *   npx tsx scripts/record-features.ts --list           # List all stories
 */

import { chromium, type Page, type BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ─── Configuration ─────────────────────────────────────────────
const BASE_URL = 'https://pmhnphiring.com';
const OUTPUT_DIR = path.join(__dirname, '..', 'recordings');

// Full HD viewport — video matches viewport 1:1, no black padding
const DESKTOP_VIEWPORT = { width: 1920, height: 1080 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Pacing — good medium pace, not too slow, not too fast
const PACE = {
    pageLoad: 1500,       // Wait after navigation
    afterClick: 800,      // Wait after clicking
    afterType: 600,       // Wait after typing
    scrollStep: 700,      // Pause between scroll steps
    scrollAmount: 400,    // Pixels per scroll step
    sectionPause: 1200,   // Pause to admire a section
    transitionWait: 1000, // Wait for CSS transitions
    endPause: 2000,       // Pause at end of story
};

// ─── Helpers ───────────────────────────────────────────────────

async function smoothScroll(page: Page, distance: number, direction: 'down' | 'up' = 'down') {
    const step = direction === 'down' ? PACE.scrollAmount : -PACE.scrollAmount;
    const steps = Math.ceil(Math.abs(distance) / Math.abs(step));
    for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, step);
        await page.waitForTimeout(PACE.scrollStep);
    }
}

async function scrollToBottom(page: Page) {
    const height = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
    await smoothScroll(page, height, 'down');
}

async function scrollToTop(page: Page) {
    const current = await page.evaluate(() => window.scrollY);
    if (current > 0) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await page.waitForTimeout(1200);
    }
}

async function typeSlowly(page: Page, selector: string, text: string) {
    await page.click(selector);
    await page.waitForTimeout(300);
    for (const char of text) {
        await page.type(selector, char, { delay: 80 });
    }
    await page.waitForTimeout(PACE.afterType);
}

async function navigateAndWait(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(PACE.pageLoad);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
    const currentTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
    if (currentTheme !== theme) {
        // Try clicking the theme toggle
        const toggleBtn = page.locator('button[aria-label*="Switch to"]').first();
        if (await toggleBtn.isVisible()) {
            await toggleBtn.click();
            await page.waitForTimeout(PACE.transitionWait);
        }
    }
}

async function hoverElement(page: Page, selector: string) {
    const el = page.locator(selector).first();
    if (await el.isVisible()) {
        await el.hover();
        await page.waitForTimeout(500);
    }
}

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Story Definitions ────────────────────────────────────────

interface Story {
    id: number;
    name: string;
    slug: string;
    description: string;
    viewport: 'desktop' | 'mobile';
    variants?: ('light' | 'dark')[];
    run: (page: Page, ctx: BrowserContext) => Promise<void>;
}

const stories: Story[] = [
    // ──────────────────────────────────────────────────────────
    // Story 1: Job Seeker Journey
    // ──────────────────────────────────────────────────────────
    {
        id: 1,
        name: 'Job Seeker Journey',
        slug: 'job-seeker-journey',
        description: 'Complete flow: search → browse → view job → save → sign up for alerts',
        viewport: 'desktop',
        async run(page) {
            // Start at homepage
            await navigateAndWait(page, BASE_URL);
            await page.waitForTimeout(PACE.sectionPause);

            // Type a search query
            await typeSlowly(page, 'input[placeholder*="Job title"]', 'Remote PMHNP');
            await page.waitForTimeout(PACE.afterType);

            // Click search
            const searchBtn = page.locator('button:has-text("Search")').first();
            if (await searchBtn.isVisible()) {
                await searchBtn.click();
                await page.waitForTimeout(PACE.pageLoad);
            }

            // Browse results — scroll down slowly
            await smoothScroll(page, 1200);
            await page.waitForTimeout(PACE.sectionPause);

            // Click on the first job card
            const firstJob = page.locator('a[href^="/jobs/"]').first();
            if (await firstJob.isVisible()) {
                await firstJob.click();
                await page.waitForTimeout(PACE.pageLoad);
            }

            // Read the job — scroll down
            await smoothScroll(page, 1600);
            await page.waitForTimeout(PACE.sectionPause);

            // Scroll back up
            await scrollToTop(page);
            await page.waitForTimeout(800);

            // Click Save button if visible
            const saveBtn = page.locator('button:has-text("Save"), button[aria-label*="Save"]').first();
            if (await saveBtn.isVisible()) {
                await saveBtn.click();
                await page.waitForTimeout(PACE.afterClick);
            }

            // Navigate to Job Alerts
            await navigateAndWait(page, `${BASE_URL}/job-alerts`);
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 2: Homepage Scroll — Desktop Light
    // ──────────────────────────────────────────────────────────
    {
        id: 2,
        name: 'Homepage Scroll — Desktop Light',
        slug: 'homepage-desktop-light',
        description: 'Full homepage scroll in light mode at desktop size',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, BASE_URL);
            await setTheme(page, 'light');
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.endPause);
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // Story 2b: Homepage Scroll — Desktop Dark
    {
        id: 2.1,
        name: 'Homepage Scroll — Desktop Dark',
        slug: 'homepage-desktop-dark',
        description: 'Full homepage scroll in dark mode at desktop size',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, BASE_URL);
            await setTheme(page, 'dark');
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.endPause);
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // Story 2c: Homepage Scroll — Mobile Light
    {
        id: 2.2,
        name: 'Homepage Scroll — Mobile Light',
        slug: 'homepage-mobile-light',
        description: 'Full homepage scroll in light mode at mobile size',
        viewport: 'mobile',
        async run(page) {
            await navigateAndWait(page, BASE_URL);
            await setTheme(page, 'light');
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.endPause);
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // Story 2d: Homepage Scroll — Mobile Dark
    {
        id: 2.3,
        name: 'Homepage Scroll — Mobile Dark',
        slug: 'homepage-mobile-dark',
        description: 'Full homepage scroll in dark mode at mobile size',
        viewport: 'mobile',
        async run(page) {
            await navigateAndWait(page, BASE_URL);
            await setTheme(page, 'dark');
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.endPause);
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 3: Job Search & Filters
    // ──────────────────────────────────────────────────────────
    {
        id: 3,
        name: 'Job Search & Filters',
        slug: 'job-search-filters',
        description: 'Keyword search, location search, filter tabs',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, `${BASE_URL}/jobs`);
            await page.waitForTimeout(PACE.sectionPause);

            // Search by keyword
            const keywordInput = page.locator('input[placeholder*="keyword"], input[placeholder*="Job title"]').first();
            if (await keywordInput.isVisible()) {
                await typeSlowly(page, 'input[placeholder*="keyword"], input[placeholder*="Job title"]', 'Telehealth');
                // Press enter or click search
                await page.keyboard.press('Enter');
                await page.waitForTimeout(PACE.pageLoad);
            }

            // Browse results
            await smoothScroll(page, 1000);
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToTop(page);

            // Clear and search by location
            if (await keywordInput.isVisible()) {
                await keywordInput.click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.waitForTimeout(400);
            }

            const locationInput = page.locator('input[placeholder*="location"], input[placeholder*="City"]').first();
            if (await locationInput.isVisible()) {
                await typeSlowly(page, 'input[placeholder*="location"], input[placeholder*="City"]', 'California');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(PACE.pageLoad);
            }

            // Browse results
            await smoothScroll(page, 1000);
            await page.waitForTimeout(PACE.sectionPause);

            // Visit Remote category
            await navigateAndWait(page, `${BASE_URL}/jobs/remote`);
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.sectionPause);

            // Visit New Grad category
            await navigateAndWait(page, `${BASE_URL}/jobs/new-grad`);
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 4: Category Pages Tour
    // ──────────────────────────────────────────────────────────
    {
        id: 4,
        name: 'Category Pages Tour',
        slug: 'category-pages-tour',
        description: 'Tour through Remote, Telehealth, Travel, New Grad, Per Diem pages',
        viewport: 'desktop',
        async run(page) {
            const categories = [
                { path: '/jobs/remote', label: 'Remote' },
                { path: '/jobs/telehealth', label: 'Telehealth' },
                { path: '/jobs/travel', label: 'Travel' },
                { path: '/jobs/new-grad', label: 'New Grad' },
                { path: '/jobs/per-diem', label: 'Per Diem' },
            ];

            for (const cat of categories) {
                await navigateAndWait(page, `${BASE_URL}${cat.path}`);
                await smoothScroll(page, 1200);
                await page.waitForTimeout(PACE.sectionPause);
                await scrollToTop(page);
                await page.waitForTimeout(600);
            }
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 5: Salary Guide
    // ──────────────────────────────────────────────────────────
    {
        id: 5,
        name: 'Salary Guide',
        slug: 'salary-guide',
        description: 'Full scrollthrough of the salary guide page with data tables',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, `${BASE_URL}/salary-guide`);
            await page.waitForTimeout(PACE.sectionPause);

            // Slow scroll to admire data
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.endPause);
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 6: Location Directory
    // ──────────────────────────────────────────────────────────
    {
        id: 6,
        name: 'Location Directory',
        slug: 'location-directory',
        description: 'Browse locations → click state → see state jobs → click city',
        viewport: 'desktop',
        async run(page) {
            // Locations main page
            await navigateAndWait(page, `${BASE_URL}/jobs/locations`);
            await smoothScroll(page, 1200);
            await page.waitForTimeout(PACE.sectionPause);

            // Click California (or first state link)
            const stateLink = page.locator('a[href*="/jobs/state/california"]').first();
            if (await stateLink.isVisible()) {
                await stateLink.click();
            } else {
                await navigateAndWait(page, `${BASE_URL}/jobs/state/california`);
            }
            await page.waitForTimeout(PACE.pageLoad);

            // Browse state jobs
            await smoothScroll(page, 1200);
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToTop(page);

            // Navigate to a city
            const cityLink = page.locator('a[href*="/jobs/city/"]').first();
            if (await cityLink.isVisible()) {
                await cityLink.click();
                await page.waitForTimeout(PACE.pageLoad);
                await smoothScroll(page, 800);
            } else {
                await navigateAndWait(page, `${BASE_URL}/jobs/city/new-york`);
                await smoothScroll(page, 800);
            }
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 7: Blog & Content
    // ──────────────────────────────────────────────────────────
    {
        id: 7,
        name: 'Blog & Content',
        slug: 'blog-content',
        description: 'Blog listing → click article → read article',
        viewport: 'desktop',
        async run(page) {
            // Blog listing
            await navigateAndWait(page, `${BASE_URL}/blog`);
            await page.waitForTimeout(PACE.sectionPause);
            await smoothScroll(page, 1000);
            await page.waitForTimeout(PACE.sectionPause);

            // Click first blog post
            const firstPost = page.locator('a[href^="/blog/"]').first();
            if (await firstPost.isVisible()) {
                await firstPost.click();
                await page.waitForTimeout(PACE.pageLoad);
            }

            // Read the article — slow scroll
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.endPause);
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 8: Dark Mode Toggle
    // ──────────────────────────────────────────────────────────
    {
        id: 8,
        name: 'Dark Mode Toggle',
        slug: 'dark-mode-toggle',
        description: 'Toggle between light and dark mode, showing the visual difference',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, BASE_URL);
            await setTheme(page, 'light');
            await page.waitForTimeout(PACE.sectionPause);

            // Scroll down a bit in light
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToTop(page);
            await page.waitForTimeout(800);

            // Toggle to dark
            await setTheme(page, 'dark');
            await page.waitForTimeout(PACE.sectionPause);

            // Scroll down in dark
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToTop(page);
            await page.waitForTimeout(800);

            // Toggle back to light
            await setTheme(page, 'light');
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 9: Employer Experience
    // ──────────────────────────────────────────────────────────
    {
        id: 9,
        name: 'Employer Experience',
        slug: 'employer-experience',
        description: 'For Employers page → Post a Job form',
        viewport: 'desktop',
        async run(page) {
            // For Employers landing
            await navigateAndWait(page, `${BASE_URL}/for-employers`);
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToTop(page);
            await page.waitForTimeout(800);

            // Post a Job page
            await navigateAndWait(page, `${BASE_URL}/post-job`);
            await page.waitForTimeout(PACE.sectionPause);
            await smoothScroll(page, 1600);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 10: Mobile Responsive Demo
    // ──────────────────────────────────────────────────────────
    {
        id: 10,
        name: 'Mobile Responsive Demo',
        slug: 'mobile-responsive',
        description: 'Full mobile experience: homepage, menu, search, job listing',
        viewport: 'mobile',
        async run(page) {
            // Homepage
            await navigateAndWait(page, BASE_URL);
            await page.waitForTimeout(PACE.sectionPause);

            // Open hamburger menu
            const hamburger = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], .mobile-menu-btn, header button svg').first();
            if (await hamburger.isVisible()) {
                await hamburger.click();
                await page.waitForTimeout(PACE.afterClick);
                // Close menu
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            }

            // Scroll homepage
            await smoothScroll(page, 1200);
            await page.waitForTimeout(PACE.sectionPause);
            await scrollToTop(page);

            // Search
            const searchInput = page.locator('input[placeholder*="keyword"], input[placeholder*="Job title"]').first();
            if (await searchInput.isVisible()) {
                await typeSlowly(page, 'input[placeholder*="keyword"], input[placeholder*="Job title"]', 'PMHNP');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(PACE.pageLoad);
            }

            // Browse results
            await smoothScroll(page, 1000);
            await page.waitForTimeout(PACE.sectionPause);

            // Click a job
            const firstJob = page.locator('a[href^="/jobs/"]').first();
            if (await firstJob.isVisible()) {
                await firstJob.click();
                await page.waitForTimeout(PACE.pageLoad);
                await smoothScroll(page, 1200);
            }
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 11: Job Detail Deep Dive
    // ──────────────────────────────────────────────────────────
    {
        id: 11,
        name: 'Job Detail Deep Dive',
        slug: 'job-detail-deep-dive',
        description: 'Navigate to a job listing, show salary, description, apply button, related jobs',
        viewport: 'desktop',
        async run(page) {
            // Go to jobs page first
            await navigateAndWait(page, `${BASE_URL}/jobs`);
            await page.waitForTimeout(800);

            // Click the first job listing
            const firstJob = page.locator('a[href^="/jobs/"]').first();
            if (await firstJob.isVisible()) {
                await firstJob.click();
                await page.waitForTimeout(PACE.pageLoad);
            }

            // Read the full job detail page slowly
            await page.waitForTimeout(PACE.sectionPause);

            // Hover over apply button if visible
            const applyBtn = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
            if (await applyBtn.isVisible()) {
                await applyBtn.hover();
                await page.waitForTimeout(600);
            }

            // Scroll to description
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.sectionPause);

            // Continue scrolling to related jobs / bottom
            await smoothScroll(page, 1200);
            await page.waitForTimeout(PACE.sectionPause);

            // Scroll to bottom
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.endPause);

            // Back to top
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 12: Saved Jobs Flow
    // ──────────────────────────────────────────────────────────
    {
        id: 12,
        name: 'Saved Jobs Flow',
        slug: 'saved-jobs-flow',
        description: 'Browse jobs → save multiple → view saved page',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, `${BASE_URL}/jobs`);
            await page.waitForTimeout(PACE.sectionPause);

            // Try to save a few jobs by clicking save icons
            const saveButtons = page.locator('button[aria-label*="Save"], button[aria-label*="save"], .save-btn, button:has(svg)');
            const count = await saveButtons.count();
            const toSave = Math.min(count, 3); // Save up to 3 jobs

            for (let i = 0; i < toSave; i++) {
                const btn = saveButtons.nth(i);
                if (await btn.isVisible()) {
                    await btn.click();
                    await page.waitForTimeout(PACE.afterClick);
                }
            }

            // Scroll to see more
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.sectionPause);

            // Navigate to Saved page
            await navigateAndWait(page, `${BASE_URL}/saved`);
            await page.waitForTimeout(PACE.sectionPause);
            await smoothScroll(page, 600);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 13: Job Alerts Signup
    // ──────────────────────────────────────────────────────────
    {
        id: 13,
        name: 'Job Alerts Signup',
        slug: 'job-alerts-signup',
        description: 'Navigate to Job Alerts page, show signup form and options',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, `${BASE_URL}/job-alerts`);
            await page.waitForTimeout(PACE.sectionPause);

            // Scroll through the signup form
            await smoothScroll(page, 800);
            await page.waitForTimeout(PACE.sectionPause);

            // Scroll to bottom
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.sectionPause);

            // Back to top
            await scrollToTop(page);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 14: State Page Deep Dive
    // ──────────────────────────────────────────────────────────
    {
        id: 14,
        name: 'State Page Deep Dive',
        slug: 'state-page-deep-dive',
        description: 'California state page — jobs, practice authority info, FAQs, city links',
        viewport: 'desktop',
        async run(page) {
            await navigateAndWait(page, `${BASE_URL}/jobs/state/california`);
            await page.waitForTimeout(PACE.sectionPause);

            // Slow, complete scroll to show all the content
            await scrollToBottom(page);
            await page.waitForTimeout(PACE.sectionPause);

            // Back to top
            await scrollToTop(page);
            await page.waitForTimeout(800);

            // Visit another state — Texas
            await navigateAndWait(page, `${BASE_URL}/jobs/state/texas`);
            await page.waitForTimeout(PACE.sectionPause);
            await smoothScroll(page, 1200);
            await page.waitForTimeout(PACE.sectionPause);

            // Visit New York
            await navigateAndWait(page, `${BASE_URL}/jobs/state/new-york`);
            await page.waitForTimeout(PACE.sectionPause);
            await smoothScroll(page, 1200);
            await page.waitForTimeout(PACE.endPause);
        },
    },

    // ──────────────────────────────────────────────────────────
    // Story 15: Full Site Speed Demo
    // ──────────────────────────────────────────────────────────
    {
        id: 15,
        name: 'Full Site Speed Demo',
        slug: 'site-speed-demo',
        description: 'Quick-fire navigation between pages showing site speed',
        viewport: 'desktop',
        async run(page) {
            const routes = [
                '/',
                '/jobs',
                '/jobs/remote',
                '/salary-guide',
                '/blog',
                '/jobs/locations',
                '/jobs/state/california',
                '/for-employers',
                '/resources',
                '/about',
                '/faq',
                '/contact',
            ];

            for (const route of routes) {
                await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(1200); // Quick but visible
                await smoothScroll(page, 600);
                await page.waitForTimeout(600);
                await scrollToTop(page);
                await page.waitForTimeout(400);
            }
            await page.waitForTimeout(PACE.endPause);
        },
    },
];

// ─── Recording Engine ──────────────────────────────────────────

async function recordStory(story: Story) {
    const viewport = story.viewport === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
    const storyDir = path.join(OUTPUT_DIR, story.slug);
    ensureDir(storyDir);

    console.log(`\n🎬 Recording: ${story.name}`);
    console.log(`   Resolution: ${viewport.width}x${viewport.height}`);
    console.log(`   Output: ${storyDir}`);

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-default-browser-check',
        ],
    });

    const context = await browser.newContext({
        viewport,
        recordVideo: {
            dir: storyDir,
            size: viewport, // Match viewport exactly — no black padding
        },
        colorScheme: 'light',
        locale: 'en-US',
    });

    const page = await context.newPage();

    try {
        const startTime = Date.now();
        await story.run(page, context);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   ✅ Completed in ${duration}s`);
    } catch (error) {
        console.error(`   ❌ Error: ${error}`);
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }

    // Rename the video file
    try {
        const videoFiles = fs.readdirSync(storyDir).filter(f => f.endsWith('.webm'));
        if (videoFiles.length > 0) {
            const destName = `${story.slug}.webm`;
            const destPath = path.join(storyDir, destName);
            // Find the newest raw video (not the already-renamed one)
            const rawFiles = videoFiles.filter(f => f !== destName);
            const target = rawFiles.length > 0 ? rawFiles.sort().pop()! : videoFiles[0];
            const srcPath = path.join(storyDir, target);

            if (srcPath !== destPath) {
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                fs.renameSync(srcPath, destPath);
            }
            // Clean up any remaining raw webm files
            for (const f of videoFiles) {
                const fp = path.join(storyDir, f);
                if (f !== destName && fs.existsSync(fp)) fs.unlinkSync(fp);
            }
            const size = fs.statSync(destPath).size;
            console.log(`   📦 Video: ${destName} (${(size / 1024 / 1024).toFixed(1)} MB)`);
        }
    } catch (renameErr) {
        console.warn(`   ⚠️ Rename warning: ${renameErr}`);
    }
}

// ─── CLI Entry Point ───────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--list')) {
        console.log('\n📋 Available Recording Stories:\n');
        for (const s of stories) {
            console.log(`  ${String(s.id).padStart(4)}  ${s.name.padEnd(35)} [${s.viewport}]`);
            console.log(`        ${s.description}`);
        }
        console.log(`\n  Total: ${stories.length} stories`);
        process.exit(0);
    }

    let selected = stories;
    const storyArg = args.find(a => a.startsWith('--story'));
    if (storyArg) {
        const idx = args.indexOf(storyArg);
        const ids = (args[idx + 1] || '').split(',').map(Number);
        selected = stories.filter(s => ids.includes(Math.floor(s.id)));
        if (selected.length === 0) {
            console.error('No matching stories found. Use --list to see available stories.');
            process.exit(1);
        }
    }

    ensureDir(OUTPUT_DIR);

    console.log('━'.repeat(60));
    console.log('🎥 PMHNP Hiring — Feature Recording Suite');
    console.log('━'.repeat(60));
    console.log(`  Stories: ${selected.length}`);
    console.log(`  Output:  ${OUTPUT_DIR}`);
    console.log(`  Desktop: ${DESKTOP_VIEWPORT.width}x${DESKTOP_VIEWPORT.height}`);
    console.log(`  Mobile:  ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height}`);
    console.log('━'.repeat(60));

    const overallStart = Date.now();

    for (const story of selected) {
        await recordStory(story);
    }

    const totalTime = ((Date.now() - overallStart) / 1000 / 60).toFixed(1);
    console.log('\n' + '━'.repeat(60));
    console.log(`✅ All ${selected.length} recordings complete! (${totalTime} min)`);
    console.log(`📁 Videos saved to: ${OUTPUT_DIR}`);
    console.log('━'.repeat(60));
}

main().catch(console.error);
