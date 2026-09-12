/**
 * The location box promises more than the predicate used to deliver. The
 * homepage hero's placeholder reads "City or 'Remote'" and the /jobs sidebar's
 * reads "City, state, or 'Remote'", but buildWhereClause matched ONLY a state
 * name or a state code: typing "Remote", or any city, or "Austin, TX" returned
 * zero jobs from a box that had just offered exactly that.
 *
 * These pin the three shapes the box advertises. City is matched with `equals`
 * and never `contains` — a contains match is what inflated Kansas counts via
 * "Kansas City, MO", which is why city matching was dropped originally.
 */
import { describe, it, expect } from 'vitest';
import type { Prisma } from '@prisma/client';
import { locationClause, buildWhereClause, workModeClause } from '@/lib/filters';
import { DEFAULT_FILTERS } from '@/types/filters';

const NOW = new Date('2026-09-13T12:00:00.000Z');

/** The clauses buildWhereClause appended on top of its public base. */
function addedClauses(location: string): Prisma.JobWhereInput[] {
  const base = buildWhereClause(DEFAULT_FILTERS, NOW).AND as Prisma.JobWhereInput[];
  const withLocation = buildWhereClause(
    { ...DEFAULT_FILTERS, location },
    NOW,
  ).AND as Prisma.JobWhereInput[];
  return withLocation.slice(base.length);
}

describe('locationClause', () => {
  it('resolves "Remote" to the work-mode flag, not to a place', () => {
    // "Remote" is not a state and not a city, so routing it through the
    // location columns matched nothing at all.
    expect(locationClause('Remote')).toEqual(workModeClause('remote'));
    expect(locationClause('remote')).toEqual(workModeClause('remote'));
    expect(locationClause('  REMOTE  ')).toEqual(workModeClause('remote'));
  });

  it('matches a bare city by exact name, alongside state name and code', () => {
    const clause = locationClause('Austin');
    expect(clause).toEqual({
      OR: [
        { state: { equals: 'Austin', mode: 'insensitive' } },
        { stateCode: { equals: 'Austin', mode: 'insensitive' } },
        { city: { equals: 'Austin', mode: 'insensitive' } },
      ],
    });
  });

  it('never uses a substring match on city (the "Kansas City, MO" inflation)', () => {
    // A `contains` here is what made a search for Kansas return Kansas City, MO.
    expect(JSON.stringify(locationClause('Kansas'))).not.toContain('contains');
    expect(JSON.stringify(locationClause('Kansas City, MO'))).not.toContain('contains');
  });

  it('requires city AND state together for the "Austin, TX" form people type', () => {
    expect(locationClause('Austin, TX')).toEqual({
      city: { equals: 'Austin', mode: 'insensitive' },
      OR: [
        { state: { equals: 'TX', mode: 'insensitive' } },
        { stateCode: { equals: 'TX', mode: 'insensitive' } },
      ],
    });
  });

  it('still matches a state by full name or two-letter code', () => {
    const byName = locationClause('Texas') as Prisma.JobWhereInput;
    expect(byName.OR).toContainEqual({ state: { equals: 'Texas', mode: 'insensitive' } });
    const byCode = locationClause('TX') as Prisma.JobWhereInput;
    expect(byCode.OR).toContainEqual({ stateCode: { equals: 'TX', mode: 'insensitive' } });
  });

  it('treats blank input as no filter rather than as an empty-string match', () => {
    expect(locationClause('')).toBeNull();
    expect(locationClause('   ')).toBeNull();
  });
});

describe('buildWhereClause routes ?location= through locationClause', () => {
  it('appends the remote work-mode clause for ?location=Remote', () => {
    expect(addedClauses('Remote')).toEqual([workModeClause('remote')]);
  });

  it('appends a city-aware OR for a city name', () => {
    const [clause] = addedClauses('Austin');
    expect(clause).toEqual(locationClause('Austin'));
  });

  it('adds nothing when the location is only whitespace', () => {
    expect(addedClauses('   ')).toEqual([]);
  });
});
