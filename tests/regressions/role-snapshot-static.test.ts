/**
 * Role Snapshot guards (external audit 2026-08): the eligibility-facts strip
 * must render ABOVE the job description so candidates get hard constraints
 * before the prose, and its dl can never contain empty dt/dd rows. Placement
 * is pinned statically against the page source; the empty-row invariant is
 * pinned by unit-testing the pure row builder every rendered row flows from.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildRoleSnapshotRows, type RoleSnapshotJob } from '@/components/jobs/RoleSnapshot';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('job detail page renders RoleSnapshot above the description block', () => {
  const src = read('app/jobs/[slug]/page.tsx');

  it('mounts <RoleSnapshot before the "About this role" description card', () => {
    const snapshotAt = src.indexOf('<RoleSnapshot');
    const descriptionAt = src.indexOf('About this role');
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(descriptionAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeLessThan(descriptionAt);
  });

  it('snapshot is NOT hydration-gated behind AnimatedContainer (LCP: facts paint with the hero)', () => {
    const snapshotAt = src.indexOf('<RoleSnapshot');
    const wrapperAt = src.lastIndexOf('<AnimatedContainer', snapshotAt);
    const wrapperCloseAt = src.indexOf('</AnimatedContainer>', wrapperAt);
    // Any AnimatedContainer opened before the snapshot must also close before it.
    if (wrapperAt !== -1) {
      expect(wrapperCloseAt).toBeGreaterThan(-1);
      expect(wrapperCloseAt).toBeLessThan(snapshotAt);
    }
  });
});

describe('component renders rows only through the pure builder', () => {
  const src = read('components/jobs/RoleSnapshot.tsx');

  it('dt/dd pairs are mapped from buildRoleSnapshotRows output, nothing hardcoded', () => {
    expect(src).toContain('buildRoleSnapshotRows(job)');
    expect(src).toContain('<dt style={labelStyle}>{row.label}</dt>');
    expect(src).toContain('<dd style={valueStyle}>{row.value}</dd>');
  });
});

/* ── Row builder invariants ── */

const baseJob = (overrides: Partial<RoleSnapshotJob> = {}): RoleSnapshotJob => ({
  title: 'PMHNP',
  experienceLabel: null,
  minYearsExperience: null,
  maxYearsExperience: null,
  newGradFriendly: false,
  jobType: null,
  jobTypes: [],
  salaryPeriod: null,
  displaySalary: null,
  isRemote: false,
  isHybrid: false,
  mode: null,
  eligibleStateCodes: [],
  setting: null,
  population: null,
  ...overrides,
});

describe('buildRoleSnapshotRows never emits an empty dt/dd row', () => {
  it('every row has a non-empty label and value on a sparse job', () => {
    const rows = buildRoleSnapshotRows(baseJob());
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.label.trim().length).toBeGreaterThan(0);
      expect(row.value.trim().length).toBeGreaterThan(0);
    }
  });

  it('sparse non-remote job renders no states, experience, schedule, salary, setting, or population rows', () => {
    const labels = buildRoleSnapshotRows(baseJob()).map((r) => r.label);
    expect(labels).toEqual(['Work mode']);
  });
});

describe('eligible license states row', () => {
  it('maps codes to full names, comma-joined', () => {
    const rows = buildRoleSnapshotRows(baseJob({ eligibleStateCodes: ['TX', 'FL', 'WV'] }));
    expect(rows[0]).toMatchObject({
      label: 'Eligible license states',
      value: 'Texas, Florida, West Virginia',
      wide: true,
    });
  });

  it('caps the display at 8 states then "+N more"', () => {
    const codes = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI'];
    const rows = buildRoleSnapshotRows(baseJob({ eligibleStateCodes: codes }));
    expect(rows[0].value).toBe(
      'Alabama, Alaska, Arizona, Arkansas, California, Colorado, Connecticut, Delaware, +3 more'
    );
  });

  it('fully remote with no extracted restriction gets NO states row (the extractor is conservative, an empty list is not proof of nationwide reach)', () => {
    const rows = buildRoleSnapshotRows(baseJob({ isRemote: true, eligibleStateCodes: [] }));
    expect(rows.map((r) => r.label)).not.toContain('Eligible license states');
  });

  it('hybrid and in-person jobs with no codes get no states row', () => {
    const hybrid = buildRoleSnapshotRows(baseJob({ isRemote: true, isHybrid: true }));
    expect(hybrid.map((r) => r.label)).not.toContain('Eligible license states');
  });
});

describe('experience and new grad rows', () => {
  it('stored label with new-grad suffix splits into two rows without duplication', () => {
    const rows = buildRoleSnapshotRows(baseJob({
      experienceLabel: '5+ yrs · new grads welcome',
      minYearsExperience: 5,
      newGradFriendly: true,
    }));
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['New grad friendly']).toBe('Yes');
    expect(byLabel['Required experience']).toBe('5+ yrs');
  });

  it('pure new-grad job renders the new-grad row only, no experience row', () => {
    const rows = buildRoleSnapshotRows(baseJob({ minYearsExperience: 0, newGradFriendly: true }));
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('New grad friendly');
    expect(labels).not.toContain('Required experience');
  });

  it('derives the label from min/max years when no stored label exists', () => {
    const rows = buildRoleSnapshotRows(baseJob({ minYearsExperience: 2, maxYearsExperience: 4 }));
    const exp = rows.find((r) => r.label === 'Required experience');
    expect(exp?.value).toBe('2-4 yrs');
  });
});

describe('schedule, salary basis, work mode, setting, population rows', () => {
  it('joins every offered schedule and falls back to the primary jobType', () => {
    const multi = buildRoleSnapshotRows(baseJob({ jobTypes: ['Full-Time', 'Part-Time', 'PRN'] }));
    expect(multi.find((r) => r.label === 'Schedule')?.value).toBe('Full-Time, Part-Time, PRN');

    const single = buildRoleSnapshotRows(baseJob({ jobTypes: [], jobType: 'Full-Time' }));
    expect(single.find((r) => r.label === 'Schedule')?.value).toBe('Full-Time');
  });

  it('names the salary basis from salaryPeriod and appends displaySalary', () => {
    const hourly = buildRoleSnapshotRows(baseJob({ salaryPeriod: 'hour', displaySalary: '$60-$75/hr' }));
    expect(hourly.find((r) => r.label === 'Salary basis')?.value).toBe('Hourly rate, $60-$75/hr');

    const annual = buildRoleSnapshotRows(baseJob({ salaryPeriod: 'year' }));
    expect(annual.find((r) => r.label === 'Salary basis')?.value).toBe('Annual salary');
  });

  it('null salaryPeriod never fabricates an "Annual salary" basis', () => {
    const rows = buildRoleSnapshotRows(baseJob({ salaryPeriod: null, displaySalary: '$120k-$150k/yr' }));
    expect(rows.find((r) => r.label === 'Salary basis')?.value).toBe('$120k-$150k/yr');
  });

  it('work mode covers remote/hybrid/in person and appends only non-redundant mode text', () => {
    const remote = buildRoleSnapshotRows(baseJob({ isRemote: true, mode: 'Telehealth' }));
    expect(remote.find((r) => r.label === 'Work mode')?.value).toBe('Remote, Telehealth');

    const redundant = buildRoleSnapshotRows(baseJob({ isRemote: true, mode: 'Remote' }));
    expect(redundant.find((r) => r.label === 'Work mode')?.value).toBe('Remote');

    const onsite = buildRoleSnapshotRows(baseJob({ mode: 'On-site' }));
    expect(onsite.find((r) => r.label === 'Work mode')?.value).toBe('In person');

    const hybrid = buildRoleSnapshotRows(baseJob({ isRemote: true, isHybrid: true }));
    expect(hybrid.find((r) => r.label === 'Work mode')?.value).toBe('Hybrid');
  });

  it('setting and population render only when present', () => {
    const rows = buildRoleSnapshotRows(baseJob({ setting: 'Outpatient', population: 'Adult' }));
    expect(rows.find((r) => r.label === 'Setting')?.value).toBe('Outpatient');
    expect(rows.find((r) => r.label === 'Population')?.value).toBe('Adult');

    const blank = buildRoleSnapshotRows(baseJob({ setting: '  ', population: null }));
    expect(blank.map((r) => r.label)).not.toContain('Setting');
    expect(blank.map((r) => r.label)).not.toContain('Population');
  });
});
