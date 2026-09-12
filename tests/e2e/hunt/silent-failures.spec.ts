import { test, expect } from '@playwright/test';
import { loginAsSeeker } from '../fixtures/auth';

/**
 * Silent-failure hunt. Read-only probes: every request either 4xx's before
 * any write, or targets a non-existent job id so no row is created.
 */

test('apply-direct rejects the resume path shape that /api/upload stores', async ({ page }) => {
  await loginAsSeeker(page);
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/applications/apply-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: '00000000-0000-0000-0000-000000000000',
        consent: true,
        // exact shape written by app/api/upload/route.ts:72 (result.path)
        resumeUrl: 'resumes/695a9a7d-991f-4ca4-a2db-9f490eff5d4a/1756000000000-resume.pdf',
      }),
    });
    return { status: r.status, body: await r.text() };
  });
  console.log('APPLY_DIRECT_PATH_RESUME:', res.status, res.body);
  // A fake jobId would 404 if the resume URL had passed validation.
  expect(res.status).toBe(400);
  expect(res.body).toContain('Invalid resume URL');
});

test('apply-direct rejects the cover-letter path the apply form sends', async ({ page }) => {
  await loginAsSeeker(page);
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/applications/apply-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: '00000000-0000-0000-0000-000000000000',
        consent: true,
        coverLetterUrl: 'resumes/695a9a7d-991f-4ca4-a2db-9f490eff5d4a/1756000000000-cover.pdf',
      }),
    });
    return { status: r.status, body: await r.text() };
  });
  console.log('APPLY_DIRECT_PATH_COVER:', res.status, res.body);
  expect(res.status).toBe(400);
  expect(res.body).toContain('Invalid cover letter URL');
});

test('a full storage URL passes validation (control)', async ({ page }) => {
  await loginAsSeeker(page);
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/applications/apply-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: '00000000-0000-0000-0000-000000000000',
        consent: true,
        resumeUrl: 'https://zdmpmncrcpgpmwdqvekg.supabase.co/storage/v1/object/sign/resumes/x/y.pdf?token=abc',
      }),
    });
    return { status: r.status, body: await r.text() };
  });
  console.log('APPLY_DIRECT_URL_CONTROL:', res.status, res.body);
  expect(res.status).toBe(404); // got past URL validation, failed on the fake job
});
