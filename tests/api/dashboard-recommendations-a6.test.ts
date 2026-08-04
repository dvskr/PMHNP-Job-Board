/**
 * A6 regression lock — dashboard recommendation hygiene.
 *
 * The "For you" panel used to serve the latest AI rec batch with no age cap
 * and no isPublished/expiresAt filter, so when the rec pipeline died the
 * dashboard silently served stale picks (including unpublished and expired
 * jobs) forever. The rule-based fallback ordered by raw createdAt desc, which
 * buried paying employers' posts under the aggregator firehose.
 *
 * Source-reading lock (renewal-cta.test.ts style) so these guards cannot be
 * quietly removed.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../../app/api/dashboard/route.ts'),
  'utf8',
);

const aiStart = src.indexOf('async function getAiRecommendedJobs');
const ruleStart = src.indexOf('async function getRecommendedJobs');

describe('function boundaries', () => {
  it('both recommendation functions exist where expected', () => {
    expect(aiStart).toBeGreaterThan(-1);
    expect(ruleStart).toBeGreaterThan(aiStart);
  });
});

const aiBody = src.slice(aiStart, ruleStart);
const ruleBody = src.slice(ruleStart);

describe('AI rec batch (getAiRecommendedJobs)', () => {
  it('caps the batch age at 7 days and falls through to rule-based beyond it', () => {
    expect(src).toMatch(/REC_BATCH_MAX_AGE_DAYS = 7/);
    expect(aiBody).toMatch(/createdAt:\s*\{\s*gte:\s*batchCutoff\s*\}/);
  });

  it('joins recs to LIVE jobs only (isPublished + not expired)', () => {
    expect(aiBody).toMatch(/isPublished:\s*true/);
    expect(aiBody).toMatch(/expiresAt:\s*null/);
    expect(aiBody).toMatch(/expiresAt:\s*\{\s*gt:\s*now\s*\}/);
  });
});

describe('rule-based fallback (getRecommendedJobs)', () => {
  it('orders by the canonical best sort (employer posts pin first)', () => {
    expect(ruleBody).toMatch(/orderBy:\s*buildJobsOrderBy\('best'\)/);
  });

  it('no longer orders by raw createdAt desc', () => {
    expect(ruleBody).not.toMatch(/orderBy:\s*\{\s*createdAt:\s*'desc'\s*\}/);
  });

  it('excludes expired listings like the AI path does', () => {
    expect(ruleBody).toMatch(/expiresAt:\s*\{\s*gt:\s*new Date\(\)\s*\}/);
  });
});

describe('imports', () => {
  it('pulls the sort from the single source of truth', () => {
    expect(src).toMatch(/import \{ buildJobsOrderBy \} from '@\/lib\/utils\/job-sort'/);
  });
});
