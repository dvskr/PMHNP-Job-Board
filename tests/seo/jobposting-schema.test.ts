/**
 * JobPosting JSON-LD regression guard (GSC Fix, 2026-07 audit).
 *
 * The overwhelming majority of site clicks arrive through the Google Jobs "Job listing"
 * search appearance, which depends entirely on the JobPosting structured
 * data emitted by components/JobStructuredData.tsx. A silent regression in
 * that markup (missing required property, misclaimed directApply,
 * non-deterministic validThrough) can demote every listing at once.
 * These tests pin Google's required properties and the house invariants
 * documented in the component.
 *
 * Serialization tests assert on the RAW __html string, not the parsed
 * object: JSON.parse happily accepts "</script>" inside a string value,
 * which is exactly the payload that breaks out of the <script> block in a
 * browser. The 2026-07 escaping fix (lib/seo/json-ld.ts) is pinned here.
 *
 * The component is a plain function returning a <script> element, so we
 * invoke it directly and inspect the payload — no DOM needed.
 */
import { describe, it, expect } from 'vitest';
import JobStructuredData from '@/components/JobStructuredData';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { jsonLdString } from '@/lib/seo/json-ld';
import { Job } from '@/lib/types';

const BASE_JOB = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000',
  title: 'Psychiatric Mental Health Nurse Practitioner',
  slug: 'psychiatric-mental-health-nurse-practitioner-aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000',
  employer: 'Acme Behavioral Health',
  description: 'Provide psychiatric evaluations and medication management.',
  descriptionSummary: null,
  city: 'Austin',
  state: 'Texas',
  stateCode: 'TX',
  isRemote: false,
  isHybrid: false,
  jobType: 'Full-Time',
  salaryPeriod: 'annual',
  minSalary: 140000,
  maxSalary: 180000,
  normalizedMinSalary: 140000,
  normalizedMaxSalary: 180000,
  originalPostedAt: new Date('2026-06-01T00:00:00.000Z'),
  createdAt: new Date('2026-06-02T00:00:00.000Z'),
  expiresAt: new Date('2026-08-01T00:00:00.000Z'),
  applyOnPlatform: false,
  minYearsExperience: null,
  newGradFriendly: false,
  companyWebsite: null,
  companyLogoUrl: null,
};

function renderRaw(overrides: Record<string, unknown> = {}): string {
  const job = { ...BASE_JOB, ...overrides } as unknown as Job;
  const element = JobStructuredData({ job });
  return (element.props as { dangerouslySetInnerHTML: { __html: string } })
    .dangerouslySetInnerHTML.__html;
}

function renderSchema(overrides: Record<string, unknown> = {}) {
  return JSON.parse(renderRaw(overrides));
}

describe('JobPosting structured data — Google required properties', () => {
  it('always emits the properties Google requires for the Jobs widget', () => {
    const schema = renderSchema();

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('JobPosting');
    expect(schema.title).toBeTruthy();
    expect(schema.description).toBeTruthy();
    expect(schema.datePosted).toBeTruthy();
    expect(schema.validThrough).toBeTruthy();
    expect(schema.hiringOrganization?.name).toBe('Acme Behavioral Health');
    expect(schema.jobLocation?.address?.addressLocality).toBe('Austin');
    expect(schema.jobLocation?.address?.addressRegion).toBe('TX');
    expect(schema.jobLocation?.address?.addressCountry).toBe('US');
  });

  it('validThrough always postdates datePosted, and the no-expiry fallback is deterministic (datePosted + 60d, never now-based)', () => {
    const schema = renderSchema({ expiresAt: null });
    const posted = new Date(schema.datePosted).getTime();
    const valid = new Date(schema.validThrough).getTime();
    expect(valid).toBeGreaterThan(posted);
    expect(valid - posted).toBe(60 * 24 * 60 * 60 * 1000);
    // Deterministic per job: rendering twice must yield the same value.
    expect(renderSchema({ expiresAt: null }).validThrough).toBe(schema.validThrough);
  });

  it('uses originalPostedAt (real source date) over createdAt for datePosted', () => {
    const schema = renderSchema();
    expect(schema.datePosted).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('JobPosting structured data — script-breakout escaping (stored XSS guard)', () => {
  const EVIL_TITLE = '</script><img src=x onerror=alert(1)>';

  it('serialized payload contains no raw angle brackets anywhere — a "</script>" in any field cannot terminate the script block', () => {
    const html = renderRaw({
      title: EVIL_TITLE,
      employer: 'Evil </script> Corp & Sons',
      description: 'Line one\n\n</script><svg onload=alert(2)>',
    });
    expect(html).not.toContain('<');
    expect(html).not.toContain('>');
    expect(html.toLowerCase()).not.toContain('</script');
  });

  it('escaping is lossless — Google parses back the exact original strings', () => {
    const schema = renderSchema({ title: EVIL_TITLE });
    expect(schema.title).toBe(EVIL_TITLE);
  });
});

describe('JobPosting structured data — location semantics', () => {
  it('remote-only: omits physical jobLocation, sets TELECOMMUTE + applicantLocationRequirements', () => {
    const schema = renderSchema({ isRemote: true, isHybrid: false });
    expect(schema.jobLocation).toBeUndefined();
    expect(schema.jobLocationType).toBe('TELECOMMUTE');
    expect(schema.applicantLocationRequirements?.['@type']).toBe('Country');
  });

  it('hybrid: physical jobLocation ONLY — Google forbids TELECOMMUTE for non-100%-remote roles', () => {
    const schema = renderSchema({ isRemote: true, isHybrid: true });
    expect(schema.jobLocation?.address?.addressLocality).toBe('Austin');
    expect(schema.jobLocationType).toBeUndefined();
    expect(schema.applicantLocationRequirements).toBeUndefined();
  });

  it('in-person: physical jobLocation only, no TELECOMMUTE', () => {
    const schema = renderSchema();
    expect(schema.jobLocation).toBeDefined();
    expect(schema.jobLocationType).toBeUndefined();
    expect(schema.applicantLocationRequirements).toBeUndefined();
  });

  it('degraded hybrid (no parsable address) falls back to TELECOMMUTE instead of emitting no location signal at all', () => {
    const schema = renderSchema({
      isRemote: true, isHybrid: true,
      city: null, state: null, stateCode: null,
    });
    expect(schema.jobLocation).toBeUndefined();
    expect(schema.jobLocationType).toBe('TELECOMMUTE');
    expect(schema.applicantLocationRequirements?.['@type']).toBe('Country');
  });
});

describe('JobPosting structured data — employmentType honesty', () => {
  it('maps every canonical jobType (incl. PRN and Locum Tenens, previously mislabeled FULL_TIME)', () => {
    expect(renderSchema({ jobType: 'Full-Time' }).employmentType).toBe('FULL_TIME');
    expect(renderSchema({ jobType: 'Part-Time' }).employmentType).toBe('PART_TIME');
    expect(renderSchema({ jobType: 'Contract' }).employmentType).toBe('CONTRACTOR');
    expect(renderSchema({ jobType: 'Per Diem' }).employmentType).toBe('PER_DIEM');
    expect(renderSchema({ jobType: 'PRN' }).employmentType).toBe('PER_DIEM');
    expect(renderSchema({ jobType: 'Locum Tenens' }).employmentType).toBe('TEMPORARY');
    expect(renderSchema({ jobType: 'Travel' }).employmentType).toBe('TEMPORARY');
    expect(renderSchema({ jobType: 'Internship' }).employmentType).toBe('INTERN');
  });

  it('omits employmentType for null/unknown jobType instead of defaulting to FULL_TIME', () => {
    expect(renderSchema({ jobType: null }).employmentType).toBeUndefined();
    expect(renderSchema({ jobType: 'Gibberish' }).employmentType).toBeUndefined();
  });
});

describe('JobPosting structured data — experience requirements', () => {
  it('never emits experienceInPlaceOfEducation (requires educationRequirements; a PMHNP degree is never waivable)', () => {
    const schema = renderSchema({ newGradFriendly: true });
    expect(schema.experienceInPlaceOfEducation).toBeUndefined();
    // The honest new-grad signal survives: 0 months of required experience.
    expect(schema.experienceRequirements?.monthsOfExperience).toBe(0);
  });

  it('maps minYearsExperience to monthsOfExperience', () => {
    const schema = renderSchema({ minYearsExperience: 2 });
    expect(schema.experienceRequirements?.monthsOfExperience).toBe(24);
  });

  it('occupationalCategory carries the O*NET label, not the bare code', () => {
    expect(renderSchema().occupationalCategory).toBe('29-1171.00 - Nurse Practitioners');
  });
});

describe('JobPosting structured data — directApply and salary honesty', () => {
  it('claims directApply ONLY for in-platform applications (misclaiming triggers Google Jobs demotion)', () => {
    expect(renderSchema({ applyOnPlatform: true }).directApply).toBe(true);
    expect(renderSchema({ applyOnPlatform: false }).directApply).toBeUndefined();
    expect(renderSchema({ applyOnPlatform: null }).directApply).toBeUndefined();
  });

  it('emits salary in its native unit — hourly postings report HOUR with raw values, not annualized', () => {
    const schema = renderSchema({
      salaryPeriod: 'hourly',
      minSalary: 85,
      maxSalary: 110,
      normalizedMinSalary: 176800,
      normalizedMaxSalary: 228800,
    });
    expect(schema.baseSalary?.value?.unitText).toBe('HOUR');
    expect(schema.baseSalary?.value?.minValue).toBe(85);
    expect(schema.baseSalary?.value?.maxValue).toBe(110);
  });

  it('annual postings report YEAR with normalized values', () => {
    const schema = renderSchema();
    expect(schema.baseSalary?.value?.unitText).toBe('YEAR');
    expect(schema.baseSalary?.value?.minValue).toBe(140000);
    expect(schema.baseSalary?.value?.maxValue).toBe(180000);
  });

  it('biweekly postings convert to WEEK with halved values (exact), never a raw amount clamped to MONTH', () => {
    const schema = renderSchema({
      salaryPeriod: 'biweekly',
      minSalary: 4000,
      maxSalary: 5000,
      normalizedMinSalary: null,
      normalizedMaxSalary: null,
    });
    expect(schema.baseSalary?.value?.unitText).toBe('WEEK');
    expect(schema.baseSalary?.value?.minValue).toBe(2000);
    expect(schema.baseSalary?.value?.maxValue).toBe(2500);
  });

  it('non-annual posting with ONLY normalized (annualized) values falls back to YEAR — never an annual number under an hourly unit', () => {
    const schema = renderSchema({
      salaryPeriod: 'hourly',
      minSalary: null,
      maxSalary: null,
      normalizedMinSalary: 176800,
      normalizedMaxSalary: 228800,
    });
    expect(schema.baseSalary?.value?.unitText).toBe('YEAR');
    expect(schema.baseSalary?.value?.minValue).toBe(176800);
    expect(schema.baseSalary?.value?.maxValue).toBe(228800);
  });

  it('omits baseSalary entirely when no salary is disclosed (no empty containers)', () => {
    const schema = renderSchema({
      minSalary: null,
      maxSalary: null,
      normalizedMinSalary: null,
      normalizedMaxSalary: null,
    });
    expect(schema.baseSalary).toBeUndefined();
  });

  it('single-bound salary emits QuantitativeValue.value, never a one-sided pseudo-range', () => {
    const maxOnly = renderSchema({
      salaryPeriod: 'hourly',
      minSalary: null, maxSalary: 110,
      normalizedMinSalary: null, normalizedMaxSalary: null,
    });
    expect(maxOnly.baseSalary?.value?.value).toBe(110);
    expect(maxOnly.baseSalary?.value?.minValue).toBeUndefined();
    expect(maxOnly.baseSalary?.value?.maxValue).toBeUndefined();

    const pointValue = renderSchema({
      minSalary: 150000, maxSalary: 150000,
      normalizedMinSalary: 150000, normalizedMaxSalary: 150000,
    });
    expect(pointValue.baseSalary?.value?.value).toBe(150000);
    expect(pointValue.baseSalary?.value?.minValue).toBeUndefined();
  });
});

describe('JobPosting structured data — description structure', () => {
  it('wraps plain-text descriptions into HTML paragraphs (blank line = paragraph, newline = <br>)', () => {
    const schema = renderSchema({
      description: 'First paragraph.\n\nSecond paragraph\nwith a continuation line.',
    });
    expect(schema.description).toBe(
      '<p>First paragraph.</p><p>Second paragraph<br>with a continuation line.</p>'
    );
  });

  it('passes through descriptions that are already HTML (employer/Quill postings)', () => {
    const html = '<p>Role details</p><ul><li>Benefit</li></ul>';
    expect(renderSchema({ description: html }).description).toBe(html);
  });

  it('no stored description → honest multi-paragraph fallback from real fields, never a one-liner', () => {
    const schema = renderSchema({ description: null, descriptionSummary: null });
    expect(schema.description).toContain('<p>Acme Behavioral Health is hiring a Psychiatric Mental Health Nurse Practitioner.</p>');
    expect(schema.description).toContain('Austin, TX');
    expect(schema.description).toContain('Position type: Full-Time');
    expect(schema.description).toContain('Advertised pay:');
    // Multi-paragraph, i.e. more than one <p> block.
    expect((schema.description.match(/<p>/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('fallback never interpolates literal "null" when state fields are missing', () => {
    const schema = renderSchema({
      description: null, descriptionSummary: null,
      state: null, stateCode: null,
    });
    expect(schema.description).toContain('Austin');
    expect(schema.description).not.toContain('null');
  });
});

describe('JobPosting structured data — serialization hygiene', () => {
  it('URL is the canonical /jobs/{slug} shape on the production origin', () => {
    const schema = renderSchema();
    expect(schema.url).toBe(`https://pmhnphiring.com/jobs/${BASE_JOB.slug}`);
  });

  it('never serializes undefined/null leaves (Rich Results Test lint)', () => {
    const html = JSON.stringify(renderSchema({ companyWebsite: null, companyLogoUrl: null }));
    expect(html).not.toContain('undefined');
    expect(html).not.toContain(':null');
  });
});

describe('BreadcrumbSchema — script-breakout escaping', () => {
  it('escapes job-derived crumb names so a hostile title cannot break out of the script block', () => {
    const element = BreadcrumbSchema({
      items: [
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: '</script><img src=x onerror=alert(1)>', url: 'https://pmhnphiring.com/jobs/x' },
      ],
    });
    const html = (element.props as { dangerouslySetInnerHTML: { __html: string } })
      .dangerouslySetInnerHTML.__html;
    expect(html).not.toContain('<');
    expect(JSON.parse(html).itemListElement[1].name).toBe('</script><img src=x onerror=alert(1)>');
  });
});

describe('jsonLdString helper — escaping contract', () => {
  it('neutralizes <, >, & and JS line separators while staying valid, lossless JSON', () => {
    const LINE_SEP = String.fromCharCode(0x2028);
    const PARA_SEP = String.fromCharCode(0x2029);
    const data = { a: '</script>', b: '&<>', c: 'x' + LINE_SEP + 'y' + PARA_SEP + 'z' };
    const out = jsonLdString(data);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
    expect(out).not.toContain(LINE_SEP);
    expect(out).not.toContain(PARA_SEP);
    expect(JSON.parse(out)).toEqual(data);
  });

  it('never throws on undefined input — degrades to valid empty JSON-LD', () => {
    expect(jsonLdString(undefined)).toBe('null');
  });
});
