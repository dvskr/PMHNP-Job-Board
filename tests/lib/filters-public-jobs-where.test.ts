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

const NOW = new Date('2026-09-02T12:00:00.000Z');

describe('publicJobsWhere', () => {
  it('serializes identically to buildWhereClause with default (empty) filters', () => {
    expect(JSON.stringify(publicJobsWhere(NOW))).toBe(
      JSON.stringify(buildWhereClause(DEFAULT_FILTERS, NOW)),
    );
  });

  it('requires isPublished and negates every global exclusion', () => {
    const where = publicJobsWhere(NOW);
    expect(where.isPublished).toBe(true);
    const and = where.AND as Prisma.JobWhereInput[];
    // One expiry clause, then one negation per global exclusion.
    expect(and).toHaveLength(GLOBAL_EXCLUSIONS.length + 1);
    for (const clause of and.slice(1)) {
      expect(clause).toHaveProperty('NOT');
    }
  });

  it('excludes postings past their expiry, matching the detail page 410 gate', () => {
    // Without this the listing kept a card for a job whose detail URL answers
    // 410 Gone, for as long as the twice-daily cleanup-expired cron took to run.
    const and = publicJobsWhere(NOW).AND as Prisma.JobWhereInput[];
    expect(and[0]).toEqual({ OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] });
  });

  it('returns a fresh object per call so callers can extend it safely', () => {
    const first = publicJobsWhere();
    const second = publicJobsWhere();
    expect(first).not.toBe(second);
    expect(first.AND).not.toBe(second.AND);
  });
});
