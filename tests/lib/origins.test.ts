/**
 * FIRST_PARTY_ORIGINS is the shared allowlist behind BOTH the CSRF origin
 * check (lib/csrf.ts) and the CORS Access-Control-Allow-Origin header
 * (middleware.ts).
 *
 * Hunt 2026-09-03: it hard-coded http://localhost:3000 and :3001
 * unconditionally, so in production a request whose Origin was a page served
 * from the visitor's own machine counted as first-party on both surfaces.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function setNodeEnv(value: string) {
  vi.stubEnv('NODE_ENV', value);
}

describe('FIRST_PARTY_ORIGINS', () => {
  it('contains no localhost origin in production', async () => {
    setNodeEnv('production');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    const { FIRST_PARTY_ORIGINS } = await import('@/lib/origins');
    expect(FIRST_PARTY_ORIGINS.some((o) => o.includes('localhost'))).toBe(false);
    expect(FIRST_PARTY_ORIGINS.some((o) => o.includes('127.0.0.1'))).toBe(false);
  });

  it('still lists the production hosts in production', async () => {
    setNodeEnv('production');
    const { FIRST_PARTY_ORIGINS } = await import('@/lib/origins');
    expect(FIRST_PARTY_ORIGINS).toContain('https://pmhnphiring.com');
    expect(FIRST_PARTY_ORIGINS).toContain('https://www.pmhnphiring.com');
  });

  it('keeps the localhost origins outside production', async () => {
    setNodeEnv('development');
    const { FIRST_PARTY_ORIGINS } = await import('@/lib/origins');
    expect(FIRST_PARTY_ORIGINS).toContain('http://localhost:3000');
    expect(FIRST_PARTY_ORIGINS).toContain('http://localhost:3001');
  });

  it('admits a non-standard dev port through NEXT_PUBLIC_BASE_URL', async () => {
    setNodeEnv('development');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3100');
    const { FIRST_PARTY_ORIGINS } = await import('@/lib/origins');
    expect(FIRST_PARTY_ORIGINS).toContain('http://localhost:3100');
  });
});
