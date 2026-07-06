/**
 * S1 fix + enterprise drift guard.
 *
 * (1) isUnknownJobsTaxonomy is the pure decision that makes a guessed `/jobs/<slug>`
 *     return 410 instead of a soft-404 (HTTP 200).
 * (2) The drift guard asserts JOBS_TOP_SEGMENTS exactly matches the real app/jobs/
 *     route folders — so a new category route that isn't added to the set fails CI,
 *     replacing the audit-flagged hand-maintained "keep in sync" allowlists.
 * (3) The JOBS_TAXONOMY registry guard pins the registry (the single source of
 *     truth every derived taxonomy list is built from) against the real
 *     app/jobs/ category folders AND pins the flag counts that drive the
 *     derived lists (middleware allowlists, sitemaps, index-pseo cron).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  JOBS_TAXONOMY,
  JOBS_NAMESPACE_SEGMENTS,
  JOBS_TOP_SEGMENTS,
  isUnknownJobsTaxonomy,
} from '@/lib/pseo/jobs-segments-edge';

const jobsDir = path.resolve(__dirname, '../../app/jobs');

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
    const actual = fs
      .readdirSync(jobsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '[slug]')
      .map((d) => d.name)
      .sort();
    const declared = [...JOBS_TOP_SEGMENTS].sort();
    // If this fails: a /jobs/<x> route folder was added or removed without
    // updating the JOBS_TAXONOMY registry (or JOBS_NAMESPACE_SEGMENTS). Update
    // the registry so middleware keeps 410-ing only genuinely-unknown slugs
    // (and never a real page).
    expect(declared).toEqual(actual);
  });
});

describe('JOBS_TAXONOMY registry drift guard', () => {
  it('every registry slug has a real app/jobs/<slug>/page.tsx', () => {
    for (const entry of JOBS_TAXONOMY) {
      const pagePath = path.join(jobsDir, entry.slug, 'page.tsx');
      expect(
        fs.existsSync(pagePath),
        `Registry slug "${entry.slug}" has no app/jobs/${entry.slug}/page.tsx — remove it from JOBS_TAXONOMY or restore the route.`,
      ).toBe(true);
    }
  });

  it('every category folder under app/jobs/ has a registry entry (namespaces excluded)', () => {
    const nonCategoryDirs = new Set(['[slug]', ...JOBS_NAMESPACE_SEGMENTS]);
    const categoryDirs = fs
      .readdirSync(jobsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !nonCategoryDirs.has(d.name))
      .map((d) => d.name)
      .sort();
    const registrySlugs = JOBS_TAXONOMY.map((e) => e.slug).sort();
    // If this fails: a category route folder was added/removed without a
    // matching JOBS_TAXONOMY entry. Add the entry (with correct flags) so the
    // sitemaps, middleware allowlists, and index-pseo cron pick it up.
    expect(registrySlugs).toEqual(categoryDirs);
  });

  it('registry slugs are unique', () => {
    const slugs = JOBS_TAXONOMY.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('derived-list flag counts match the deployed pSEO surface', () => {
    const count = (pred: (e: (typeof JOBS_TAXONOMY)[number]) => boolean) =>
      JOBS_TAXONOMY.filter(pred).length;

    // 13 taxonomies have app/jobs/<slug>/[state] routes (middleware state gate).
    expect(count((e) => e.stateEligible)).toBe(13);
    // All 28 categories have app/jobs/<slug>/city/[slug] routes.
    expect(count((e) => e.cityEligible)).toBe(28);
    // 13 categories are emitted by the batched city sitemaps.
    expect(count((e) => e.inCitySitemaps)).toBe(13);
    // 13 categories are submitted by the index-pseo cron.
    expect(count((e) => e.pseoIndexing)).toBe(13);
    // 27 = 28 categories minus substance-abuse (2026-07: canonicalized to
    // /jobs/addiction — page stays live but only the canonical target is
    // sitemapped).
    expect(count((e) => e.inPrimarySitemap)).toBe(27);
    expect(
      JOBS_TAXONOMY.find((e) => e.slug === 'substance-abuse')?.inPrimarySitemap,
    ).toBe(false);
  });

  it('state-eligible taxonomies are always city-eligible (route shape invariant)', () => {
    for (const entry of JOBS_TAXONOMY) {
      if (entry.stateEligible) {
        expect(
          entry.cityEligible,
          `"${entry.slug}" is stateEligible but not cityEligible — every [state] taxonomy also has city pages.`,
        ).toBe(true);
      }
    }
  });
});
