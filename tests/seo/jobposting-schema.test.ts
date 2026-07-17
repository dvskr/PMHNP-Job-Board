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
 * The component is a plain function returning a <script> element, so we
 * invoke it directly and parse the JSON payload — no DOM needed.
 */
import { describe, it, expect } from 'vitest';
import JobStructuredData from '@/components/JobStructuredData';
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

function renderSchema(overrides: Record<string, unknown> = {}) {
  const job = { ...BASE_JOB, ...overrides } as unknown as Job;
  const element = JobStructuredData({ job });
  const html = (element.props as { dangerouslySetInnerHTML: { __html: string } })
    .dangerouslySetInnerHTML.__html;
  return JSON.parse(html);
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

describe('JobPosting structured data — location semantics', () => {
  it('remote-only: omits physical jobLocation, sets TELECOMMUTE + applicantLocationRequirements', () => {
    const schema = renderSchema({ isRemote: true, isHybrid: false });
    expect(schema.jobLocation).toBeUndefined();
    expect(schema.jobLocationType).toBe('TELECOMMUTE');
    expect(schema.applicantLocationRequirements?.['@type']).toBe('Country');
  });

  it('hybrid: emits BOTH a physical jobLocation AND TELECOMMUTE', () => {
    const schema = renderSchema({ isRemote: true, isHybrid: true });
    expect(schema.jobLocation?.address?.addressLocality).toBe('Austin');
    expect(schema.jobLocationType).toBe('TELECOMMUTE');
  });

  it('in-person: physical jobLocation only, no TELECOMMUTE', () => {
    const schema = renderSchema();
    expect(schema.jobLocation).toBeDefined();
    expect(schema.jobLocationType).toBeUndefined();
    expect(schema.applicantLocationRequirements).toBeUndefined();
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

  it('omits baseSalary entirely when no salary is disclosed (no empty containers)', () => {
    const schema = renderSchema({
      minSalary: null,
      maxSalary: null,
      normalizedMinSalary: null,
      normalizedMaxSalary: null,
    });
    expect(schema.baseSalary).toBeUndefined();
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
