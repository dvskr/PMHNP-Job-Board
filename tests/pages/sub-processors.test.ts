/**
 * P1 regression — the public sub-processors disclosure omitted OpenAI, Upstash
 * (Redis), and Inngest, all of which receive résumé PII / pseudonymous identifiers
 * in production. GDPR Art. 28 requires every processor to be disclosed. The page
 * exports SUB_PROCESSORS, so we assert against the constant without rendering JSX.
 */
import { describe, it, expect } from 'vitest';
import { SUB_PROCESSORS } from '@/app/sub-processors/page';

describe('SUB_PROCESSORS disclosure list', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(SUB_PROCESSORS)).toBe(true);
    expect(SUB_PROCESSORS.length).toBeGreaterThan(0);
  });

  it('discloses OpenAI (résumé parsing + embeddings)', () => {
    expect(SUB_PROCESSORS.some((sp) => sp.name.toLowerCase().includes('openai'))).toBe(true);
  });

  it('discloses Upstash (rate-limit IPs + cached AI content)', () => {
    expect(SUB_PROCESSORS.some((sp) => sp.name.toLowerCase().includes('upstash'))).toBe(true);
  });

  it('discloses Inngest (event payloads with user IDs + emails)', () => {
    expect(SUB_PROCESSORS.some((sp) => sp.name.toLowerCase().includes('inngest'))).toBe(true);
  });

  it('every entry carries the full set of disclosure fields', () => {
    for (const sp of SUB_PROCESSORS) {
      expect(sp).toHaveProperty('name');
      expect(sp).toHaveProperty('purpose');
      expect(sp).toHaveProperty('dataShared');
      expect(sp).toHaveProperty('location');
      expect(sp).toHaveProperty('transferMechanism');
      expect(sp).toHaveProperty('dpa');
      expect(sp).toHaveProperty('privacyUrl');
    }
  });
});
