/**
 * Two lib/filters.ts regressions from the 2026-09-03 hunt.
 *
 * 1. The LEGACY free-text `experienceLevel` column stores one bucket several
 *    ways ('Mid-Level' and 'Mid Level', 'Senior' and 'Senior Level'). The
 *    filter matched with a case-sensitive `in` on the exact label, so
 *    ?experienceLevel=Mid-Level returned only the hyphenated rows and the
 *    space-form labels had no reachable query value at all.
 *
 * 2. buildWhereClause takes an injectable `now` so callers that must agree
 *    byte-for-byte (and tests) can pin one instant, but the posted-within
 *    branch called freshnessClause(new Date()) and ignored it.
 */
import { describe, it, expect } from 'vitest';
import { buildWhereClause, experienceLevelClause, freshnessClause } from '@/lib/filters';
import type { FilterState } from '@/types/filters';

// Every field spelled out rather than partially cast: FilterState grew the
// structured experience, easy-apply and location fields after this fixture was
// written, and an incomplete literal here silently stopped exercising the
// clauses those fields drive.
const DEFAULT_FILTERS: FilterState = {
  search: '',
  location: '',
  jobType: [],
  workMode: [],
  experienceLevel: [],
  specialty: [],
  newGradFriendly: null,
  minYearsExperience: null,
  easyApply: null,
  salaryMin: null,
  postedWithin: 'all',
  cityExact: null,
  stateCode: null,
  employer: null,
  category: null,
};

function andConditions(where: ReturnType<typeof buildWhereClause>) {
  return (where.AND ?? []) as Array<Record<string, unknown>>;
}

function matchedLabels(clause: ReturnType<typeof experienceLevelClause>): string[] {
  const branches = (clause.OR ?? []) as Array<{ experienceLevel: { equals: string } }>;
  return branches.map((b) => b.experienceLevel.equals);
}

describe('experienceLevelClause', () => {
  it('matches both spellings of the mid bucket', () => {
    expect(matchedLabels(experienceLevelClause(['Mid-Level']))).toEqual(
      expect.arrayContaining(['Mid-Level', 'Mid Level']),
    );
  });

  it('reaches the space-form label as a query value too', () => {
    expect(matchedLabels(experienceLevelClause(['Mid Level']))).toEqual(
      expect.arrayContaining(['Mid-Level', 'Mid Level']),
    );
  });

  it('folds "Senior Level" into the senior bucket', () => {
    expect(matchedLabels(experienceLevelClause(['Senior']))).toEqual(
      expect.arrayContaining(['Senior', 'Senior Level']),
    );
  });

  it('makes "Entry Level" reachable without claiming it is "New Grad"', () => {
    const entry = matchedLabels(experienceLevelClause(['Entry Level']));
    expect(entry).toContain('Entry Level');
    expect(entry).not.toContain('New Grad');
  });

  it('matches case-insensitively', () => {
    const branches = (experienceLevelClause(['senior']).OR ?? []) as Array<{
      experienceLevel: { mode?: string };
    }>;
    for (const b of branches) expect(b.experienceLevel.mode).toBe('insensitive');
  });

  it('falls through to the literal value for an unknown label', () => {
    expect(matchedLabels(experienceLevelClause(['Any']))).toEqual(['Any']);
  });

  it('de-duplicates overlapping requests', () => {
    const labels = matchedLabels(experienceLevelClause(['Senior', 'Senior Level']));
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('buildWhereClause clock injection', () => {
  it('threads the injected now into the posted-within clause', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const where = buildWhereClause({ ...DEFAULT_FILTERS, postedWithin: '7d' }, now);
    expect(andConditions(where)).toContainEqual(freshnessClause(now, '7d'));
  });

  it('is fully deterministic for a pinned instant', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const a = buildWhereClause({ ...DEFAULT_FILTERS, postedWithin: '24h' }, now);
    const b = buildWhereClause({ ...DEFAULT_FILTERS, postedWithin: '24h' }, now);
    expect(a).toEqual(b);
  });
});
