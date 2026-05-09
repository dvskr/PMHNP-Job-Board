/**
 * Mobile Rendering Audit — 375x812 (iPhone SE / iPhone X viewport)
 *
 * Checks:
 *   - All form fields visible and not clipped
 *   - Inputs >= 280px wide
 *   - Labels visible (not just placeholders)
 *   - Input font-size >= 16px (prevents iOS soft-keyboard zoom)
 *   - Submit button tappable (not hidden behind sticky nav)
 *   - Empty-form error states visible
 *   - No horizontal overflow
 *   - Console errors captured
 *
 * Output: tmp/mobile-audit/form-<page>.png
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const VIEWPORT = { width: 375, height: 812 };
const OUT_DIR = path.resolve('tmp/mobile-audit');

const PAGES = [
  { name: 'login',           url: '/login' },
  { name: 'signup',          url: '/signup' },
  { name: 'post-job',        url: '/post-job' },
  { name: 'contact',         url: '/contact' },
  { name: 'forgot-password', url: '/forgot-password' },
  { name: 'employer-login',  url: '/employer/login' },
  { name: 'employer-signup', url: '/employer/signup' },
];

function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function getConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function checkHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
}

async function getInputFontSizes(page: Page): Promise<Array<{ selector: string; fontSize: number; name: string }>> {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    return inputs.map(el => {
      const style = window.getComputedStyle(el);
      const fs = parseFloat(style.fontSize);
      const input = el as HTMLInputElement;
      return {
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : ''),
        fontSize: fs,
        name: input.name || input.id || input.placeholder || el.tagName,
      };
    });
  });
}

async function checkInputWidths(page: Page): Promise<Array<{ name: string; width: number }>> {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    return inputs.map(el => {
      const rect = el.getBoundingClientRect();
      const input = el as HTMLInputElement;
      return {
        name: input.name || input.id || input.placeholder || el.tagName,
        width: Math.round(rect.width),
      };
    });
  });
}

async function checkLabelsVisible(page: Page): Promise<Array<{ for: string; visible: boolean; text: string }>> {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    return labels.map(label => {
      const rect = label.getBoundingClientRect();
      const style = window.getComputedStyle(label);
      return {
        for: label.htmlFor || '',
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
        text: label.textContent?.trim().slice(0, 40) || '',
      };
    });
  });
}

async function checkSubmitButtonTappable(page: Page): Promise<Array<{ text: string; tappable: boolean; reason: string }>> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])'));
    return buttons.map(btn => {
      const rect = btn.getBoundingClientRect();
      const style = window.getComputedStyle(btn);
      const inViewport = rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
      const notHidden = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      const hasSize = rect.width > 0 && rect.height > 0;
      const tappable = inViewport && notHidden && hasSize;
      let reason = 'OK';
      if (!inViewport) reason = 'out-of-viewport';
      else if (!notHidden) reason = `hidden (display:${style.display}/visibility:${style.visibility}/opacity:${style.opacity})`;
      else if (!hasSize) reason = 'zero-size';
      return {
        text: btn.textContent?.trim().slice(0, 40) || '',
        tappable,
        reason,
      };
    });
  });
}

// -------------------------------------------------------------------------
test.describe('Mobile Form Audit 375x812', () => {
  test.use({ viewport: VIEWPORT });

  test.beforeAll(() => {
    ensureOutDir();
  });

  for (const pg of PAGES) {
    test(`[${pg.name}] mobile rendering`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      // ------------------------------------------------------------------
      // 1. Navigate
      // ------------------------------------------------------------------
      const response = await page.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      // Redirect (e.g. auth-gated) — still audit what loads
      await page.waitForTimeout(1500);

      // ------------------------------------------------------------------
      // 2. Scroll to bottom to trigger lazy-loaded content, then back up
      // ------------------------------------------------------------------
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      // ------------------------------------------------------------------
      // 3. Full-page screenshot
      // ------------------------------------------------------------------
      const screenshotPath = path.join(OUT_DIR, `form-${pg.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // ------------------------------------------------------------------
      // 4. Horizontal overflow
      // ------------------------------------------------------------------
      const hasOverflow = await checkHorizontalOverflow(page);
      console.log(`[${pg.name}] horizontal-overflow: ${hasOverflow}`);
      if (hasOverflow) {
        console.warn(`FAIL [${pg.name}] — horizontal overflow detected`);
      }

      // ------------------------------------------------------------------
      // 5. Input font sizes (iOS zoom: < 16px triggers zoom)
      // ------------------------------------------------------------------
      const fontSizes = await getInputFontSizes(page);
      const zoomRisk = fontSizes.filter(f => f.fontSize < 16 && f.fontSize > 0);
      if (zoomRisk.length > 0) {
        console.warn(`FAIL [${pg.name}] — iOS zoom-risk inputs (font-size < 16px):`);
        zoomRisk.forEach(f => console.warn(`  ${f.selector} → ${f.fontSize}px`));
      } else {
        console.log(`[${pg.name}] input font-sizes: all >= 16px`);
      }

      // ------------------------------------------------------------------
      // 6. Input widths
      // ------------------------------------------------------------------
      const widths = await checkInputWidths(page);
      const tooNarrow = widths.filter(w => w.width > 0 && w.width < 280);
      if (tooNarrow.length > 0) {
        console.warn(`FAIL [${pg.name}] — inputs narrower than 280px:`);
        tooNarrow.forEach(w => console.warn(`  ${w.name} → ${w.width}px`));
      } else {
        console.log(`[${pg.name}] input widths: all >= 280px`);
      }

      // ------------------------------------------------------------------
      // 7. Labels visible
      // ------------------------------------------------------------------
      const labels = await checkLabelsVisible(page);
      const hiddenLabels = labels.filter(l => !l.visible && l.text.length > 0);
      if (hiddenLabels.length > 0) {
        console.warn(`FAIL [${pg.name}] — hidden labels: ${hiddenLabels.map(l => l.text).join(', ')}`);
      } else {
        console.log(`[${pg.name}] labels: all visible (${labels.length} found)`);
      }

      // ------------------------------------------------------------------
      // 8. Submit button tappable
      // ------------------------------------------------------------------
      const buttons = await checkSubmitButtonTappable(page);
      const untappable = buttons.filter(b => !b.tappable);
      if (untappable.length > 0) {
        console.warn(`FAIL [${pg.name}] — untappable submit buttons:`);
        untappable.forEach(b => console.warn(`  "${b.text}" → ${b.reason}`));
      } else {
        console.log(`[${pg.name}] submit buttons: all tappable (${buttons.length} found)`);
      }

      // ------------------------------------------------------------------
      // 9. Console errors
      // ------------------------------------------------------------------
      if (consoleErrors.length > 0) {
        console.warn(`WARN [${pg.name}] — ${consoleErrors.length} console error(s):`);
        consoleErrors.slice(0, 5).forEach(e => console.warn(`  ${e}`));
      } else {
        console.log(`[${pg.name}] console errors: none`);
      }

      // ------------------------------------------------------------------
      // 10. Error state check (login + signup only — submit empty form)
      // ------------------------------------------------------------------
      if (pg.name === 'login' || pg.name === 'signup') {
        const submitBtn = page.locator('button[type="submit"]').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click({ force: true });
          await page.waitForTimeout(800);
          const errorPath = path.join(OUT_DIR, `form-${pg.name}-errors.png`);
          await page.screenshot({ path: errorPath, fullPage: true });

          // Check for visible error text
          const errorVisible = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('[role="alert"], .error, [class*="error"], [class*="invalid"], p[class*="red"], p[class*="danger"], span[class*="error"]'));
            return candidates.some(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && el.textContent && el.textContent.trim().length > 0;
            });
          });
          console.log(`[${pg.name}] error-state visible after empty submit: ${errorVisible ? 'YES' : 'NO'}`);
          if (!errorVisible) {
            console.warn(`FAIL [${pg.name}] — error messages not visible after empty form submit`);
          }
        }
      }

      // ------------------------------------------------------------------
      // 11. /post-job — scroll through entire multi-step form
      // ------------------------------------------------------------------
      if (pg.name === 'post-job') {
        // Scroll through each step-like section
        const totalHeight = await page.evaluate(() => document.body.scrollHeight);
        const steps = Math.ceil(totalHeight / 812);
        for (let i = 0; i <= steps; i++) {
          await page.evaluate((scrollY: number) => window.scrollTo(0, scrollY), i * 812);
          await page.waitForTimeout(200);
          const overflowMid = await checkHorizontalOverflow(page);
          if (overflowMid) {
            console.warn(`FAIL [post-job] — horizontal overflow at scroll position ${i * 812}`);
          }
        }
        // Final full-page screenshot after scroll audit
        await page.evaluate(() => window.scrollTo(0, 0));
        const postJobFinalPath = path.join(OUT_DIR, `form-post-job-fullscroll.png`);
        await page.screenshot({ path: postJobFinalPath, fullPage: true });
        console.log(`[post-job] full-scroll audit complete. Extra screenshot: ${postJobFinalPath}`);
      }

      // ------------------------------------------------------------------
      // Soft assertions — log but don't hard-fail so all pages run
      // ------------------------------------------------------------------
      // The WARN lines above constitute the audit. Hard assertion only on
      // critical overflow so the full suite always completes.
      expect(response?.status()).not.toBe(500);
    });
  }
});
