/**
 * A11y MEDIUM regression locks. Vitest env is 'node' (no DOM), so we assert on
 * the exported token values and on the presence of required ARIA / label-binding
 * attributes in the component source. These fail if the attributes/contrast fix
 * are ever removed.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');
}

describe('authTokens contrast', () => {
  it('helperStyle.color is the AA-passing #4B5E68 (not the failing #6B7F8A)', async () => {
    const { helperStyle } = await import('@/components/auth/authTokens');
    expect((helperStyle as React.CSSProperties).color).toBe('#4B5E68');
  });
});

describe('auth error banners announce to screen readers', () => {
  it('LoginContent error banner carries role="alert"', () => {
    expect(read('components/auth/LoginContent.tsx')).toMatch(/role\s*=\s*["']alert["']/);
  });
  it('SignUpForm error banner carries role="alert"', () => {
    expect(read('components/auth/SignUpForm.tsx')).toMatch(/role\s*=\s*["']alert["']/);
  });
});

describe('SalaryCalculator selects are label-associated', () => {
  const src = read('components/SalaryCalculator.tsx');
  for (const key of ['sal-state', 'sal-experience', 'sal-setting', 'sal-specialty']) {
    it(`${key} has both id and htmlFor`, () => {
      expect(src).toContain(`id="${key}"`);
      expect(src).toContain(`htmlFor="${key}"`);
    });
  }
});

describe('LicensureChecker state select is label-associated', () => {
  it('has id="lic-state" and htmlFor="lic-state"', () => {
    const src = read('components/LicensureChecker.tsx');
    expect(src).toContain('id="lic-state"');
    expect(src).toContain('htmlFor="lic-state"');
  });
});

describe('MobileFilterDrawer keeps closed controls out of tab order', () => {
  it('returns null when not open (controls fully unmounted)', () => {
    expect(read('components/MobileFilterDrawer.tsx')).toMatch(/if\s*\(\s*!isOpen\s*\)\s*return\s*null/);
  });
});
