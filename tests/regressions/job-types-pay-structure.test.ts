/**
 * jobTypes must describe the SCHEDULE, not the pay structure (hunt 2026-09-03).
 *
 * "1099", "fee for service" and "W-2" say how a role pays. They used to live
 * inside the ordinary Contract and Full-Time matchers, and since
 * detectAllJobTypes returns every match, a full-time fee-for-service posting
 * came out as ['Full-Time','Contract']. The Role Snapshot renders that as
 * "Schedule: Full-Time, Contract" and JobStructuredData emits employmentType
 * ['FULL_TIME','CONTRACTOR'], advertising two mutually exclusive schedules for
 * one job to readers and to Google.
 */
import { describe, it, expect } from 'vitest';
import { detectJobType, detectAllJobTypes, collectJobTypes } from '@/lib/job-normalizer';

describe('pay-structure markers do not add a second schedule', () => {
  it('keeps a full-time fee-for-service role single-schedule', () => {
    expect(collectJobTypes('Full-Time', 'Remote Psychiatric Nurse Practitioner - Fee For Service'))
      .toEqual(['Full-Time']);
  });

  it('keeps a 1099 part-time role on its real schedule', () => {
    expect(collectJobTypes(null, '1099 Part-Time Psychiatric Mental Health Nurse Practitioner'))
      .toEqual(['Part-Time']);
  });

  it('does not let W-2 add Full-Time to a part-time posting', () => {
    expect(collectJobTypes(null, 'W-2 Part-Time PMHNP')).toEqual(['Part-Time']);
  });

  it('does not let 1099 add Contract to a full-time primary', () => {
    expect(collectJobTypes('Full-Time', '1099 Psychiatric Nurse Practitioner'))
      .toEqual(['Full-Time']);
  });
});

describe('pay-structure markers still classify when nothing else does', () => {
  it('a 1099-only title is Contract, not unclassified', () => {
    expect(detectJobType('1099 Psychiatric Nurse Practitioner')).toBe('Contract');
    expect(detectAllJobTypes('1099 Psychiatric Nurse Practitioner')).toEqual(['Contract']);
    expect(collectJobTypes(null, '1099 Psychiatric Nurse Practitioner')).toEqual(['Contract']);
  });

  it('a fee-for-service-only title is Contract', () => {
    expect(detectJobType('PMHNP - Fee For Service')).toBe('Contract');
  });

  it('a W-2-only title is Full-Time', () => {
    expect(detectJobType('W2 Psychiatric Nurse Practitioner')).toBe('Full-Time');
  });
});

describe('genuine schedule signals are unchanged', () => {
  it.each([
    ['Locum Tenens PMHNP', 'Locum Tenens'],
    ['PRN Psychiatric NP', 'Per Diem'],
    ['Per Diem PMHNP', 'Per Diem'],
    ['Contract Psychiatric Nurse Practitioner', 'Contract'],
    ['Independent Contractor PMHNP', 'Contract'],
    ['Part-Time PMHNP', 'Part-Time'],
    ['Full-Time PMHNP', 'Full-Time'],
    ['Permanent Psychiatric NP', 'Full-Time'],
  ])('%s resolves to %s', (title, expected) => {
    expect(detectJobType(title)).toBe(expected);
  });

  it('still keeps a real multi-schedule posting multi-valued', () => {
    // "Full-Time or Part-Time" is two genuine schedules, not a pay structure.
    expect(detectAllJobTypes('PMHNP Full-Time or Part-Time'))
      .toEqual(expect.arrayContaining(['Part-Time', 'Full-Time']));
  });

  it('returns nothing for a title with no schedule signal at all', () => {
    expect(detectAllJobTypes('Psychiatric Nurse Practitioner')).toEqual([]);
    expect(detectJobType('Psychiatric Nurse Practitioner')).toBeNull();
  });
});
