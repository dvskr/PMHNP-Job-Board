/**
 * Regression guards (audit highs) for issues that are about wiring/config rather
 * than runtime behavior. Each test reads the real source file and asserts the
 * fix is still in place, so a future edit can't silently reintroduce the bug.
 *
 *   H2  — committed real credentials in a Playwright script
 *   H6  — blog newsletter signup posted to the wrong endpoint
 *   H8  — About CTA linked to a non-existent /sign-up route
 *   H9  — resume-extraction script not traced into the Vercel bundle
 *   H10 — job-detail ISR defeated by a cookies() read (getCurrentUser)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('H2 — no committed credentials', () => {
  it('inspect-apply-modal.ts reads creds from env, not hardcoded', () => {
    const src = read('scripts/inspect-apply-modal.ts');
    expect(src).not.toContain('1729@Sensei');
    expect(src).not.toContain('dvskr.1234@gmail.com');
    expect(src).toContain('process.env.TEST_LOGIN_EMAIL');
    expect(src).toContain('process.env.TEST_LOGIN_PASSWORD');
  });

  it('known leaked passwords do not appear in tracked source dirs', () => {
    const banned = ['1729@Sensei'];
    const dirs = ['app', 'lib', 'components', 'scripts'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) return;
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) {
          const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          for (const b of banned) if (src.includes(b)) hits.push(`${rel} contains "${b}"`);
        }
      }
    };
    dirs.forEach(walk);
    expect(hits).toEqual([]);
  });
});

describe('H6 — blog newsletter signup endpoint', () => {
  it('BlogEmailSignup posts to /api/newsletter and checks res.ok', () => {
    const src = read('components/BlogEmailSignup.tsx');
    expect(src).toContain('/api/newsletter');
    expect(src).not.toContain('/api/email-job');
    expect(src).toMatch(/res\.ok/);
  });
});

describe('H8 — About CTA points at a real route', () => {
  it('AboutClient links to /signup, not /sign-up', () => {
    const src = read('app/about/AboutClient.tsx');
    expect(src).not.toContain('href="/sign-up"');
    expect(src).toContain('href="/signup"');
  });
});

describe('H9 — resume extraction script is traced into the bundle', () => {
  it('next.config traces extract-pdf-text.js for the autofill route', () => {
    const src = read('next.config.ts');
    expect(src).toContain('/api/autofill/extract-resume-sections');
    expect(src).toContain('extract-pdf-text.js');
  });
});

describe('H10 — job-detail page stays ISR-cacheable', () => {
  it('does not import/call getCurrentUser (cookies read), and keeps revalidate', () => {
    const src = read('app/jobs/[slug]/page.tsx');
    // getCurrentUser() reads cookies() -> opts the whole route out of ISR.
    // Guard on the import: you can't call it without importing it, and this
    // isn't fooled by the explanatory comment that mentions the name.
    expect(src).not.toMatch(/import\s*\{[^}]*getCurrentUser[^}]*\}\s*from/);
    expect(src).toMatch(/export const revalidate\s*=\s*3600/);
  });
});
