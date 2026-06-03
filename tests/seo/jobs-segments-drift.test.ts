/**
 * S1 fix + enterprise drift guard.
 *
 * (1) isUnknownJobsTaxonomy is the pure decision that makes a guessed `/jobs/<slug>`
 *     return 410 instead of a soft-404 (HTTP 200).
 * (2) The drift guard asserts JOBS_TOP_SEGMENTS exactly matches the real app/jobs/
 *     route folders — so a new category route that isn't added to the set fails CI,
 *     replacing the audit-flagged hand-maintained "keep in sync" allowlists.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JOBS_TOP_SEGMENTS, isUnknownJobsTaxonomy } from '@/lib/pseo/jobs-segments-edge';

describe('isUnknownJobsTaxonomy', () => {
  it('a known category is NOT unknown (renders normally)', () => {
    expect(isUnknownJobsTaxonomy('remote')).toBe(false);
    expect(isUnknownJobsTaxonomy('telehealth')).toBe(false);
    expect(isUnknownJobsTaxonomy('1099')).toBe(false);
  });

  it('namespace roots (city/state/metro/edit/locations) are NOT unknown', () => {
    for (const ns of ['city', 'state', 'metro', 'edit', 'locations']) {
      expect(isUnknownJobsTaxonomy(ns)).toBe(false);
    }
  });

  it('a guessed/garbage slug IS unknown (→ 410)', () => {
    expect(isUnknownJobsTaxonomy('totally-not-a-category-zzz')).toBe(true);
    expect(isUnknownJobsTaxonomy('fake-cat-abc123')).toBe(true);
  });

  it('a job-detail slug (ends with a UUID) is NOT unknown — the DB check owns it', () => {
    expect(isUnknownJobsTaxonomy('pmhnp-at-acme-12345678-1234-1234-1234-123456789012')).toBe(false);
  });
});

describe('JOBS_TOP_SEGMENTS drift guard', () => {
  it('exactly matches the real app/jobs/ single-segment route folders', () => {
    const jobsDir = path.resolve(__dirname, '../../app/jobs');
    const actual = fs
      .readdirSync(jobsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '[slug]')
      .map((d) => d.name)
      .sort();
    const declared = [...JOBS_TOP_SEGMENTS].sort();
    // If this fails: a /jobs/<x> route folder was added or removed without
    // updating JOBS_TOP_SEGMENTS. Update the set so middleware keeps 410-ing
    // only genuinely-unknown slugs (and never a real page).
    expect(declared).toEqual(actual);
  });
});
