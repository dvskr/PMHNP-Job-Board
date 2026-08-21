/**
 * publicJobsWhere() is the canonical "visible on /jobs" predicate every
 * site-wide count must use. It has to stay byte-identical to the base
 * buildWhereClause() starts from, or advertised counts drift above the
 * filtered results again (caught in the 2026-08 audit).
 */
import { describe, it, expect } from 'vitest';
import type { Prisma } from '@prisma/client';
import { buildWhereClause, publicJobsWhere, GLOBAL_EXCLUSIONS } from '@/lib/filters';
import { DEFAULT_FILTERS } from '@/types/filters';

describe('publicJobsWhere', () => {
  it('serializes identically to buildWhereClause with default (empty) filters', () => {
    expect(JSON.stringify(publicJobsWhere())).toBe(JSON.stringify(buildWhereClause(DEFAULT_FILTERS)));
  });

  it('requires isPublished and negates every global exclusion', () => {
    const where = publicJobsWhere();
    expect(where.isPublished).toBe(true);
    const and = where.AND as Prisma.JobWhereInput[];
    expect(and).toHaveLength(GLOBAL_EXCLUSIONS.length);
    for (const clause of and) {
      expect(clause).toHaveProperty('NOT');
    }
  });

  it('returns a fresh object per call so callers can extend it safely', () => {
    const first = publicJobsWhere();
    const second = publicJobsWhere();
    expect(first).not.toBe(second);
    expect(first.AND).not.toBe(second.AND);
  });
});
