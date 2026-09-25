/**
 * Scaled-content guard for the category x city narrative (2026-09 audit).
 *
 * The audit found the generated paragraph was slot-fill in both directions:
 *
 *   - the city body was byte-identical across every taxonomy for one city, so
 *     /jobs/remote/city/X, /jobs/inpatient/city/X and their siblings shipped
 *     the same prose with one token swapped, and
 *   - ten taxonomy leads interpolated nothing but the city name, so each of
 *     those leads was byte-identical across every city that carried it.
 *
 * That is the shape Google's doorway and scaled-content policies describe: it
 * clusters the siblings, indexes one, and parks the rest in "Crawled,
 * currently not indexed". These tests assert real differentiation rather than
 * the presence of a template, so a future lead that only interpolates the city
 * name fails here instead of in Search Console eight weeks later.
 *
 * Deliberately NOT tested here: MIN_JOBS. The threshold stays 3 (see
 * docs/seo-decision-tree.md); differentiation is the fix, not a higher gate.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCityFacts,
  buildCityNarrative,
  buildTaxonomyCityNarrative,
  getTaxonomyLead,
  TAXONOMY_LEAD_KEYS,
} from '@/lib/pseo/city-narrative';
import { getStatesByAuthority } from '@/lib/state-practice-authority';
import type { CityData } from '@/lib/pseo/city-data/types';

const FULL_STATE = getStatesByAuthority('full')[0];
const RESTRICTED_STATE = getStatesByAuthority('restricted')[0];

/**
 * Same name and state across profiles, so any difference in the output comes
 * from a FACT the lead consumed, never from the city token itself.
 */
function city(overrides: Partial<CityData>): CityData {
  return {
    name: 'Testville',
    state: FULL_STATE,
    stateCode: 'ZZ',
    slug: 'testville-zz',
    population: 1_400_000,
    costOfLivingIndex: 145,
    lat: 0,
    lng: 0,
    metroArea: 'Testville Metro',
    mentalHealthShortage: true,
    healthcareSystems: ['Alpha Health', 'Beta Health', 'Gamma Health'],
    nearbyCities: [],
    providerRatio: 'critical',
    medianIncome: 80_000,
    stateRank: 1,
    ...overrides,
  };
}

/** Dense, expensive, shortage-designated, with named employers. */
const DENSE = buildCityFacts(city({}));

/** Small, cheap, no shortage designation, no named employers. */
const SPARSE = buildCityFacts(city({
  population: 21_000,
  costOfLivingIndex: 78,
  metroArea: null,
  mentalHealthShortage: false,
  healthcareSystems: [],
  providerRatio: 'adequate',
}));

/** Same profile as DENSE but in a state with a different practice authority. */
const OTHER_AUTHORITY = buildCityFacts(city({ state: RESTRICTED_STATE }));

describe('every taxonomy lead consumes a fact, not just the city name', () => {
  it('sweeps the whole lead registry, not a sample', () => {
    // Guards the guard: an empty registry would make the loop below vacuous.
    expect(TAXONOMY_LEAD_KEYS.length).toBeGreaterThan(20);
  });

  for (const taxonomy of TAXONOMY_LEAD_KEYS) {
    it(`${taxonomy} reads differently for a different city profile`, () => {
      const variants = new Set([
        getTaxonomyLead(taxonomy, DENSE),
        getTaxonomyLead(taxonomy, SPARSE),
        getTaxonomyLead(taxonomy, OTHER_AUTHORITY),
      ]);
      // Every profile shares the city name and state code, so more than one
      // distinct string can only mean the lead branched on a real fact.
      expect(variants.size).toBeGreaterThan(1);
    });
  }
});

describe('two taxonomies for one city differ beyond the first sentence', () => {
  const sentences = (s: string) => s.split(/(?<=\.)\s+/).filter(Boolean);

  it('remote and inpatient repeat only the pure city facts', () => {
    const remote = sentences(buildTaxonomyCityNarrative(DENSE, 'remote', 12, 'Remote'));
    const inpatient = sentences(buildTaxonomyCityNarrative(DENSE, 'inpatient', 12, 'Inpatient'));

    const body = remote.slice(1);
    const shared = body.filter((s) => inpatient.includes(s));

    // A city's HPSA designation and cost-of-living index are the same whatever
    // the role, and manufacturing variation in them would be writing for the
    // crawler rather than the reader. What must move per taxonomy is every
    // sentence that frames the ROLE: the lead, the demand opener, the count.
    expect(shared.length).toBeLessThanOrEqual(2);
    expect(body.length - shared.length).toBeGreaterThanOrEqual(2);
    for (const s of shared) {
      expect(s).not.toMatch(/Remote|Inpatient/);
    }
  });

  it('the city body names the taxonomy, so it is not reused verbatim across siblings', () => {
    const remote = buildTaxonomyCityNarrative(DENSE, 'remote', 12, 'Remote');
    const perDiem = buildTaxonomyCityNarrative(DENSE, 'per-diem', 12, 'Per-Diem');

    expect(remote).toContain('Remote PMHNP demand in Testville');
    expect(perDiem).toContain('Per-Diem PMHNP demand in Testville');
    expect(remote).toContain('12 active Remote PMHNP positions');
    expect(perDiem).toContain('12 active Per-Diem PMHNP positions');
  });

  it('omitting the label keeps the plain PMHNP wording for /jobs/city/{slug}', () => {
    const base = buildCityNarrative(DENSE, 12);
    expect(base).toContain('PMHNP demand in Testville');
    expect(base).not.toContain('undefined');
  });
});

describe('one taxonomy across two city profiles produces different leads', () => {
  it('full-time reads differently in a costly metro than in a cheap small town', () => {
    expect(getTaxonomyLead('full-time', DENSE)).not.toBe(getTaxonomyLead('full-time', SPARSE));
  });

  it('the whole narrative differs, not only the lead', () => {
    const dense = buildTaxonomyCityNarrative(DENSE, 'outpatient', 7, 'Outpatient');
    const sparse = buildTaxonomyCityNarrative(SPARSE, 'outpatient', 7, 'Outpatient');
    expect(dense).not.toBe(sparse);
  });
});
