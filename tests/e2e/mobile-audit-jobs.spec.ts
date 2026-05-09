/**
 * Mobile Audit: /jobs listing page
 * Viewports: 375x812 (iPhone SE/8), 390x844 (iPhone 14)
 *
 * Run: npx playwright test tests/e2e/mobile-audit-jobs.spec.ts --headed
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const VIEWPORTS = [
  { label: '375x812', width: 375, height: 812 },
  { label: '390x844', width: 390, height: 844 },
];

const OUT_DIR = path.resolve(__dirname, '../../tmp/mobile-audit');

// Ensure output directory exists
fs.mkdirSync(OUT_DIR, { recursive: true });

interface AuditResult {
  viewport: string;
  render: 'PASS' | 'FAIL';
  drawerOpen: 'PASS' | 'FAIL';
  drawerClose: 'PASS' | 'FAIL';
  drawerBackdrop: 'PASS' | 'FAIL';
  bodyScrollLock: 'PASS' | 'FAIL';
  filterApply: 'PASS' | 'FAIL';
  navigation: 'PASS' | 'FAIL';
  overflow: 'PASS' | 'FAIL';
  consoleErrors: string[];
  failedRequests: string[];
  overflowElements: string[];
  defects: string[];
}

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function collectFailedRequests(page: Page): Promise<string[]> {
  const failed: string[] = [];
  page.on('requestfailed', (req) => {
    failed.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      failed.push(`${res.status()} ${res.url()}`);
    }
  });
  return failed;
}

async function detectOverflow(page: Page): Promise<{ hasOverflow: boolean; elements: string[] }> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const docW = document.documentElement.scrollWidth;
    if (docW <= vw) return { hasOverflow: false, elements: [] };

    const all = Array.from(document.querySelectorAll('*'));
    const offenders: string[] = [];
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 2) { // 2px tolerance for sub-pixel rendering
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
        offenders.push(`${tag}${id}${cls} (right: ${Math.round(rect.right)}px)`);
      }
    }
    return { hasOverflow: true, elements: offenders.slice(0, 10) };
  });
}

async function auditViewport(
  page: Page,
  viewport: { label: string; width: number; height: number }
): Promise<AuditResult> {
  const result: AuditResult = {
    viewport: viewport.label,
    render: 'FAIL',
    drawerOpen: 'FAIL',
    drawerClose: 'FAIL',
    drawerBackdrop: 'FAIL',
    bodyScrollLock: 'FAIL',
    filterApply: 'FAIL',
    navigation: 'FAIL',
    overflow: 'FAIL',
    consoleErrors: [],
    failedRequests: [],
    overflowElements: [],
    defects: [],
  };

  const consoleErrors = await collectConsoleErrors(page);
  const failedRequests = await collectFailedRequests(page);

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/jobs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // ── Full-page screenshot ──────────────────────────────────────────────────
  const screenshotPath = path.join(OUT_DIR, `jobs-${viewport.label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // ── 1. Render check ───────────────────────────────────────────────────────
  try {
    // Search input (AI search bar)
    const searchInput = page.locator('input[aria-label="Describe the role you want"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Mobile filter trigger button (class jp-mobile-filter-btn)
    const filterBtn = page.locator('.jp-mobile-filter-btn');
    await expect(filterBtn).toBeVisible({ timeout: 5000 });

    // Job cards
    const jobCards = page.locator('[data-testid="job-card"], .job-card, a[href^="/jobs/"]').first();
    // Try multiple selectors — check if at least one job card/link is present
    const cardCount = await page.locator('a[href*="/jobs/"]').count();
    if (cardCount === 0) {
      result.defects.push('No job card links found — job list may not render');
    }

    result.render = 'PASS';
  } catch (e) {
    result.defects.push(`Render: ${(e as Error).message}`);
  }

  // ── 2. Open mobile filter drawer ─────────────────────────────────────────
  try {
    const filterBtn = page.locator('.jp-mobile-filter-btn');
    await filterBtn.click();

    // Drawer should appear: role=dialog
    const drawer = page.locator('[role="dialog"][aria-label="Filter jobs"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    result.drawerOpen = 'PASS';

    // Screenshot of open drawer
    await page.screenshot({
      path: path.join(OUT_DIR, `jobs-${viewport.label}-drawer-open.png`),
      fullPage: false,
    });

    // ── 3. Body scroll lock ─────────────────────────────────────────────
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    if (bodyOverflow === 'hidden') {
      result.bodyScrollLock = 'PASS';
    } else {
      result.defects.push(
        `Body scroll not locked when drawer open — body.style.overflow="${bodyOverflow}" (components/MobileFilterDrawer.tsx:14)`
      );
    }

    // ── 4. Close button ─────────────────────────────────────────────────
    const closeBtn = drawer.locator('button[aria-label="Close filters"]');
    const closeBtnAlt = drawer.locator('button').filter({ hasText: /close/i }).or(
      drawer.locator('button svg').locator('..').first()
    );
    const closeBtnVisible = (await closeBtn.count()) > 0
      ? await closeBtn.isVisible()
      : await closeBtnAlt.isVisible().catch(() => false);

    if (closeBtnVisible) {
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
      } else {
        // Try the X button inside header
        const xBtn = drawer.locator('button').first();
        await xBtn.click();
      }
      await expect(drawer).not.toBeVisible({ timeout: 3000 });
      result.drawerClose = 'PASS';
    } else {
      result.defects.push('Close button not found in drawer — check components/MobileFilterDrawer.tsx');
    }

    // ── 5. Backdrop dismiss ─────────────────────────────────────────────
    // Re-open drawer
    await filterBtn.click();
    const drawer2 = page.locator('[role="dialog"][aria-label="Filter jobs"]');
    await expect(drawer2).toBeVisible({ timeout: 5000 });

    // Click backdrop (fixed inset-0 bg-black/50 div)
    const backdrop = page.locator('.fixed.inset-0.bg-black\\/50, [aria-hidden="true"]').first();
    if (await backdrop.count() > 0) {
      await backdrop.click({ position: { x: viewport.width - 20, y: 200 } });
      await expect(drawer2).not.toBeVisible({ timeout: 3000 });
      result.drawerBackdrop = 'PASS';
    } else {
      result.defects.push('Backdrop element not found — drawer may not have proper dismissal (components/MobileFilterDrawer.tsx:44)');
    }
  } catch (e) {
    result.defects.push(`Drawer UX: ${(e as Error).message}`);
  }

  // ── 6. Filter apply ───────────────────────────────────────────────────────
  try {
    // Re-open drawer if closed
    const filterBtn = page.locator('.jp-mobile-filter-btn');
    await filterBtn.click();

    const drawer = page.locator('[role="dialog"][aria-label="Filter jobs"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Look for a job-type or work-mode checkbox inside the drawer
    const telehealth = drawer.locator('text=Telehealth, input[value*="telehealth" i], input[value*="remote" i]').first();
    const anyCheckbox = drawer.locator('input[type="checkbox"]').first();

    let filterClicked = false;
    if (await anyCheckbox.count() > 0) {
      await anyCheckbox.check({ force: true });
      filterClicked = true;
    }

    if (!filterClicked) {
      // Try clicking a label text
      const label = drawer.locator('label').first();
      if (await label.count() > 0) {
        await label.click();
        filterClicked = true;
      }
    }

    if (filterClicked) {
      // Apply / close drawer — look for apply button or just close
      const applyBtn = drawer.locator('button').filter({ hasText: /apply|show|done/i }).first();
      if (await applyBtn.count() > 0) {
        await applyBtn.click();
      } else {
        // Close drawer and let URL params update
        const xBtn = drawer.locator('button').first();
        await xBtn.click();
      }
      // Wait for potential network re-fetch
      await page.waitForTimeout(1500);
      result.filterApply = 'PASS';
    } else {
      result.defects.push('Could not find any filter checkbox in drawer to apply filter');
    }
  } catch (e) {
    result.defects.push(`Filter apply: ${(e as Error).message}`);
  }

  // ── 7. Job card navigation ────────────────────────────────────────────────
  try {
    // Find first job card link
    const jobLink = page.locator('a[href^="/jobs/"]').first();
    if (await jobLink.count() > 0) {
      const href = await jobLink.getAttribute('href');
      await jobLink.click();
      await page.waitForURL(`**${href}**`, { timeout: 10000 });
      result.navigation = 'PASS';
      await page.screenshot({
        path: path.join(OUT_DIR, `jobs-${viewport.label}-detail.png`),
        fullPage: false,
      });
      // Go back for next checks
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
    } else {
      result.defects.push('No job card links found for navigation test');
    }
  } catch (e) {
    result.defects.push(`Navigation: ${(e as Error).message}`);
  }

  // ── 8. Horizontal overflow ────────────────────────────────────────────────
  try {
    const { hasOverflow, elements } = await detectOverflow(page);
    result.overflowElements = elements;
    if (hasOverflow) {
      result.overflow = 'FAIL';
      result.defects.push(`Horizontal overflow detected. Offending elements: ${elements.slice(0, 5).join(', ')}`);
    } else {
      result.overflow = 'PASS';
    }
  } catch (e) {
    result.defects.push(`Overflow check: ${(e as Error).message}`);
  }

  // ── 9. Collect console + network errors ───────────────────────────────────
  result.consoleErrors = consoleErrors.filter(
    (e) => !e.includes('NEXT_REDIRECT') && !e.includes('favicon')
  );
  result.failedRequests = failedRequests.filter(
    (r) => !r.includes('favicon') && !r.includes('204')
  );

  return result;
}

test.describe('Mobile audit — /jobs listing page', () => {
  test.use({ storageState: undefined });

  for (const viewport of VIEWPORTS) {
    test(`Viewport ${viewport.label}`, async ({ page }) => {
      test.setTimeout(120_000);
      const result = await auditViewport(page, viewport);

      // Print structured result
      console.log('\n' + '='.repeat(60));
      console.log(`VIEWPORT: ${result.viewport}`);
      console.log('='.repeat(60));
      console.log(`  Render:         ${result.render}`);
      console.log(`  Drawer open:    ${result.drawerOpen}`);
      console.log(`  Drawer close:   ${result.drawerClose}`);
      console.log(`  Backdrop dim:   ${result.drawerBackdrop}`);
      console.log(`  Body scroll lock: ${result.bodyScrollLock}`);
      console.log(`  Filter apply:   ${result.filterApply}`);
      console.log(`  Navigation:     ${result.navigation}`);
      console.log(`  Overflow:       ${result.overflow}`);
      if (result.overflowElements.length > 0) {
        console.log(`  Overflow elements:`);
        result.overflowElements.forEach((el) => console.log(`    - ${el}`));
      }
      if (result.consoleErrors.length > 0) {
        console.log(`  Console errors:`);
        result.consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e}`));
      }
      if (result.failedRequests.length > 0) {
        console.log(`  Failed requests:`);
        result.failedRequests.slice(0, 5).forEach((r) => console.log(`    - ${r}`));
      }
      if (result.defects.length > 0) {
        console.log(`  Defects:`);
        result.defects.forEach((d) => console.log(`    [DEFECT] ${d}`));
      }
      console.log(`  Screenshots saved to: ${OUT_DIR}`);

      // Write JSON report
      const reportPath = path.join(OUT_DIR, `report-${viewport.label}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

      // The test passes regardless — we're auditing, not gating CI
      // Fail only on critical render failure
      expect(result.render, `Page render failed at ${viewport.label}`).toBe('PASS');
    });
  }
});
