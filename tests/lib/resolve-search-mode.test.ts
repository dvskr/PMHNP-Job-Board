/**
 * F1 regression — the "AI Search" bar on /jobs was a dead end: when the feature
 * flag was off (404), on error, or when it returned 0 results (empty embeddings
 * table, the C1 problem), it discarded the user's typed query and showed a
 * dead-end message. The fix routes all those cases to keyword search, preserving
 * the query. This pins the pure decision helper that drives that fallback.
 */
import { describe, it, expect } from 'vitest';
import { resolveAiSearchMode } from '@/lib/jobs/resolve-search-mode';

const QUERY = 'telehealth child psych CA';

describe('resolveAiSearchMode', () => {
  it('404 (flag off) → keyword-fallback, query preserved', () => {
    const r = resolveAiSearchMode(404, null, QUERY);
    expect(r.mode).toBe('keyword-fallback');
    if (r.mode === 'keyword-fallback') {
      expect(r.reason).toBe('flag-off');
      expect(r.query).toBe(QUERY);
    }
  });

  it('500 → keyword-fallback (error), query preserved', () => {
    const r = resolveAiSearchMode(500, null, QUERY);
    expect(r.mode).toBe('keyword-fallback');
    if (r.mode === 'keyword-fallback') {
      expect(r.reason).toBe('error');
      expect(r.query).toBe(QUERY);
    }
  });

  it('null status (network failure) → keyword-fallback (error)', () => {
    const r = resolveAiSearchMode(null, null, QUERY);
    expect(r.mode).toBe('keyword-fallback');
    if (r.mode === 'keyword-fallback') expect(r.reason).toBe('error');
  });

  it('429 → keyword-fallback (error)', () => {
    const r = resolveAiSearchMode(429, null, QUERY);
    expect(r.mode).toBe('keyword-fallback');
    if (r.mode === 'keyword-fallback') expect(r.reason).toBe('error');
  });

  it('200 + empty array (no embeddings) → keyword-fallback (no-results), query preserved', () => {
    const r = resolveAiSearchMode(200, [], QUERY);
    expect(r.mode).toBe('keyword-fallback');
    if (r.mode === 'keyword-fallback') {
      expect(r.reason).toBe('no-results');
      expect(r.query).toBe(QUERY);
    }
  });

  it('200 + non-empty array → mode:ai', () => {
    const r = resolveAiSearchMode(200, [{ id: 'j1' }, { id: 'j2' }], QUERY);
    expect(r.mode).toBe('ai');
    if (r.mode === 'ai') expect(r.jobs).toHaveLength(2);
  });

  it('ai outcome carries no query field', () => {
    const r = resolveAiSearchMode(200, [{ id: 'j1' }], QUERY);
    expect((r as { query?: string }).query).toBeUndefined();
  });

  it('never trims/mutates the query the caller passes', () => {
    const r = resolveAiSearchMode(404, null, '  telehealth  ');
    if (r.mode === 'keyword-fallback') expect(r.query).toBe('  telehealth  ');
  });
});
