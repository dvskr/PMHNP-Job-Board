/**
 * Role-upgrade regression lock (app/api/auth/profile/route.ts).
 *
 * The signup upsert's UPDATE branch omitted `role` entirely (anti-demotion
 * guard for manually-promoted admins). Correct for admin, but it silently
 * swallowed the one legitimate transition: an employer whose first sign-in
 * defaulted them to job_seeker completed the employer signup form, got a
 * success response, and stayed job_seeker — locked out of every employer
 * surface with no error anywhere. Seen in prod, reported as an "account
 * conflict". These tests pin the upgrade path open and the dangerous
 * directions closed.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../../app/api/auth/profile/route.ts'),
  'utf8',
);

describe('job_seeker -> employer upgrade', () => {
  it('the upsert UPDATE branch applies the upgrade', () => {
    expect(src).toContain(
      "const allowRoleUpgrade = existingProfile?.role === 'job_seeker' && role === 'employer'",
    );
    expect(src).toContain("...(allowRoleUpgrade ? { role: 'employer' } : {})");
  });

  it('only the job_seeker -> employer direction exists', () => {
    // No demotion path and no admin path may appear in the update branch.
    expect(src).not.toContain("role: 'job_seeker' }");
    const updateBlock = src.slice(src.indexOf('update: {'), src.indexOf('create: {'));
    expect(updateBlock).not.toContain('admin');
  });

  it('unknown roles still collapse to the safe default', () => {
    expect(src).toContain("ALLOWED_SIGNUP_ROLES.has(rawRole)");
    expect(src).toContain(": 'job_seeker'");
  });

  it('the consumer-email employer block runs BEFORE the upsert', () => {
    const emailCheckAt = src.indexOf('Free email providers are not accepted');
    const upsertAt = src.indexOf('prisma.userProfile.upsert');
    expect(emailCheckAt).toBeGreaterThan(-1);
    expect(upsertAt).toBeGreaterThan(emailCheckAt);
  });

  it('an upgrading employer still gets an employer lead', () => {
    expect(src).toContain('if (!existingProfile || allowRoleUpgrade)');
  });
});
