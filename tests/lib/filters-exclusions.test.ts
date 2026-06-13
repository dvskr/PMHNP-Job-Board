/**
 * GLOBAL_EXCLUSIONS — non-PMHNP leak fixes (2026-06 audit).
 *
 * The live /jobs query applies GLOBAL_EXCLUSIONS via buildWhereClause. These
 * assert the serialized WHERE shape so the fixes can't silently regress:
 *   • the "Inpatient Psychiatrist" bug (bare `contains: 'NP'` matched the "np"
 *     in "Inpatient", defeating the physician exclusion),
 *   • the off-specialty NP exclusion (Family NP / hospice / oncology / …),
 *   • the bare dual-role "NP or PA" exclusion,
 *   • the psych-signal rescue (title/employer, incl. the known-psych allowlist).
 */
import { describe, it, expect } from 'vitest';
import { buildWhereClause } from '@/lib/filters';
import { DEFAULT_FILTERS } from '@/types/filters';

const json = JSON.stringify(buildWhereClause(DEFAULT_FILTERS));

describe('GLOBAL_EXCLUSIONS', () => {
  it('physician exclusions no longer use a bare "NP" substring (the Inpatient bug)', () => {
    expect(json).not.toContain('"contains":"NP"');
    expect(json).toContain('"contains":" NP"');
  });

  it('excludes off-specialty NP titles (family NP, hospice, oncology, …)', () => {
    expect(json).toContain('family nurse practitioner');
    expect(json).toContain('hospice');
    expect(json).toContain('oncology');
  });

  it('excludes bare dual-role NP-or-PA titles', () => {
    expect(json).toContain('nurse practitioner or physician assistant');
  });

  it('carries the psych-signal rescue (title keyword + employer allowlist)', () => {
    // The off-specialty / dual-role clauses are guarded by NOT(psych in title
    // OR employer), so the rescue tokens must be serialized into the WHERE.
    expect(json).toContain('pmhnp');
    expect(json).toContain('lyra health');
  });

  it('excludes non-provider / non-NP roles (recruiter, psychometrist, epileptologist)', () => {
    expect(json).toContain('psychometrist');
    expect(json).toContain('epileptologist');
    expect(json).toContain('recruitment');
  });

  it('excludes generic NP titles from confirmed non-psych employers (denylist)', () => {
    expect(json).toContain('chenmed');
  });

  it('covers geriatric + the curly-apostrophe women’s-health title variant', () => {
    expect(json).toContain('geriatric');
    expect(json).toContain('women’s health');
  });
});
