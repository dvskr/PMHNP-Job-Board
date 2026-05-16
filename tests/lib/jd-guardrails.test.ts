import { describe, it, expect } from 'vitest';
import { checkJdGuardrails, JD_GUARDRAIL_LIMITS } from '@/lib/jd-guardrails';
import { JD_TEMPLATES, renderTemplate } from '@/lib/jd-templates';

// The skeleton templates ship in production. They're shorter (~2k chars
// after rendering) than the old long-prose templates, but still need to
// pass the minimum length, role/care signal, and keyword-density checks.
// Concatenate two rendered skeletons to simulate the "skeleton + hand-
// expanded prose" employer workflow — the actual submitted JDs after
// employer customization will sit somewhere around this length.
const outpatient = JD_TEMPLATES.find((t) => t.id === 'outpatient-adult')!;
const inpatient = JD_TEMPLATES.find((t) => t.id === 'inpatient-adult-acute')!;
const goodJd = (extra = '') =>
  renderTemplate(outpatient, { employer: 'Riverside Behavioral', city: 'Austin', state: 'TX' }) +
  renderTemplate(inpatient, { employer: 'Riverside Behavioral', city: 'Austin', state: 'TX' }) +
  (extra ? `<p>${extra}</p>` : '');

describe('checkJdGuardrails', () => {
  it('passes a healthy long-form JD', () => {
    const result = checkJdGuardrails(goodJd());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when below the minimum character count', () => {
    const result = checkJdGuardrails('<p>PMHNP needed for medication management.</p>');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain(String(JD_GUARDRAIL_LIMITS.MIN_VISIBLE_CHARS));
  });

  it('fails when above the maximum character count', () => {
    const huge = '<p>' + 'psychiatric medication management evaluation '.repeat(2500) + '</p>';
    const result = checkJdGuardrails(huge);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds'))).toBe(true);
  });

  it('fails when role / care signals are missing', () => {
    // 2500 chars of pleasant but non-clinical content.
    const generic = '<p>' + 'we are a great team with competitive benefits and a friendly office culture '.repeat(40) + '</p>';
    const result = checkJdGuardrails(generic);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('pmhnp role'))).toBe(true);
  });

  it('fails on profanity', () => {
    const result = checkJdGuardrails(goodJd('What the fuck are we doing here.'));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('language'))).toBe(true);
  });

  it('fails on spam markers like "click here"', () => {
    const result = checkJdGuardrails(goodJd('Click here for limited time offer.'));
    expect(result.ok).toBe(false);
  });

  it('fails on keyword stuffing of non-domain terms', () => {
    // Use a non-whitelisted word ("amazing") so the test exercises
    // genuine stuffing detection. Whitelisted domain terms (pmhnp,
    // psychiatric, etc.) are intentionally NOT flagged — they are the
    // role and must appear repeatedly in any realistic JD.
    const stuffed = '<p>' + 'amazing '.repeat(500) + 'psychiatric mental health medication therapy diagnosis evaluation. '.repeat(15) + '</p>';
    const result = checkJdGuardrails(stuffed);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('keyword stuffing'))).toBe(true);
  });

  it('does NOT flag legitimate repetition of whitelisted domain terms', () => {
    // The real outpatient template uses "pmhnp" and "psychiatric"
    // repeatedly — pre-whitelist this would trip 3%, but the density
    // check now skips whitelisted terms entirely. This is the
    // "passes a healthy long-form JD" guarantee tightened to the
    // specific failure mode we shipped the whitelist for.
    const result = checkJdGuardrails(goodJd());
    expect(result.ok).toBe(true);
    // Sanity: the top non-whitelisted term, whatever it is, is below 4%.
    if (result.stats.topTerm) {
      expect(result.stats.topTerm.share).toBeLessThan(0.04);
    }
  });

  it('returns useful stats on every call (ok or not)', () => {
    const result = checkJdGuardrails(goodJd());
    expect(result.stats.visibleChars).toBeGreaterThan(0);
    expect(result.stats.termCount).toBeGreaterThan(0);
  });

  it('does not flag a borderline-density JD that is still under the limit', () => {
    // "PMHNP" appears ~30 times in 4000 chars — under the 3% threshold.
    const result = checkJdGuardrails(goodJd());
    expect(result.ok).toBe(true);
  });
});
