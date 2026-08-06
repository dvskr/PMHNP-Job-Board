/**
 * JobPosting tier-0 CI lock (audit 2026-08 C5).
 *
 * 88%+ of all site clicks ride the Google Jobs widget, and eligibility hangs
 * on the single JobPosting sink in components/JobStructuredData.tsx. These
 * tests read the real source so the required properties and the honesty
 * guards (estimated-salary, deterministic validThrough, conditional
 * directApply, omit-not-fabricate employmentType) cannot be silently
 * regressed. Every guard here traces to a verified audit finding — do not
 * loosen an assertion without re-reading the audit rationale.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const src = read('components/JobStructuredData.tsx');

describe('JobPosting required properties', () => {
  it('declares the JobPosting type and serializes through jsonLdString', () => {
    expect(src).toMatch(/'@type':\s*'JobPosting'/);
    expect(src).toMatch(/jsonLdString\(structuredData\)/);
    expect(src).not.toMatch(/JSON\.stringify\(structuredData\)/);
  });

  it('builds title, description, url, datePosted, validThrough, hiringOrganization, identifier', () => {
    expect(src).toMatch(/title:\s*job\.title/);
    expect(src).toMatch(/\bdescription\b/);
    expect(src).toMatch(/url:\s*canonicalUrl/);
    expect(src).toMatch(/datePosted:\s*datePosted\.toISOString\(\)/);
    expect(src).toMatch(/validThrough:\s*validThrough\.toISOString\(\)/);
    expect(src).toMatch(/hiringOrganization/);
    expect(src).toMatch(/'@type':\s*'PropertyValue'/);
  });

  it('every posting gets a location signal: physical Place fallback OR TELECOMMUTE', () => {
    // The no-location fallback: physicalJobLocation is built unconditionally
    // (country-level at minimum) so no posting is hard-ineligible for lacking
    // BOTH jobLocation and jobLocationType.
    expect(src).toMatch(/const physicalJobLocation = \{/);
    expect(src).toMatch(/addressCountry:\s*'US'/);
    expect(src).toMatch(/const jobLocation = treatAsRemote \? undefined : physicalJobLocation/);
  });

  it('TELECOMMUTE is reserved for fully-remote roles (Google forbids it for hybrid)', () => {
    expect(src).toMatch(/const treatAsRemote = isFullyRemote;/);
    expect(src).toMatch(/treatAsRemote \? 'TELECOMMUTE' : undefined/);
  });
});

describe('JobPosting honesty guards', () => {
  it('estimated salaries never publish as baseSalary offers', () => {
    // Audit C4: salaryIsEstimated rows are pipeline inferences, not employer
    // offers. The guard must gate the entire baseSalary build.
    expect(src).toMatch(/const baseSalary = !job\.salaryIsEstimated &&/);
  });

  it('validThrough fallback is anchored to datePosted, never to render time', () => {
    // The old `now + 30d` fallback made stale jobs look perpetually fresh.
    expect(src).toMatch(/new Date\(datePosted\)/);
    expect(src).toMatch(/job\.expiresAt/);
    expect(src).not.toMatch(/Date\.now\(\)/);
  });

  it('directApply is emitted ONLY for on-platform apply flows', () => {
    expect(src).toMatch(/\.\.\.\(job\.applyOnPlatform \? \{ directApply: true \} : \{\}\)/);
    // A bare unconditional property line would be the regression.
    expect(src).not.toMatch(/^\s*directApply:\s*true,?\s*$/m);
  });

  it('unknown jobType omits employmentType instead of defaulting to FULL_TIME', () => {
    // (the prose comment in the sink mentions the old default, so match the
    // code shape, not the bare string)
    expect(src).not.toMatch(/mapping\[jobType\]\s*\|\|/);
    expect(src).toMatch(/return jobType \? mapping\[jobType\] : undefined/);
  });

  it('none of the deliberately-removed schema types creep back into the sink', () => {
    expect(src).not.toMatch(/AggregateOffer/);
    expect(src).not.toMatch(/'@type':\s*'Occupation'/);
    expect(src).not.toMatch(/SearchAction/);
    expect(src).not.toMatch(/'@type':\s*'FAQPage'/);
  });
});
