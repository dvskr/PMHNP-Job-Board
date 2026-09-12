/**
 * baseSalary mirror invariant for the JobPosting JSON-LD.
 *
 * The schema numbers exist to annotate the string the reader sees. When the
 * two disagree — the header shows "$187,200 - $299,520" while the markup
 * declares 299520 per HOUR — Google is looking at a page that contradicts
 * its own structured data, which is a markup violation and invisible in our
 * UI. These tests pin the two ways that used to happen:
 *   1. the displayed string came from the free-text salaryRange column, so
 *      no parsed pair stands behind it;
 *   2. a raw pair tagged 'hourly' carries annual-sized numbers because the
 *      normalizer never ran on the row.
 *
 * The component is a plain function returning a <script> element, so we
 * invoke it directly and inspect the payload — no DOM needed.
 */
import { describe, it, expect } from 'vitest';
import JobStructuredData from '@/components/JobStructuredData';
import { jobSalaryText } from '@/lib/salary-display';
import { Job } from '@/lib/types';

const BASE_JOB = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001',
  title: 'Psychiatric Mental Health Nurse Practitioner',
  slug: 'psychiatric-mental-health-nurse-practitioner-aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001',
  employer: 'Acme Behavioral Health',
  description: 'Provide psychiatric evaluations and medication management.',
  descriptionSummary: null,
  city: 'Austin',
  state: 'Texas',
  stateCode: 'TX',
  isRemote: false,
  isHybrid: false,
  jobType: 'Full-Time',
  displaySalary: null,
  salaryRange: null,
  salaryPeriod: 'annual',
  salaryIsEstimated: false,
  minSalary: null,
  maxSalary: null,
  normalizedMinSalary: null,
  normalizedMaxSalary: null,
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

describe('JobPosting baseSalary mirrors the displayed salary string', () => {
  it('omits baseSalary rather than publishing an annual-sized figure under HOUR', () => {
    const row = {
      salaryPeriod: 'hourly',
      minSalary: 187,
      maxSalary: 299520,
      salaryRange: '$187,200 - $299,520',
    };
    // The page never shows a four-figure hourly rate, so the schema must not
    // claim one. Omission is the only honest answer for a broken pair.
    expect(renderSchema(row).baseSalary).toBeUndefined();
  });

  it('omits baseSalary when the displayed string came from the free-text salaryRange column', () => {
    const row = {
      salaryRange: '$90,000 - $120,000 depending on experience',
      salaryPeriod: 'annual',
    };
    // Guard the precondition: this row really does display the raw text.
    expect(jobSalaryText({ ...BASE_JOB, ...row } as unknown as Job))
      .toBe('$90,000 - $120,000 depending on experience');
    expect(renderSchema(row).baseSalary).toBeUndefined();
  });

  it('still publishes the normalized hourly pair converted back to its native unit', () => {
    const schema = renderSchema({
      salaryPeriod: 'hourly',
      normalizedMinSalary: 176800,
      normalizedMaxSalary: 228800,
    });
    expect(schema.baseSalary.value.unitText).toBe('HOUR');
    expect(schema.baseSalary.value.minValue).toBe(85);
    expect(schema.baseSalary.value.maxValue).toBe(110);
  });

  it('publishes a monthly raw pair under MONTH, matching the "/mo" string the header renders', () => {
    const row = {
      salaryPeriod: 'monthly',
      minSalary: 37714,
      maxSalary: 37714,
      salaryRange: '$37,714 - $37,714',
    };
    const schema = renderSchema(row);
    expect(jobSalaryText({ ...BASE_JOB, ...row } as unknown as Job)).toBe('$37,714/mo');
    expect(schema.baseSalary.value.unitText).toBe('MONTH');
    expect(schema.baseSalary.value.value).toBe(37714);
  });

  it('leaves the ordinary annual range untouched', () => {
    const schema = renderSchema({
      salaryPeriod: 'annual',
      minSalary: 140000,
      maxSalary: 180000,
      normalizedMinSalary: 140000,
      normalizedMaxSalary: 180000,
    });
    expect(schema.baseSalary.value.unitText).toBe('YEAR');
    expect(schema.baseSalary.value.minValue).toBe(140000);
    expect(schema.baseSalary.value.maxValue).toBe(180000);
  });
});
