/**
 * Regression guard: the floating-footer / nested-body-scroller bug
 * (resume-studio screenshot, 2026-08: footer floating mid-viewport with
 * studio-canvas paint below it down to the window bottom).
 *
 * Mechanism (reproduced in tmp/studio-harness and tmp/harness-geometry.html):
 *   - globals.css hides the native page scrollbar and lets <ScrollIndicator/>
 *     draw it, reading document.documentElement geometry only.
 *   - `body { overflow-x: hidden }` forces body's overflow-y to compute to
 *     `auto`, making body a SECOND, invisible vertical scroll container nested
 *     inside the html scroller.
 *   - Any element that overflows the min-height:100vh layout wrapper
 *     (app/layout.tsx) then gives body hidden scroll range: wheel input chains
 *     html -> body, body.scrollTop rises, the in-flow footer floats
 *     mid-viewport, overflow content paints below it, and every probe that
 *     checks documentElement.scrollHeight == footerBottom stays green.
 *   - Collateral: position:sticky studio rails anchored to body, not the
 *     viewport, so they never stuck.
 *
 * Fix: `overflow-x: clip` on body. clip forbids horizontal overflow WITHOUT
 * creating a scroll container, so body's overflow-y stays `visible`, html is
 * the only page scroller, and any rogue overflow surfaces where probes and
 * ScrollIndicator can see it. (Same cure the blog already ships in
 * components/blog/EditorialStickyFix.tsx / app/editorial.css.)
 *
 * These tests read the real sources so a future edit cannot silently
 * reintroduce the nested scroller.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** First `body { ... }` rule body in a stylesheet (element selector only,
 *  not body::-webkit-scrollbar etc.). */
function bodyRuleBlock(css: string): string {
  const m = css.match(/(?:^|\n)\s*body\s*\{([^}]*)\}/);
  expect(m, 'globals.css must contain a `body { ... }` rule').toBeTruthy();
  return m![1];
}

/** Last declared value wins in CSS; return it for a property. */
function lastDeclaration(block: string, prop: string): string | undefined {
  const re = new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'g');
  let value: string | undefined;
  for (const m of block.matchAll(re)) value = m[1].trim();
  return value;
}

describe('body must never become a nested vertical scroll container', () => {
  const css = read('app/globals.css');
  const body = bodyRuleBlock(css);

  it('body overflow-x resolves to clip, not hidden', () => {
    // A `hidden` fallback line for old engines is allowed, but the LAST
    // (winning) declaration must be clip.
    expect(lastDeclaration(body, 'overflow-x')).toBe('clip');
  });

  it('body declares no overflow-y and no shorthand overflow (would recreate the scroller)', () => {
    expect(lastDeclaration(body, 'overflow-y')).toBeUndefined();
    expect(lastDeclaration(body, 'overflow')).toBeUndefined();
  });

  it('html stays the single page scroller (overflow-y: scroll)', () => {
    const m = css.match(/(?:^|\n)\s*html\s*\{([^}]*)\}/);
    expect(m, 'globals.css must contain an `html { ... }` rule').toBeTruthy();
    expect(lastDeclaration(m![1], 'overflow-y')).toBe('scroll');
  });
});

describe('resume-studio pane containment and sticky invariants', () => {
  const src = read('components/resume-studio/ResumeStudio.tsx');

  it('.rs-scrollpane is position:relative so absolute descendants cannot escape its clip', () => {
    const rule = src.match(/\.rs-scrollpane\{([^}]*)\}/);
    expect(rule, 'STUDIO_CSS must define .rs-scrollpane').toBeTruthy();
    expect(rule![1]).toContain('position:relative');
    expect(rule![1]).toContain('overflow-y:auto');
  });

  it('.rs-rail keeps position:sticky (anchors to the viewport now that body is not a scroller)', () => {
    const rule = src.match(/\.rs-rail\{([^}]*)\}/);
    expect(rule, 'STUDIO_CSS must define .rs-rail').toBeTruthy();
    expect(rule![1]).toContain('position:sticky');
  });

  it('no overflow values on .rs-root/.rs-container/.rs-grid (would kill the sticky rail)', () => {
    // The documented invariant at the bottom of STUDIO_CSS: these ancestors
    // guard sideways overflow with max-width ONLY.
    for (const sel of ['\\.rs-root', '\\.rs-container', '\\.rs-grid'] as const) {
      const rules = [...src.matchAll(new RegExp(`${sel}\\{([^}]*)\\}`, 'g'))];
      for (const r of rules) {
        expect(r[1], `${sel} must not declare overflow`).not.toMatch(/overflow(-[xy])?\s*:/);
      }
    }
  });
});
