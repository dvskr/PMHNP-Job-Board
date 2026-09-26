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
  FACETED_JOB_TYPES,
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
  const insensitive = (t: string) => ({ jobType: { equals: t, mode: 'insensitive' } });
  // "Other" is the complement of the four faceted options: NULL, or a stored
  // value outside them ('PRN', 'Locum Tenens', 'Internship', and legacy case
  // variants). Before the fix it meant NULL only, which left those postings
  // unreachable by every combination of the five checkboxes.
  const otherClause = {
    OR: [
      { jobType: null },
      { NOT: { OR: FACETED_JOB_TYPES.map(insensitive) } },
    ],
  };

  it('named types match case-insensitively, so legacy "Full-time" is reachable', () => {
    expect(jobTypeClause(['Full-Time', 'Contract'])).toEqual({
      OR: [insensitive('Full-Time'), insensitive('Contract')],
    });
  });

  it('"Other" alone → NULL or anything outside the faceted four', () => {
    expect(jobTypeClause(['Other'])).toEqual(otherClause);
  });

  it('named + "Other" → OR of the named clause and the complement', () => {
    expect(jobTypeClause(['Per Diem', 'Other'])).toEqual({
      OR: [{ OR: [insensitive('Per Diem')] }, otherClause],
    });
  });

  it('selecting every option leaves nothing unreachable', () => {
    // The union of the five options has to be the whole catalogue: any stored
    // jobType is either one of the four (case-insensitively) or caught by the
    // complement branch of "Other".
    const all = jobTypeClause([...FACETED_JOB_TYPES, 'Other']);
    const branches = all.OR as Array<Record<string, unknown>>;
    expect(branches).toHaveLength(2);
    expect(branches[1]).toEqual(otherClause);
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
