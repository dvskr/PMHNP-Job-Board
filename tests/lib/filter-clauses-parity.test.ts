/**
 * Parity guards for the per-option filter clauses shared by
 * lib/filters.ts:buildWhereClause AND app/api/jobs/filter-counts/route.ts.
 *
 * Backlog #25 — the filter-counts route used to hand-mirror four predicates
 * (work mode, job type incl. the Other/NULL convention, salary floor,
 * specialty keywords) that also lived inline in buildWhereClause, so the
 * two sides could drift silently. Both now consume the same exported
 * helpers (workModeClause / jobTypeClause / salaryAtLeastClause /
 * specialtyClause), and these tests pin:
 *   1. each helper's exact clause shape (what the route counts with), and
 *   2. that buildWhereClause embeds a deep-equal fragment for the same
 *      single-filter FilterState (what /jobs actually filters with).
 *
 * No DB calls — we assert on the Prisma `where` shape directly.
 */
import { describe, it, expect } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  buildWhereClause,
  jobTypeClause,
  salaryAtLeastClause,
  specialtyClause,
  workModeClause,
} from '@/lib/filters';
import { DEFAULT_FILTERS } from '@/types/filters';

/** buildWhereClause always emits AND as an array (GLOBAL_EXCLUSIONS ≥ 1). */
function andConditions(where: Prisma.JobWhereInput): Prisma.JobWhereInput[] {
  expect(Array.isArray(where.AND)).toBe(true);
  return where.AND as Prisma.JobWhereInput[];
}

describe('workModeClause', () => {
  it('remote → isRemote flag', () => {
    expect(workModeClause('remote')).toEqual({ isRemote: true });
  });

  it('hybrid → isHybrid flag', () => {
    expect(workModeClause('hybrid')).toEqual({ isHybrid: true });
  });

  it('onsite → absence of BOTH flags (not a column of its own)', () => {
    expect(workModeClause('onsite')).toEqual({ isRemote: false, isHybrid: false });
  });

  it('buildWhereClause embeds the same clauses, OR-wrapped, for a workMode filter', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, workMode: ['remote', 'onsite'] });
    expect(andConditions(where)).toContainEqual({
      OR: [workModeClause('remote'), workModeClause('onsite')],
    });
  });
});

describe('jobTypeClause', () => {
  it('named types → exact-match IN on the structured column', () => {
    expect(jobTypeClause(['Full-Time', 'Contract'])).toEqual({
      jobType: { in: ['Full-Time', 'Contract'] },
    });
  });

  it('"Other" alone → NULL jobType (unnormalized/unstated rows)', () => {
    expect(jobTypeClause(['Other'])).toEqual({ jobType: null });
  });

  it('named + "Other" → OR of IN and NULL', () => {
    expect(jobTypeClause(['Per Diem', 'Other'])).toEqual({
      OR: [
        { jobType: { in: ['Per Diem'] } },
        { jobType: null },
      ],
    });
  });

  it('buildWhereClause embeds the identical clause for a jobType filter', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, jobType: ['Full-Time', 'Other'] });
    expect(andConditions(where)).toContainEqual(jobTypeClause(['Full-Time', 'Other']));
  });
});

describe('salaryAtLeastClause', () => {
  it('matches when EITHER normalized bound clears the floor', () => {
    expect(salaryAtLeastClause(150000)).toEqual({
      OR: [
        { normalizedMinSalary: { gte: 150000 } },
        { normalizedMaxSalary: { gte: 150000 } },
      ],
    });
  });

  it('buildWhereClause embeds the identical clause for a salaryMin filter', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, salaryMin: 120000 });
    expect(andConditions(where)).toContainEqual(salaryAtLeastClause(120000));
  });
});

describe('specialtyClause', () => {
  it('Telehealth → 5-keyword OR (3 title + 2 description)', () => {
    expect(specialtyClause('Telehealth')).toEqual({
      OR: [
        { title: { contains: 'telehealth', mode: 'insensitive' } },
        { title: { contains: 'telemedicine', mode: 'insensitive' } },
        { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
        { description: { contains: 'telehealth', mode: 'insensitive' } },
        { description: { contains: 'telemedicine', mode: 'insensitive' } },
      ],
    });
  });

  it('Travel → title-only travel/locum OR', () => {
    expect(specialtyClause('Travel')).toEqual({
      OR: [
        { title: { contains: 'travel', mode: 'insensitive' } },
        { title: { contains: 'locum', mode: 'insensitive' } },
      ],
    });
  });

  it('unknown specialty → {} (match-all no-op, defensive arm)', () => {
    expect(specialtyClause('Astrology')).toEqual({});
  });

  it('buildWhereClause embeds the same clauses, OR-wrapped, for a specialty filter', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, specialty: ['Telehealth', 'Travel'] });
    expect(andConditions(where)).toContainEqual({
      OR: [specialtyClause('Telehealth'), specialtyClause('Travel')],
    });
  });

  it('a single specialty still gets the OR envelope (composes with other AND conditions)', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, specialty: ['Telehealth'] });
    expect(andConditions(where)).toContainEqual({ OR: [specialtyClause('Telehealth')] });
  });
});
