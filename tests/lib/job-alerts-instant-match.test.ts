/**
 * A4 — pure single-job alert matcher for the instant employer fan-out.
 *
 * jobMatchesAlert inverts the digest's per-alert Prisma WHERE builders: given
 * ONE job (a just-published employer post) it answers whether a given alert's
 * criteria match it. Each describe block mirrors a clause of the WHERE
 * builder in lib/job-alerts-service.ts sendJobAlerts.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi } from 'vitest';

// The service instantiates Resend at module scope, which throws without an
// API key. These tests exercise the pure matcher only — stub the SDK.
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: vi.fn() };
    emails = { send: vi.fn() };
  },
}));

import { jobMatchesAlert, type AlertMatchableJob } from '@/lib/job-alerts-service';

const baseJob: AlertMatchableJob = {
  title: 'PMHNP Outpatient Psychiatry',
  employer: 'Lakeside Behavioral Health',
  location: 'Austin, TX',
  city: 'Austin',
  state: 'Texas',
  stateCode: 'TX',
  mode: 'In-Person',
  jobType: 'Full-Time',
  isRemote: false,
  isHybrid: false,
  normalizedMinSalary: 120000,
  normalizedMaxSalary: 150000,
  newGradFriendly: false,
  minYearsExperience: 2,
};

const job = (overrides: Partial<AlertMatchableJob> = {}): AlertMatchableJob => ({
  ...baseJob,
  ...overrides,
});

describe('jobMatchesAlert: empty criteria', () => {
  it('an alert with no criteria matches every job', () => {
    expect(jobMatchesAlert(baseJob, {})).toBe(true);
  });
});

describe('keyword (title + employer only)', () => {
  it('matches case-insensitively in the title', () => {
    expect(jobMatchesAlert(baseJob, { keyword: 'outpatient' })).toBe(true);
  });

  it('matches in the employer name', () => {
    expect(jobMatchesAlert(baseJob, { keyword: 'lakeside' })).toBe(true);
  });

  it('rejects when the keyword appears in neither', () => {
    expect(jobMatchesAlert(baseJob, { keyword: 'inpatient' })).toBe(false);
  });
});

describe('location', () => {
  it('matches a full state name via the structured stateCode', () => {
    expect(jobMatchesAlert(baseJob, { location: 'Texas' })).toBe(true);
  });

  it('matches a two-letter state code', () => {
    expect(jobMatchesAlert(baseJob, { location: 'tx' })).toBe(true);
  });

  it('rejects a different state', () => {
    expect(jobMatchesAlert(baseJob, { location: 'California' })).toBe(false);
  });

  it('matches a city as freetext against location and city fields', () => {
    expect(jobMatchesAlert(baseJob, { location: 'Austin' })).toBe(true);
    expect(jobMatchesAlert(job({ location: 'Remote (US)', city: 'Austin' }), { location: 'Austin' })).toBe(true);
  });

  it('falls back to the ", XX" location suffix when structured fields are empty', () => {
    const sparse = job({ state: null, stateCode: null, city: null, location: 'Dallas, TX' });
    expect(jobMatchesAlert(sparse, { location: 'texas' })).toBe(true);
  });
});

describe('work mode', () => {
  it('remote alerts accept the isRemote flag even when mode text is missing', () => {
    expect(jobMatchesAlert(job({ mode: null, isRemote: true }), { mode: 'Remote' })).toBe(true);
  });

  it('remote alerts reject onsite jobs', () => {
    expect(jobMatchesAlert(baseJob, { mode: 'Remote' })).toBe(false);
  });

  it('hybrid alerts accept the isHybrid flag', () => {
    expect(jobMatchesAlert(job({ mode: null, isHybrid: true }), { mode: 'Hybrid' })).toBe(true);
  });

  it('other modes match by substring, case-insensitively', () => {
    expect(jobMatchesAlert(baseJob, { mode: 'in-person' })).toBe(true);
  });
});

describe('job type (exact match)', () => {
  it('matches the exact type and rejects others', () => {
    expect(jobMatchesAlert(baseJob, { jobType: 'Full-Time' })).toBe(true);
    expect(jobMatchesAlert(baseJob, { jobType: 'Part-Time' })).toBe(false);
  });
});

describe('salary (range overlap, unknowns included)', () => {
  it('minSalary passes when the job max clears it', () => {
    expect(jobMatchesAlert(baseJob, { minSalary: 130000 })).toBe(true);
  });

  it('minSalary rejects when the job max is below it', () => {
    expect(jobMatchesAlert(baseJob, { minSalary: 160000 })).toBe(false);
  });

  it('jobs with NO salary data are included, mirroring the digest WHERE', () => {
    const unknown = job({ normalizedMinSalary: null, normalizedMaxSalary: null });
    expect(jobMatchesAlert(unknown, { minSalary: 160000 })).toBe(true);
    expect(jobMatchesAlert(unknown, { maxSalary: 100000 })).toBe(true);
  });

  it('maxSalary rejects when the job min exceeds it', () => {
    expect(jobMatchesAlert(baseJob, { maxSalary: 100000 })).toBe(false);
  });
});

describe('experience', () => {
  it('newGradFriendly matches the structured flag or an explicit zero-experience floor', () => {
    expect(jobMatchesAlert(job({ newGradFriendly: true }), { newGradFriendly: true })).toBe(true);
    expect(jobMatchesAlert(job({ minYearsExperience: 0 }), { newGradFriendly: true })).toBe(true);
    expect(jobMatchesAlert(baseJob, { newGradFriendly: true })).toBe(false);
  });

  it('minYearsExperience uses candidate-qualifies semantics with null-inclusive fallback', () => {
    expect(jobMatchesAlert(baseJob, { minYearsExperience: 3 })).toBe(true);   // requires 2, has 3
    expect(jobMatchesAlert(job({ minYearsExperience: 5 }), { minYearsExperience: 3 })).toBe(false);
    expect(jobMatchesAlert(job({ minYearsExperience: null }), { minYearsExperience: 0 })).toBe(true);
  });
});

describe('combined criteria are ANDed', () => {
  it('every provided criterion must hold', () => {
    expect(jobMatchesAlert(baseJob, { keyword: 'PMHNP', location: 'TX', jobType: 'Full-Time', minSalary: 100000 })).toBe(true);
    expect(jobMatchesAlert(baseJob, { keyword: 'PMHNP', location: 'TX', jobType: 'Part-Time' })).toBe(false);
  });
});
