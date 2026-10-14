/**
 * The newsletter and job-highlights opt-ins a seeker picks at signup.
 *
 * THE BUG. SignUpForm calls supabase.auth.signUp() and then POSTs
 * /api/auth/profile with the opt-ins. That POST authenticates from the
 * session cookie, and signUp() issues no session while the project requires
 * email confirmation, which this one does. So it answered 401 on essentially
 * every signup, the opt-ins were dropped, and the form showed "we could not
 * save your email preferences" on the success screen. An employer reported
 * that as a pop-up blocking the final step of signup.
 *
 * ensure-profile had already solved the identical problem for role and
 * company in 2026-05 by stashing them in auth user_metadata and reading them
 * back when the profile is really created. The opt-ins were simply never
 * added to that set. They are now, and this is the shared write both callers
 * use.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { readCode } from '@/tests/helpers/source';
import { applySignupPreferences } from '@/lib/auth/signup-preferences';
import { readSignupMetadata } from '@/lib/auth/ensure-profile';

vi.mock('@/lib/beehiiv', () => ({ syncToBeehiiv: vi.fn(), unsubscribeFromBeehiiv: vi.fn() }));

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SEEKER = 'jordan.reyes@example.test';

/** Shaped like the Supabase User the auth helpers receive. */
function authUser(metadata: Record<string, unknown>) {
  return { id: 'auth-1', email: SEEKER, user_metadata: metadata } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.emailLead.upsert.mockResolvedValue({});
  db.jobAlert.findFirst.mockResolvedValue(null);
  db.jobAlert.create.mockResolvedValue({});
});

describe('the opt-ins survive the missing session', () => {
  it('signup metadata carries all three, not just role and company', () => {
    // The whole fix. If these stop being written at signUp there is no other
    // channel: the POST cannot authenticate before confirmation.
    const src = read('components/auth/SignUpForm.tsx');
    const data = src.slice(src.indexOf('data: {'), src.indexOf('});', src.indexOf('data: {')));
    for (const key of ['want_job_highlights', 'highlights_frequency', 'newsletter_opt_in']) {
      expect(data, `signUp metadata is missing ${key}`).toContain(key);
    }
  });

  it('readSignupMetadata reads them back', () => {
    const derived = readSignupMetadata(authUser({
      role: 'job_seeker',
      want_job_highlights: true,
      highlights_frequency: 'weekly',
      newsletter_opt_in: true,
    }));
    expect(derived).toMatchObject({
      role: 'job_seeker',
      wantJobHighlights: true,
      highlightsFrequency: 'weekly',
      newsletterOptIn: true,
    });
  });

  it('defaults to NOT opted in when the metadata says nothing', () => {
    // An older signup recorded no choice. Inventing consent is the one
    // answer that is actually harmful, so absence means no.
    const derived = readSignupMetadata(authUser({ role: 'job_seeker' }));
    expect(derived.wantJobHighlights).toBe(false);
    expect(derived.newsletterOptIn).toBe(false);
  });

  it('never treats an employer as a seeker opt-in', () => {
    const derived = readSignupMetadata(authUser({
      role: 'employer',
      want_job_highlights: true,
      newsletter_opt_in: true,
    }));
    expect(derived.wantJobHighlights).toBe(false);
    expect(derived.newsletterOptIn).toBe(false);
  });
});

describe('applySignupPreferences', () => {
  it('creates the lead and the highlights alert for an opted-in seeker', async () => {
    await applySignupPreferences({
      email: SEEKER, role: 'job_seeker',
      wantJobHighlights: true, highlightsFrequency: 'daily', newsletterOptIn: true,
    });
    expect(db.emailLead.upsert).toHaveBeenCalledTimes(1);
    expect(db.jobAlert.create).toHaveBeenCalledTimes(1);
    expect(db.jobAlert.create.mock.calls[0][0].data).toMatchObject({
      email: SEEKER, frequency: 'daily', isActive: true,
    });
  });

  it('creates no alert when they did not ask for one', async () => {
    await applySignupPreferences({
      email: SEEKER, role: 'job_seeker',
      wantJobHighlights: false, newsletterOptIn: true,
    });
    expect(db.jobAlert.create).not.toHaveBeenCalled();
  });

  it('does nothing at all for an employer', async () => {
    await applySignupPreferences({
      email: 'hr@clinic.test', role: 'employer',
      wantJobHighlights: true, newsletterOptIn: true,
    });
    expect(db.emailLead.upsert).not.toHaveBeenCalled();
    expect(db.jobAlert.create).not.toHaveBeenCalled();
  });

  it('never re-subscribes an existing lead', async () => {
    // Both callers can run for one person, and a returning address may have
    // unsubscribed or been suppressed since. The update must be a no-op.
    await applySignupPreferences({
      email: SEEKER, role: 'job_seeker',
      wantJobHighlights: false, newsletterOptIn: true,
    });
    expect(db.emailLead.upsert.mock.calls[0][0].update).toEqual({});
  });

  it('does not create a second alert when one already exists', async () => {
    db.jobAlert.findFirst.mockResolvedValue({ id: 'existing' });
    await applySignupPreferences({
      email: SEEKER, role: 'job_seeker',
      wantJobHighlights: true, newsletterOptIn: true,
    });
    expect(db.jobAlert.create).not.toHaveBeenCalled();
  });

  it('falls back to daily for an unrecognised frequency', async () => {
    await applySignupPreferences({
      email: SEEKER, role: 'job_seeker',
      wantJobHighlights: true, highlightsFrequency: 'hourly', newsletterOptIn: false,
    });
    expect(db.jobAlert.create.mock.calls[0][0].data.frequency).toBe('daily');
  });

  it('still creates the alert when the lead write fails', async () => {
    // A failure in one must not silently cost them the other.
    db.emailLead.upsert.mockRejectedValue(new Error('db down'));
    await expect(applySignupPreferences({
      email: SEEKER, role: 'job_seeker',
      wantJobHighlights: true, newsletterOptIn: true,
    })).resolves.toBeUndefined();
    expect(db.jobAlert.create).toHaveBeenCalledTimes(1);
  });

  it('never throws, so it cannot cost anyone their account', async () => {
    db.emailLead.upsert.mockRejectedValue(new Error('boom'));
    db.jobAlert.findFirst.mockRejectedValue(new Error('boom'));
    await expect(applySignupPreferences({
      email: SEEKER, role: 'job_seeker',
      wantJobHighlights: true, newsletterOptIn: true,
    })).resolves.toBeUndefined();
  });
});

describe('the signup form no longer reports a loss that does not happen', () => {
  // Comments blanked: the comment explaining the removed warning quotes it,
  // which is exactly the failure mode tests/helpers/source.ts exists for.
  const src = readCode('components/auth/SignUpForm.tsx');

  it('the preferences warning is gone', () => {
    // It fired on a 401 that happens on every confirmation-required signup,
    // putting a failure notice on the success screen of a signup that worked.
    expect(src).not.toContain('could not save your email preferences');
    expect(src).not.toContain('prefsWarning');
  });

  it('the profile POST is best effort and cannot block the success screen', () => {
    const post = src.slice(src.indexOf("fetch('/api/auth/profile'"));
    expect(post.slice(0, 700)).toMatch(/\.catch\(\(\) => \{\}\)/);
  });
});

describe('ensure-profile applies them when the profile is really created', () => {
  it('calls the shared write right after creating the row', () => {
    const src = readCode('lib/auth/ensure-profile.ts');
    const createAt = src.indexOf('prisma.userProfile.create');
    expect(createAt, 'the create moved').toBeGreaterThan(-1);
    // Search AFTER the create, or this finds the import at the top of the
    // file and passes whether or not the call exists.
    expect(src.indexOf('applySignupPreferences', createAt)).toBeGreaterThan(createAt);
  });

  it('the POST route uses the same write, so the two cannot drift', () => {
    const src = read('app/api/auth/profile/route.ts');
    expect(src).toContain('applySignupPreferences');
    // The old inline copies are gone.
    expect(src).not.toContain("name: 'Job Highlights'");
  });
});
