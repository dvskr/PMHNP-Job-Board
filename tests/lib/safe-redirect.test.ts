/**
 * Regression (audit medium) — login/signup/OAuth-callback used
 * `startsWith('/')` to validate redirect targets, which lets `//evil.com` and
 * `/\evil.com` through (browsers resolve them to an external origin). The
 * shared safeInternalPath() guard closes that.
 */
import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/auth/safe-redirect';

describe('safeInternalPath — open-redirect guard', () => {
  it('accepts plain internal paths', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard');
    expect(safeInternalPath('/jobs/remote?page=2')).toBe('/jobs/remote?page=2');
    expect(safeInternalPath('/')).toBe('/');
  });

  it('rejects protocol-relative and backslash tricks', () => {
    expect(safeInternalPath('//evil.com')).toBe('/dashboard');
    expect(safeInternalPath('/\\evil.com')).toBe('/dashboard');
    expect(safeInternalPath('///evil.com')).toBe('/dashboard');
  });

  it('rejects absolute URLs, userinfo tricks, and non-paths', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/dashboard');
    expect(safeInternalPath('@evil.com')).toBe('/dashboard');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/dashboard');
    expect(safeInternalPath('evil.com')).toBe('/dashboard');
  });

  it('rejects empty / non-string / control characters and honors fallback', () => {
    expect(safeInternalPath('')).toBe('/dashboard');
    expect(safeInternalPath(undefined)).toBe('/dashboard');
    expect(safeInternalPath(null)).toBe('/dashboard');
    expect(safeInternalPath('/foo\nbar')).toBe('/dashboard');
    expect(safeInternalPath('//evil.com', '/login')).toBe('/login');
  });
});
