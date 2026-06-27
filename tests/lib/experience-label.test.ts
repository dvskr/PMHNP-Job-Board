import { describe, it, expect } from 'vitest';
import {
  deriveExperienceLabel,
  snapMinYearsToBucket,
  MIN_YEARS_BUCKETS,
  EXPERIENCE_BUCKETS,
  normalizeExperienceFromInput,
  effectiveExperienceLabel,
  effectiveNewGradFriendly,
  titleIndicatesNewGrad,
} from '@/lib/experience-label';

describe('deriveExperienceLabel', () => {
  describe('new-grad cases', () => {
    it('returns "New grad welcome" when min=0 and newGradFriendly=true', () => {
      expect(
        deriveExperienceLabel({
          minYearsExperience: 0,
          maxYearsExperience: null,
          newGradFriendly: true,
        }),
      ).toBe('New grad welcome');
    });

    it('returns "New grad welcome" when min=null and newGradFriendly=true', () => {
      // Backfill case — JD says "open to new grads" but no min number found.
      expect(
        deriveExperienceLabel({
          minYearsExperience: null,
          maxYearsExperience: null,
          newGradFriendly: true,
        }),
      ).toBe('New grad welcome');
    });

    it('returns "New grad welcome" when min=0 alone (the bucket IS the signal)', () => {
      // The 0-yr ("New grad accepted") bucket is itself a complete new-grad
      // signal: deriveExperienceLabel renders the label from min=0 alone,
      // independent of the flag (defensive — a row could still arrive that way).
      expect(
        deriveExperienceLabel({
          minYearsExperience: 0,
          maxYearsExperience: null,
          newGradFriendly: false,
        }),
      ).toBe('New grad welcome');
    });
  });

  describe('open-ended ranges', () => {
    it('formats min-only as "N+ yrs"', () => {
      expect(
        deriveExperienceLabel({
          minYearsExperience: 5,
          maxYearsExperience: null,
          newGradFriendly: false,
        }),
      ).toBe('5+ yrs');
    });

    it('formats 10+ correctly', () => {
      expect(
        deriveExperienceLabel({
          minYearsExperience: 10,
          maxYearsExperience: null,
          newGradFriendly: false,
        }),
      ).toBe('10+ yrs');
    });

    it('appends new-grad qualifier when newGradFriendly is also set', () => {
      expect(
        deriveExperienceLabel({
          minYearsExperience: 5,
          maxYearsExperience: null,
          newGradFriendly: true,
        }),
      ).toBe('5+ yrs · new grads welcome');
    });
  });

  describe('bounded ranges', () => {
    it('formats min-max as "N-M yrs"', () => {
      expect(
        deriveExperienceLabel({
          minYearsExperience: 1,
          maxYearsExperience: 2,
          newGradFriendly: false,
        }),
      ).toBe('1-2 yrs');
    });

    it('handles wider ranges', () => {
      expect(
        deriveExperienceLabel({
          minYearsExperience: 5,
          maxYearsExperience: 7,
          newGradFriendly: false,
        }),
      ).toBe('5-7 yrs');
    });

    it('collapses to "N+ yrs" when max <= min (invalid range)', () => {
      // Defensive: if max equals min the range collapses; if max < min
      // we treat it as open-ended rather than throw.
      expect(
        deriveExperienceLabel({
          minYearsExperience: 5,
          maxYearsExperience: 5,
          newGradFriendly: false,
        }),
      ).toBe('5+ yrs');
      expect(
        deriveExperienceLabel({
          minYearsExperience: 5,
          maxYearsExperience: 3,
          newGradFriendly: false,
        }),
      ).toBe('5+ yrs');
    });
  });

  describe('null cases', () => {
    it('returns null when no signal is present', () => {
      expect(
        deriveExperienceLabel({
          minYearsExperience: null,
          maxYearsExperience: null,
          newGradFriendly: false,
        }),
      ).toBeNull();
    });
  });
});

describe('snapMinYearsToBucket', () => {
  it('snaps mid-bucket values down to the nearest allowed bucket', () => {
    expect(snapMinYearsToBucket(3)).toBe(2);
    expect(snapMinYearsToBucket(4)).toBe(2);
    expect(snapMinYearsToBucket(6)).toBe(5);
    expect(snapMinYearsToBucket(8)).toBe(7);
    expect(snapMinYearsToBucket(9)).toBe(7);
  });

  it('returns the exact value when it matches a bucket', () => {
    for (const bucket of MIN_YEARS_BUCKETS) {
      expect(snapMinYearsToBucket(bucket)).toBe(bucket);
    }
  });

  it('caps above-max values at 10', () => {
    expect(snapMinYearsToBucket(15)).toBe(10);
    expect(snapMinYearsToBucket(50)).toBe(10);
  });

  it('returns null for invalid input', () => {
    expect(snapMinYearsToBucket(null)).toBeNull();
    expect(snapMinYearsToBucket(NaN)).toBeNull();
    expect(snapMinYearsToBucket(-1)).toBeNull();
  });
});

describe('EXPERIENCE_BUCKETS', () => {
  it('exposes 6 buckets in canonical order', () => {
    expect(EXPERIENCE_BUCKETS.map((b) => b.min)).toEqual([0, 1, 2, 5, 7, 10]);
  });

  it('every bucket min matches an entry in MIN_YEARS_BUCKETS', () => {
    for (const bucket of EXPERIENCE_BUCKETS) {
      expect(MIN_YEARS_BUCKETS).toContain(bucket.min);
    }
  });

  it('open-ended buckets (0 and 10) have null max', () => {
    expect(EXPERIENCE_BUCKETS[0].max).toBeNull();
    expect(EXPERIENCE_BUCKETS[EXPERIENCE_BUCKETS.length - 1].max).toBeNull();
  });

  it('middle buckets always have max > min', () => {
    const middle = EXPERIENCE_BUCKETS.slice(1, -1);
    for (const bucket of middle) {
      expect(bucket.max).not.toBeNull();
      expect(bucket.max!).toBeGreaterThan(bucket.min);
    }
  });
});

describe('normalizeExperienceFromInput', () => {
  it('accepts a valid bucket min and derives the paired max + label', () => {
    const result = normalizeExperienceFromInput({
      minYearsExperience: 5,
      newGradFriendly: false,
      experienceQualifier: null,
    });
    expect(result.minYearsExperience).toBe(5);
    expect(result.maxYearsExperience).toBe(7); // bucket 5 → max 7
    expect(result.newGradFriendly).toBe(false);
    expect(result.experienceLabel).toBe('5-7 yrs');
  });

  it('forces max to match the bucket — client cannot smuggle an inconsistent max', () => {
    // Even if a malicious client sent maxYearsExperience: 99, the
    // normalizer ignores it and uses the canonical bucket pairing.
    const result = normalizeExperienceFromInput({
      minYearsExperience: 1,
      newGradFriendly: false,
      experienceQualifier: null,
    });
    expect(result.maxYearsExperience).toBe(2);
  });

  it('the 0-yr "New grad accepted" bucket sets newGradFriendly=true (chip + filter agree)', () => {
    const result = normalizeExperienceFromInput({
      minYearsExperience: 0,
      newGradFriendly: false, // employer picked the 0-yr bucket but didn't toggle
      experienceQualifier: null,
    });
    expect(result.minYearsExperience).toBe(0);
    expect(result.newGradFriendly).toBe(true);
    expect(result.experienceLabel).toBe('New grad welcome');
  });

  it('rejects non-bucket min values as null', () => {
    const result = normalizeExperienceFromInput({
      minYearsExperience: 3, // not in EXPERIENCE_BUCKETS
      newGradFriendly: false,
      experienceQualifier: null,
    });
    expect(result.minYearsExperience).toBeNull();
    expect(result.maxYearsExperience).toBeNull();
  });

  it('rejects non-number min as null', () => {
    expect(
      normalizeExperienceFromInput({
        minYearsExperience: '5' as unknown as number,
        newGradFriendly: false,
        experienceQualifier: null,
      }).minYearsExperience,
    ).toBeNull();
  });

  it('normalizes newGradFriendly to strict boolean (truthy ≠ true)', () => {
    expect(
      normalizeExperienceFromInput({
        minYearsExperience: 5,
        newGradFriendly: 'yes' as unknown as boolean,
        experienceQualifier: null,
      }).newGradFriendly,
    ).toBe(false);
    expect(
      normalizeExperienceFromInput({
        minYearsExperience: 5,
        newGradFriendly: 1 as unknown as boolean,
        experienceQualifier: null,
      }).newGradFriendly,
    ).toBe(false);
    expect(
      normalizeExperienceFromInput({
        minYearsExperience: 5,
        newGradFriendly: true,
        experienceQualifier: null,
      }).newGradFriendly,
    ).toBe(true);
  });

  it('combines new-grad-friendly with non-zero bucket in the derived label', () => {
    const result = normalizeExperienceFromInput({
      minYearsExperience: 5,
      newGradFriendly: true,
      experienceQualifier: null,
    });
    expect(result.experienceLabel).toBe('5-7 yrs · new grads welcome');
  });

  it('trims whitespace from the qualifier and collapses empty strings to null', () => {
    expect(
      normalizeExperienceFromInput({
        minYearsExperience: 5,
        newGradFriendly: false,
        experienceQualifier: '   ',
      }).experienceQualifier,
    ).toBeNull();

    expect(
      normalizeExperienceFromInput({
        minYearsExperience: 5,
        newGradFriendly: false,
        experienceQualifier: '  Prefer inpatient bg  ',
      }).experienceQualifier,
    ).toBe('Prefer inpatient bg');
  });

  it('returns null label when no signal is present', () => {
    const result = normalizeExperienceFromInput({
      minYearsExperience: undefined,
      newGradFriendly: false,
      experienceQualifier: null,
    });
    expect(result.experienceLabel).toBeNull();
    expect(result.minYearsExperience).toBeNull();
    expect(result.maxYearsExperience).toBeNull();
  });

  it('returns "New grad welcome" label for the 0-bucket pick alone', () => {
    const result = normalizeExperienceFromInput({
      minYearsExperience: 0,
      newGradFriendly: true,
      experienceQualifier: null,
    });
    expect(result.experienceLabel).toBe('New grad welcome');
  });
});

describe('titleIndicatesNewGrad', () => {
  it('matches residency-/fellowship-/training-PROGRAM titles', () => {
    expect(titleIndicatesNewGrad('PMHNP Residency Program')).toBe(true);
    expect(titleIndicatesNewGrad('Psychiatric NP Fellowship Program')).toBe(true);
    expect(titleIndicatesNewGrad('Mental Health Training Program')).toBe(true);
    expect(titleIndicatesNewGrad('Entry-Level PMHNP')).toBe(true);
    expect(titleIndicatesNewGrad('New Grad PMHNP Opportunity')).toBe(true);
    expect(titleIndicatesNewGrad('Recent Graduate Welcome')).toBe(true);
  });

  it('does NOT match bare residency/fellowship titles (post-grad APP fellowships)', () => {
    // Tightened 2026-05-15: bare "Fellowship" / "Residency" used to
    // match here, but post-grad APP/NP fellowships requiring 3-5 yrs
    // prior NP experience aren't new-grad-friendly. Require "program".
    expect(titleIndicatesNewGrad('Psychiatric NP Fellowship')).toBe(false);
    expect(titleIndicatesNewGrad('Adult Psychiatry Residency')).toBe(false);
  });

  it('returns false for non-training titles', () => {
    expect(titleIndicatesNewGrad('Senior PMHNP')).toBe(false);
    expect(titleIndicatesNewGrad('Psychiatric Nurse Practitioner')).toBe(false);
    expect(titleIndicatesNewGrad('Telehealth PMHNP')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(titleIndicatesNewGrad(null)).toBe(false);
    expect(titleIndicatesNewGrad(undefined)).toBe(false);
    expect(titleIndicatesNewGrad('')).toBe(false);
  });
});

describe('effectiveExperienceLabel', () => {
  it('overrides stored label to "New grad welcome" when title indicates training', () => {
    // The DB row says 5+ yrs because the regex extracted "5 years of
    // accredited training" — but the title makes it clear this is a
    // residency. The render-time override fixes the chip without a
    // backfill re-run.
    expect(
      effectiveExperienceLabel({
        title: 'PMHNP Residency Program',
        experienceLabel: '5+ yrs',
        newGradFriendly: false,
      }),
    ).toBe('New grad welcome');
  });

  it('passes through stored label when title does not indicate training', () => {
    expect(
      effectiveExperienceLabel({
        title: 'Senior PMHNP',
        experienceLabel: '5+ yrs',
        newGradFriendly: false,
      }),
    ).toBe('5+ yrs');
  });

  it('returns null when no signal is present', () => {
    expect(
      effectiveExperienceLabel({
        title: 'Some Role',
        experienceLabel: null,
        newGradFriendly: false,
      }),
    ).toBeNull();
  });

  it('handles missing title gracefully', () => {
    expect(
      effectiveExperienceLabel({
        experienceLabel: '2-4 yrs',
        newGradFriendly: false,
      }),
    ).toBe('2-4 yrs');
  });
});

describe('effectiveNewGradFriendly', () => {
  it('returns true when title indicates training, regardless of stored flag', () => {
    expect(
      effectiveNewGradFriendly({
        title: 'PMHNP Residency Program',
        newGradFriendly: false,
      }),
    ).toBe(true);
  });

  it('falls through to stored flag when title does not match', () => {
    expect(
      effectiveNewGradFriendly({
        title: 'Senior PMHNP',
        newGradFriendly: true,
      }),
    ).toBe(true);
    expect(
      effectiveNewGradFriendly({
        title: 'Senior PMHNP',
        newGradFriendly: false,
      }),
    ).toBe(false);
  });

  it('treats null/undefined stored flag as false', () => {
    expect(
      effectiveNewGradFriendly({
        title: 'Senior PMHNP',
        newGradFriendly: null,
      }),
    ).toBe(false);
    expect(
      effectiveNewGradFriendly({
        title: 'Senior PMHNP',
      }),
    ).toBe(false);
  });

  it('is green for a "New grad welcome" label even when the flag is off (0-yr bucket)', () => {
    // The chip color must agree with the chip text — a min=0 post shows
    // "New grad welcome" and must render the success (green) variant.
    expect(
      effectiveNewGradFriendly({
        title: 'Telehealth PMHNP',
        experienceLabel: 'New grad welcome',
        newGradFriendly: false,
      }),
    ).toBe(true);
    expect(
      effectiveNewGradFriendly({
        title: 'PMHNP',
        experienceLabel: '2+ yrs · new grads welcome',
        newGradFriendly: false,
      }),
    ).toBe(true);
    // A non-new-grad label stays gray (outline).
    expect(
      effectiveNewGradFriendly({
        title: 'PMHNP',
        experienceLabel: '1-2 yrs',
        newGradFriendly: false,
      }),
    ).toBe(false);
  });
});
