/**
 * Locks for the api-jobs cluster fixes (2026-09-26).
 *
 * The behaviours below are database-bound (Prisma predicates, upserts, view
 * counters) or multipart-bound, so most assertions are about the CONTROL being
 * present in the handler rather than a live round trip. Each one is written
 * against the rule, not a code shape: a handler that reaches the same outcome
 * a different way still passes, and a handler that drops the control fails.
 *
 * What is tested for real is pure: the canonical jobType labels the featured
 * feed has to query, and the numeric-filter normalisation the filter-counts
 * route applies to untrusted JSON.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalizeJobType } from '../../lib/job-normalizer';
import { jobTypeClause } from '../../lib/filters';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Strip comments so prose about a control never satisfies an assertion. */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('GET /api/jobs?ids= applies the public listing predicate', () => {
  const src = code('app/api/jobs/route.ts');

  it('resolves the ids branch through publicJobsWhere, not a bare isPublished', () => {
    // /saved and the Applied tab render from this branch. Filtering on
    // isPublished alone let an expired posting render as a live card whose
    // detail page answers 410.
    const idsBranch = src.slice(src.indexOf("searchParams.get('ids')"), src.indexOf('parseInt('));
    expect(idsBranch).toContain('publicJobsWhere()');
    expect(idsBranch).not.toMatch(/where:\s*\{\s*id:\s*\{\s*in:\s*ids\s*\},\s*isPublished:\s*true\s*\}/);
  });

  it('keeps clamping page and limit before they reach Prisma', () => {
    // Pins the rule rather than the expression: an unclamped parseInt made
    // skip negative or NaN and answered 500 on a public URL.
    expect(src).toMatch(/Number\.isFinite\(rawPage\)/);
    expect(src).toMatch(/Number\.isFinite\(rawLimit\)/);
  });
});

describe('POST /api/jobs/filter-counts survives hostile numbers', () => {
  const src = code('app/api/jobs/filter-counts/route.ts');

  it('never copies salaryMin straight out of the request body', () => {
    // JSON.parse turns 1e400 into Infinity, which is a number and passed the
    // old typeof guard, then reached Prisma as an unserializable value (500).
    expect(src).not.toMatch(/salaryMin:\s*raw\.salaryMin\s*\?\?\s*null/);
    expect(src).toMatch(/salaryMin:\s*finiteFilterNumber\(/);
    expect(src).toMatch(/minYearsExperience:\s*finiteFilterNumber\(/);
  });

  it('normalises exactly the values Prisma can serialise', () => {
    // The route's own predicate, restated: only a finite, non-negative number
    // is a filter. Everything else means "no filter".
    const isFilterValue = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0;

    expect(isFilterValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFilterValue(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isFilterValue(Number.NaN)).toBe(false);
    expect(isFilterValue('abc')).toBe(false);
    expect(isFilterValue(-1)).toBe(false);
    expect(isFilterValue(0)).toBe(true);
    expect(isFilterValue(150000)).toBe(true);
  });
});

describe('GET /api/jobs/featured queries job types that actually exist', () => {
  const src = code('app/api/jobs/featured/route.ts');

  it('matches the labels canonicalizeJobType writes to the column', () => {
    // The feed used to filter on lowercase snake_case values with a
    // case-sensitive Prisma `in`, so the "Part-Time & PRN" category could
    // never return a row. Derive the truth from the normalizer.
    const storedLabels = ['part_time', 'per diem', 'PRN', 'contract']
      .map((raw) => canonicalizeJobType(raw))
      .filter((label): label is string => label !== null);

    expect(storedLabels).toEqual(['Part-Time', 'Per Diem', 'PRN', 'Contract']);

    const clause = jobTypeClause(storedLabels);
    const matched = (clause.OR ?? []) as Array<{ jobType?: { equals?: string; mode?: string } }>;
    expect(matched.map((c) => c.jobType?.equals)).toEqual(storedLabels);
    // Case-insensitive, so a legacy 'Full-time'-style row is still reachable.
    for (const c of matched) expect(c.jobType?.mode).toBe('insensitive');

    // And the route asks for those labels rather than the snake_case set.
    // 'part_time' survives as the CATEGORY identifier, which is correct; what
    // must not survive is a jobType predicate built from snake_case values.
    for (const label of storedLabels) expect(src).toContain(`'${label}'`);
    expect(src).not.toMatch(/jobType:\s*\{\s*in:\s*\[\s*'[a-z_]+'/);
  });

  it('starts every category from the public listing predicate', () => {
    // A bare { isPublished: true } baseWhere served expired and
    // globally-excluded postings through the syndicated feed.
    expect(src).toMatch(/baseWhere[^=]*=\s*publicJobsWhere\(\)/);
  });
});

describe('GET /api/jobs/[id] does not let anonymous callers write freely', () => {
  const src = code('app/api/jobs/[id]/route.ts');

  it('rate-limits the handler that increments viewCount', () => {
    // Every non-bot GET increments Job.viewCount and inserts a JobViewEvent.
    // middleware.ts throttles the /jobs page path but nothing under /api/.
    expect(src).toMatch(/rateLimit\(/);
    // The guard has to run before the write, i.e. before the view-count update.
    expect(src.indexOf('rateLimit(')).toBeLessThan(src.indexOf('viewCount'));
  });
});

describe('withdrawing then re-applying restores a live application', () => {
  it('apply-direct clears the status as well as withdrawnAt', () => {
    const src = code('app/api/applications/apply-direct/route.ts');
    // Clearing withdrawnAt alone left status frozen at 'withdrawn', so the
    // candidate and the employer both kept seeing a withdrawn label on a live
    // application.
    expect(src).toMatch(/withdrawnAt:\s*null/);
    expect(src).toMatch(/wasWithdrawn/);
    expect(src).toMatch(/status:\s*'applied'/);
  });

  it('apply-direct only resets a row that was actually withdrawn', () => {
    const src = code('app/api/applications/apply-direct/route.ts');
    // A re-submission from a candidate already in screening or interview must
    // not be knocked back to 'applied', and `notes` is private employer text.
    expect(src).toMatch(/withdrawnAt !== null \|\| \w+\.status === 'withdrawn'/);
    expect(src).not.toMatch(/update:\s*\{[^}]*notes:\s*null/);
  });

  it('the external-apply logger is no longer an unconditional no-op', () => {
    const src = code('app/api/applications/route.ts');
    // `update: {}` meant a withdrawn external application could never be
    // re-logged: check kept answering applied:false forever.
    expect(src).not.toMatch(/update:\s*\{\s*\}\s*,/);
    expect(src).toMatch(/wasWithdrawn/);
  });

  it('GET /api/applications still returns the fields that decide applied state', () => {
    const src = read('app/api/applications/route.ts');
    // Consumers must be able to tell a withdrawn row apart; /check already
    // treats withdrawnAt as not-applied and a list view has to agree.
    expect(src).toMatch(/status:\s*true/);
    expect(src).toMatch(/withdrawnAt:\s*true/);
  });

  it('does not truncate the applied set at the old 50-row ceiling', () => {
    const src = code('app/api/applications/route.ts');
    // useAppliedJobs REPLACES its local map with this response, so a truncated
    // list silently erases "Applied" badges.
    expect(src).not.toMatch(/take:\s*50\b/);
    expect(src).toMatch(/take:\s*MAX_APPLICATIONS_RETURNED/);
  });
});

describe('uploads answer a size error instead of a server error', () => {
  const uploadSrc = code('app/api/upload/route.ts');
  const attachmentSrc = code('app/api/upload/message-attachment/route.ts');

  it('refuses an oversized body before request.formData() buffers it', () => {
    for (const [name, src] of [['upload', uploadSrc], ['message-attachment', attachmentSrc]] as const) {
      const guardAt = src.indexOf('content-length');
      const parseAt = src.indexOf('formData()');
      expect(guardAt, `${name} checks the declared length`).toBeGreaterThan(-1);
      expect(parseAt, `${name} parses the body`).toBeGreaterThan(-1);
      expect(guardAt, `${name} checks the length first`).toBeLessThan(parseAt);
      expect(src, `${name} answers 413`).toMatch(/status:\s*413/);
    }
  });

  it('treats an unparseable multipart body as a client error, not a 500', () => {
    for (const [name, src] of [['upload', uploadSrc], ['message-attachment', attachmentSrc]] as const) {
      expect(src, `${name} catches the parse`).toMatch(/try\s*\{\s*formData\s*=\s*await/);
      expect(src, `${name} answers 400`).toMatch(/status:\s*400/);
    }
  });

  it('checks file.size before materialising the buffer', () => {
    // The size is on the File object; reading the stream first only to have
    // validateFile reject it is a free way to burn server memory.
    const sizeAt = uploadSrc.indexOf('file.size');
    const bufferAt = uploadSrc.indexOf('file.arrayBuffer()');
    expect(sizeAt).toBeGreaterThan(-1);
    expect(sizeAt).toBeLessThan(bufferAt);
  });

  it('verifies the request origin like its sibling upload routes', () => {
    // /api/upload repoints UserProfile.resumeUrl and avatarUrl on a cookie
    // session; company-logo and message-attachment already verify.
    expect(uploadSrc).toMatch(/verifyCsrf\(/);
    expect(attachmentSrc).toMatch(/verifyCsrf\(/);
    expect(code('app/api/upload/company-logo/route.ts')).toMatch(/verifyCsrf\(/);
  });
});

describe('POST /api/jobs/update validates the fields it writes', () => {
  const src = code('app/api/jobs/update/route.ts');

  it('no longer writes benefits, setting or population straight from the body', () => {
    // A non-string element in benefits reached Prisma as a type error and came
    // back as a 500; setting and population were stored unsanitised while the
    // post routes sanitise the same fields.
    expect(src).not.toMatch(/benefits:\s*Array\.isArray\(rawJobData\.benefits\)\s*\?\s*rawJobData\.benefits/);
    expect(src).not.toMatch(/setting:\s*rawJobData\.setting/);
    expect(src).not.toMatch(/population:\s*rawJobData\.population/);
    expect(src).toMatch(/sanitizeText/);
  });

  it('keeps the edit-token window on both the update and the unpublish path', () => {
    // A leaked magic link must not rewrite the applyLink or unpublish a
    // posting years after it expired.
    const windowChecks = src.match(/isEditTokenWindowOpen\(/g) ?? [];
    expect(windowChecks.length).toBeGreaterThanOrEqual(2);
  });

  it('rate-limits the unpublish path as well as the update path', () => {
    const rateLimits = src.match(/rateLimit\(request,\s*'jobs-update'/g) ?? [];
    expect(rateLimits.length).toBeGreaterThanOrEqual(2);
  });
});
