/**
 * S1 + S2 regression lock (structural). The job-detail page is a 1,200-line RSC
 * that can't be unit-rendered in node, so we lock the two control-flow guarantees
 * at the source level:
 *   S1 — a deleted job (status 'gone') returns a real 404 via notFound(),
 *        not a soft-200 "no longer available" body.
 *   S2 — a DB error in getJob is re-thrown (→ 500), never masked as 'gone'
 *        (which would render 200 + noindex and deindex live jobs).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../../app/jobs/[slug]/page.tsx'),
  'utf8',
);

describe('job-detail page status handling', () => {
  it('S2: getJob re-throws DB errors instead of returning a soft-200 gone page', () => {
    expect(src).toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]*?throw error/);
  });

  it('S1: a deleted job (status "gone") calls notFound() (real 404)', () => {
    expect(src).toMatch(/status === 'gone'[\s\S]{0,40}notFound\(\)/);
  });
});
