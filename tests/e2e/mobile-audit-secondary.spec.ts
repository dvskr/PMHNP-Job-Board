/**
 * Mobile audit for secondary pages at 375x812.
 * Captures full-page screenshots to tmp/mobile-audit/secondary-<page>.png
 * and checks for:
 *   - Blank / error-overlay pages
 *   - Horizontal overflow (scrollWidth > clientWidth)
 *   - Footer reachability
 *   - Policy-page specifics (long-string overflow in pre/code)
 *   - Pricing tier card stacking
 *   - CTA tap-target size (>=44px)
 *   - Companies card grid (1-column)
 *   - Console errors
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const VIEWPORT = { width: 375, height: 812 };
const OUT_DIR = path.resolve(__dirname, '../../tmp/mobile-audit');

// Ensure output dir exists
fs.mkdirSync(OUT_DIR, { recursive: true });

interface AuditResult {
  url: string;
  slug: string;
  status: number | null;
  finalUrl: string;
  hasContent: boolean;
  hasErrorOverlay: boolean;
  horizontalOverflow: boolean;
  overflowDetails: string[];
  footerReachable: boolean;
  consoleErrors: string[];
  screenshot: string;
  notes: string[];
}

const PAGES = [
  { slug: 'privacy',          path: '/privacy' },
  { slug: 'terms',            path: '/terms' },
  { slug: 'faq',              path: '/faq' },
  { slug: 'pricing',          path: '/pricing' },
  { slug: 'for-employers',    path: '/for-employers' },
  { slug: 'for-job-seekers',  path: '/for-job-seekers' },
  { slug: 'companies',        path: '/companies' },
  { slug: 'salary-guide',     path: '/salary-guide' },
  { slug: '1099-vs-w2',       path: '/resources/1099-vs-w2' },
  { slug: 'dashboard',        path: '/dashboard' },
  { slug: 'admin-health',     path: '/admin/health' },
];

// Shared results collector
const results: AuditResult[] = [];

async function auditPage(
  page: Page,
  slug: string,
  url: string,
  screenshotPath: string,
  isPolicyPage = false,
  isPricing = false,
  isCompanies = false,
  isFaq = false,
): Promise<AuditResult> {
  const consoleErrors: string[] = [];
  const notes: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Navigate and capture response status
  let status: number | null = null;
  let finalUrl = url;

  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  }).catch(() => null);

  if (response) {
    status = response.status();
  }
  finalUrl = page.url();

  // Wait for network to settle a bit (avoid hard timeout)
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  // Check for error overlay (Next.js error page, 404 overlay, etc.)
  const hasErrorOverlay = await page.evaluate(() => {
    const selectors = [
      '#__next-build-error',
      'nextjs-portal',
      '[data-nextjs-dialog]',
      'body:has(> #__next:empty)',
    ];
    return selectors.some((s) => {
      try { return !!document.querySelector(s); } catch { return false; }
    });
  });

  // Check content: body must have visible text beyond just whitespace
  const hasContent = await page.evaluate(() => {
    const body = document.body;
    if (!body) return false;
    const text = body.innerText?.trim() ?? '';
    return text.length > 50;
  });

  // Horizontal overflow check: compare scrollWidth vs clientWidth at document level
  // and also check for any element that individually overflows
  const overflowInfo = await page.evaluate(() => {
    const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const offenders: string[] = [];

    if (docOverflow) {
      // Find the specific offending elements
      const all = document.querySelectorAll('*');
      const vw = document.documentElement.clientWidth;
      all.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 2) { // 2px tolerance
          const tag = el.tagName.toLowerCase();
          const cls = (el.className && typeof el.className === 'string')
            ? '.' + el.className.split(' ').slice(0, 2).join('.')
            : '';
          offenders.push(`${tag}${cls} (right=${Math.round(rect.right)})`);
        }
      });
    }

    return { overflow: docOverflow, offenders: offenders.slice(0, 10) };
  });

  // Policy page: check pre/code blocks for overflow
  let policyPreOverflow = false;
  if (isPolicyPage) {
    policyPreOverflow = await page.evaluate(() => {
      const blocks = document.querySelectorAll('pre, code');
      const vw = document.documentElement.clientWidth;
      return Array.from(blocks).some((el) => el.scrollWidth > vw);
    });
    if (policyPreOverflow) {
      notes.push('DEFECT: pre/code block horizontal overflow on policy page');
    }
  }

  // Footer reachability
  const footerReachable = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    if (!footer) return false;
    const rect = footer.getBoundingClientRect();
    // Footer exists and is within the scrollable area
    return footer.offsetHeight > 0 && footer.offsetWidth > 0;
  });

  // Pricing: check CTA button min tap size (44px)
  if (isPricing) {
    const smallCtaCount = await page.evaluate(() => {
      const btns = document.querySelectorAll('a[href], button');
      let count = 0;
      btns.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.height < 44) {
          const text = (el as HTMLElement).innerText?.trim();
          // Only count prominent CTA-like buttons, not nav links
          if (text && text.length > 2 && text.length < 50) {
            count++;
          }
        }
      });
      return count;
    });
    if (smallCtaCount > 3) {
      notes.push(`WARN: ${smallCtaCount} buttons below 44px tap target on pricing page`);
    }
  }

  // Companies: check if card grid collapses to 1 column
  if (isCompanies) {
    const gridInfo = await page.evaluate(() => {
      // Look for grid/flex containers with multiple children
      const grids = document.querySelectorAll('[class*="grid"], [class*="card"], [class*="Grid"]');
      const vw = document.documentElement.clientWidth;
      let multiColFound = false;

      grids.forEach((grid) => {
        const children = Array.from(grid.children);
        if (children.length < 2) return;
        const rects = children.slice(0, 4).map((c) => c.getBoundingClientRect());
        // If two adjacent items have similar top y values AND both fit within vw, it's multi-column
        const hasSameRow = rects.some((r, i) =>
          i > 0 && Math.abs(r.top - rects[i - 1].top) < 10 && r.left > 10
        );
        if (hasSameRow) multiColFound = true;
      });

      return multiColFound;
    });
    if (gridInfo) {
      notes.push('DEFECT: Company card grid not collapsing to single column at 375px');
    }
  }

  // FAQ: check accordions exist and are keyboard/tap accessible
  if (isFaq) {
    const accordionCount = await page.evaluate(() => {
      const items = document.querySelectorAll(
        '[data-radix-accordion-item], details, [data-accordion], [class*="accordion"]'
      );
      return items.length;
    });
    if (accordionCount === 0) {
      notes.push('WARN: No accordion elements detected on FAQ page');
    } else {
      notes.push(`INFO: ${accordionCount} accordion items found on FAQ page`);
    }
  }

  // Full-page screenshot
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });

  return {
    url,
    slug,
    status,
    finalUrl,
    hasContent,
    hasErrorOverlay,
    horizontalOverflow: overflowInfo.overflow || policyPreOverflow,
    overflowDetails: overflowInfo.offenders,
    footerReachable,
    consoleErrors,
    screenshot: screenshotPath,
    notes,
  };
}

test.describe('Mobile Audit – Secondary Pages', () => {
  test.use({ viewport: VIEWPORT });

  for (const page_def of PAGES) {
    test(`audit: ${page_def.slug}`, async ({ page }) => {
      const screenshotPath = path.join(OUT_DIR, `secondary-${page_def.slug}.png`);
      const url = `http://localhost:3000${page_def.path}`;

      const isPolicyPage = ['/privacy', '/terms'].includes(page_def.path);
      const isPricing = page_def.path === '/pricing';
      const isCompanies = page_def.path === '/companies';
      const isFaq = page_def.path === '/faq';
      const isProtected = ['/dashboard', '/admin/health'].includes(page_def.path);

      const result = await auditPage(
        page,
        page_def.slug,
        url,
        screenshotPath,
        isPolicyPage,
        isPricing,
        isCompanies,
        isFaq,
      );

      results.push(result);

      // Log result for visibility
      console.log(`\n=== ${page_def.slug.toUpperCase()} ===`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Final URL: ${result.finalUrl}`);
      console.log(`  Has content: ${result.hasContent}`);
      console.log(`  Error overlay: ${result.hasErrorOverlay}`);
      console.log(`  Horizontal overflow: ${result.horizontalOverflow}`);
      if (result.overflowDetails.length) {
        console.log(`  Overflow elements: ${result.overflowDetails.join(', ')}`);
      }
      console.log(`  Footer reachable: ${result.footerReachable}`);
      if (result.consoleErrors.length) {
        console.log(`  Console errors: ${result.consoleErrors.join(' | ')}`);
      }
      if (result.notes.length) {
        console.log(`  Notes: ${result.notes.join(' | ')}`);
      }
      console.log(`  Screenshot: ${screenshotPath}`);

      // Assertions
      // Protected pages: we just validate the resulting state is clean (redirect to login is OK)
      if (isProtected) {
        // Should have content (login page or error page rendered cleanly)
        expect(result.hasContent, `${page_def.slug}: protected page should render something`).toBe(true);
        expect(result.hasErrorOverlay, `${page_def.slug}: no error overlay`).toBe(false);
      } else {
        // Public pages: must render actual content
        expect(result.hasContent, `${page_def.slug}: should have visible content`).toBe(true);
        expect(result.hasErrorOverlay, `${page_def.slug}: no Next.js error overlay`).toBe(false);
        // Policy pages must not have horizontal overflow
        if (isPolicyPage) {
          expect(
            result.horizontalOverflow,
            `${page_def.slug}: policy page must not have horizontal overflow`
          ).toBe(false);
        }
      }
    });
  }
});
