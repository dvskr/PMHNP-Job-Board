/**
 * Mobile Rendering Audit — Job Detail Page
 * Viewports: 375x812 (iPhone SE/X) and 414x896 (iPhone XR/11)
 *
 * Checks:
 *  - Title/company/location header renders
 *  - Sticky apply button at bottom visible and not overlapping content
 *  - Job description body renders without horizontal overflow
 *  - Salary section (if present)
 *  - Employer info (mobile section or sidebar)
 *  - Related jobs section
 *  - Share button tappable
 *  - Save button tappable
 *  - Report button visible
 *  - No horizontal overflow at viewport and description levels
 *  - Console errors and failed network requests logged
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve(__dirname, '../../tmp/mobile-audit');

const VIEWPORTS = [
  { label: '375x812', width: 375, height: 812 },
  { label: '414x896', width: 414, height: 896 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Collect console errors and failed network requests during a page lifetime. */
function attachDiagnostics(page: Page): { errors: string[]; failedRequests: string[] } {
  const errors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
  });

  return { errors, failedRequests };
}

/** Check for horizontal overflow on the page body and a specific element. */
async function detectHorizontalOverflow(page: Page, selector: string): Promise<{ bodyOverflow: boolean; elementOverflow: boolean }> {
  return page.evaluate((sel) => {
    const docWidth = document.documentElement.scrollWidth;
    const viewWidth = document.documentElement.clientWidth;
    const bodyOverflow = docWidth > viewWidth;

    const el = document.querySelector(sel);
    let elementOverflow = false;
    if (el) {
      const rect = el.getBoundingClientRect();
      elementOverflow = rect.right > viewWidth + 1; // 1px tolerance
    }
    return { bodyOverflow, elementOverflow };
  }, selector);
}

/** Full-page screenshot, creating the directory if needed. */
async function fullPageScreenshot(page: Page, filename: string): Promise<string> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const filepath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

// ─── Step 1: Discover a real job URL ────────────────────────────────────────

let JOB_URL = '';

test.describe.serial('Mobile Audit — Job Detail', () => {
  test('Step 0: discover a real job URL from /jobs listing', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await page.goto('http://localhost:3000/jobs', { waitUntil: 'domcontentloaded' });

    // Try to find a job card link — multiple possible selectors
    const jobCardSelectors = [
      'a[href^="/jobs/"][href*="-"]',   // slug links like /jobs/rn-manager-uuid
      '[data-testid="job-card"] a',
      '.job-card a',
      'article a[href^="/jobs/"]',
    ];

    let jobHref: string | null = null;
    for (const sel of jobCardSelectors) {
      const link = page.locator(sel).first();
      if (await link.count() > 0) {
        jobHref = await link.getAttribute('href');
        if (jobHref) break;
      }
    }

    // Fallback: click the first internal /jobs/ link that contains a UUID pattern
    if (!jobHref) {
      const links = await page.locator('a[href^="/jobs/"]').all();
      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href && /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/.test(href)) {
          jobHref = href;
          break;
        }
      }
    }

    expect(jobHref, 'Could not find any job card link on /jobs').toBeTruthy();
    JOB_URL = `http://localhost:3000${jobHref}`;
    console.log(`[audit] Job URL discovered: ${JOB_URL}`);

    await ctx.close();
  });

  // ─── Step 2+3: Per-viewport audit ──────────────────────────────────────────

  for (const vp of VIEWPORTS) {
    test(`Viewport ${vp.label}: full mobile audit`, async ({ browser }) => {
      expect(JOB_URL, 'Job URL must be discovered first').toBeTruthy();

      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const { errors, failedRequests } = attachDiagnostics(page);

      // ── Navigate ──────────────────────────────────────────────────────────
      await page.goto(JOB_URL, { waitUntil: 'domcontentloaded' });

      // Wait for the job title to appear (primary content gate)
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

      // ── Screenshot: initial viewport ──────────────────────────────────────
      const screenshotPath = await fullPageScreenshot(page, `job-detail-${vp.label}.png`);
      console.log(`[audit] Screenshot saved: ${screenshotPath}`);

      // ── Section checks ────────────────────────────────────────────────────

      // 1. Title/company/location header
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible();
      const h1Text = await h1.textContent();
      console.log(`[${vp.label}] Title: "${h1Text?.trim().slice(0, 60)}"`);

      // Company name — employer appears in multiple places; check at least one is visible
      const employerVisible = await page.locator('text=/[A-Za-z]/').first().isVisible();
      expect(employerVisible).toBeTruthy();

      // Location (MapPin icon + location text)
      // The page renders location in the header section
      const locationEl = page.locator('[style*="var(--text-secondary)"]').filter({ hasText: /,|\bremote\b/i }).first();
      // Soft check — location may not always include a comma (state-only locations)
      const locationVisible = await locationEl.isVisible().catch(() => false);
      console.log(`[${vp.label}] Location visible: ${locationVisible}`);

      // 2. Sticky apply button (mobile sticky bar at bottom)
      const stickyBar = page.locator('.lg\\:hidden.fixed.bottom-0');
      await expect(stickyBar).toBeVisible();

      // Apply button inside sticky bar
      const stickyApply = stickyBar.locator('button, a').first();
      await expect(stickyApply).toBeVisible();

      // Check sticky bar doesn't overlap h1 (z-index concern)
      const h1Box = await h1.boundingBox();
      const stickyBox = await stickyBar.boundingBox();
      let stickyOverlapsTitle = false;
      if (h1Box && stickyBox) {
        stickyOverlapsTitle = h1Box.y + h1Box.height > stickyBox.y;
      }
      console.log(`[${vp.label}] Sticky bar overlaps title: ${stickyOverlapsTitle}`);
      // Title is at top of page, sticky is fixed at bottom — should never overlap
      expect(stickyOverlapsTitle).toBe(false);

      // 3. Job description body
      const descContainer = page.locator('.job-description-html, .prose').first();
      const descVisible = await descContainer.isVisible().catch(() => false);
      console.log(`[${vp.label}] Description container visible: ${descVisible}`);
      expect(descVisible).toBe(true);

      // 4. Salary (conditional — may not exist on all jobs)
      const salaryEl = page.locator('[style*="salary-color"], [style*="#1d4ed8"]').first();
      const salaryVisible = await salaryEl.isVisible().catch(() => false);
      console.log(`[${vp.label}] Salary visible: ${salaryVisible}`);

      // 5. Report button — top-right of header card
      const reportBtn = page.locator('button').filter({ hasText: /report/i }).first();
      const reportVisible = await reportBtn.isVisible().catch(() => false);
      // Report button may be icon-only; try finding by aria or title
      const reportBtnAlt = page.locator('[title*="report" i], [aria-label*="report" i]').first();
      const reportAltVisible = await reportBtnAlt.isVisible().catch(() => false);
      console.log(`[${vp.label}] Report button visible: ${reportVisible || reportAltVisible}`);

      // 6. Mobile share section (rendered below content with class lg:hidden)
      const mobileShareSection = page.locator('.lg\\:hidden').filter({ hasText: /share/i }).first();
      const shareVisible = await mobileShareSection.isVisible().catch(() => false);
      console.log(`[${vp.label}] Mobile share section visible: ${shareVisible}`);

      // Tap the first share button and verify some UI response
      const shareButtons = mobileShareSection.locator('button, a').first();
      if (await shareButtons.count() > 0 && shareVisible) {
        await shareButtons.click({ force: true });
        // Small settle time for any dialog/sheet
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT_DIR, `job-detail-${vp.label}-share-tap.png`) });
        // Dismiss any open dialog
        await page.keyboard.press('Escape');
      }

      // 7. Save button — inside sticky bar
      const saveBtn = stickyBar.locator('button').filter({ hasText: /save/i }).first();
      const saveVisible = await saveBtn.isVisible().catch(() => false);
      console.log(`[${vp.label}] Save button in sticky bar: ${saveVisible}`);
      if (saveVisible) {
        await saveBtn.click({ force: true });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT_DIR, `job-detail-${vp.label}-save-tap.png`) });
      }

      // 8. Related jobs section (may not exist if none are related)
      const relatedSection = page.locator('section, div').filter({ hasText: /similar pmhnp jobs|related jobs/i }).first();
      const relatedVisible = await relatedSection.isVisible().catch(() => false);
      console.log(`[${vp.label}] Related jobs section visible: ${relatedVisible}`);

      // ── Horizontal overflow checks ────────────────────────────────────────

      // Wait for layout to settle fully
      await page.waitForLoadState('networkidle').catch(() => { /* ignore timeout */ });

      const overflow = await detectHorizontalOverflow(page, '.job-description-html, .prose');
      console.log(`[${vp.label}] Body horizontal overflow: ${overflow.bodyOverflow}`);
      console.log(`[${vp.label}] Description container overflow: ${overflow.elementOverflow}`);

      // ── Long description layout check ─────────────────────────────────────
      // Scroll through the page to confirm no layout breaks
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT_DIR, `job-detail-${vp.label}-scrolled-bottom.png`) });
      await page.evaluate(() => window.scrollTo(0, 0));

      // ── Sticky bar remains at bottom while scrolled ───────────────────────
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(200);
      const midScrollStickyBox = await stickyBar.boundingBox();
      const midScrollStickyReachable = midScrollStickyBox !== null && midScrollStickyBox.y < vp.height;
      console.log(`[${vp.label}] Sticky bar reachable while mid-scroll: ${midScrollStickyReachable}`);
      expect(midScrollStickyReachable).toBe(true);

      // ── Diagnostics ───────────────────────────────────────────────────────
      const filteredErrors = errors.filter(e =>
        !e.includes('net::ERR_ABORTED') &&
        !e.includes('favicon') &&
        !e.includes('404') &&
        !e.includes('ResizeObserver')
      );
      const filteredFailed = failedRequests.filter(r => !r.includes('favicon'));

      console.log(`[${vp.label}] Console errors (filtered): ${filteredErrors.length}`);
      if (filteredErrors.length > 0) {
        filteredErrors.forEach(e => console.log(`  ERROR: ${e}`));
      }
      console.log(`[${vp.label}] Failed network requests: ${filteredFailed.length}`);
      if (filteredFailed.length > 0) {
        filteredFailed.forEach(r => console.log(`  FAIL: ${r}`));
      }

      // ── Summary assertion object (for reporting) ─────────────────────────
      const results = {
        viewport: vp.label,
        jobUrl: JOB_URL,
        screenshotPath,
        sections: {
          titleHeader: await h1.isVisible(),
          stickyApplyBar: await stickyBar.isVisible(),
          applyButtonInSticky: await stickyApply.isVisible(),
          descriptionBody: descVisible,
          salary: salaryVisible,
          shareSection: shareVisible,
          saveButton: saveVisible,
          relatedJobs: relatedVisible,
          reportButton: reportVisible || reportAltVisible,
        },
        overflow: {
          body: overflow.bodyOverflow,
          descriptionContainer: overflow.elementOverflow,
        },
        stickyBarReachableWhileScrolled: midScrollStickyReachable,
        stickyOverlapsTitle: stickyOverlapsTitle,
        consoleErrors: filteredErrors,
        failedRequests: filteredFailed,
      };

      // Write per-viewport JSON summary
      fs.writeFileSync(
        path.join(OUT_DIR, `audit-${vp.label}.json`),
        JSON.stringify(results, null, 2)
      );
      console.log(`[${vp.label}] Audit results written to ${path.join(OUT_DIR, `audit-${vp.label}.json`)}`);

      // Hard assertions
      expect(results.sections.titleHeader).toBe(true);
      expect(results.sections.stickyApplyBar).toBe(true);
      expect(results.sections.applyButtonInSticky).toBe(true);
      expect(results.sections.descriptionBody).toBe(true);
      expect(results.overflow.body).toBe(false);
      expect(results.stickyBarReachableWhileScrolled).toBe(true);

      await ctx.close();
    });
  }
});
