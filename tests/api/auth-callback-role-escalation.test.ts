/**
 * Privilege escalation guard: signup role must never come from client metadata.
 *
 * Supabase `user_metadata` is written by the client — `supabase.auth.signUp({
 * options: { data } })` and `updateUser({ data })` both put arbitrary keys
 * there. Two paths already knew this and allow-list the role to
 * employer | job_seeker: `readSignupMetadata` (lib/auth/ensure-profile.ts) and
 * ALLOWED_SIGNUP_ROLES in /api/auth/profile.
 *
 * The 2026-09-02 hunt found app/auth/callback/route.ts bypassed both, writing
 * `role: metadata.role || 'job_seeker'` straight into UserProfile. Signing up
 * with `{ role: 'admin' }` and completing the callback minted an admin profile,
 * which every admin page and all 68 requireApiAdmin routes then trusted.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { User } from '@supabase/supabase-js';
import { readSignupMetadata } from '@/lib/auth/ensure-profile';

const ROOT = process.cwd();
const CALLBACK = path.join(ROOT, 'app/auth/callback/route.ts');

function authUser(metadata: Record<string, unknown>): User {
    return {
        id: 'supabase-user-fic-1',
        email: 'candidate@examplepsych.example',
        user_metadata: metadata,
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2026-09-02T00:00:00.000Z',
    } as unknown as User;
}

describe('readSignupMetadata role allow-list', () => {
    it.each(['admin', 'ADMIN', 'superuser', 'owner', 'moderator', '', 'job_seeker '])(
        'refuses %s and falls back to job_seeker',
        (role) => {
            expect(readSignupMetadata(authUser({ role })).role).toBe('job_seeker');
        },
    );

    it.each([
        [{ role: 'employer' }, 'employer'],
        [{ role: 'job_seeker' }, 'job_seeker'],
        [{}, 'job_seeker'],
    ])('maps %o to %s', (metadata, expected) => {
        expect(readSignupMetadata(authUser(metadata)).role).toBe(expected);
    });

    it('refuses a non-string role without throwing', () => {
        for (const role of [1, true, null, { admin: true }, ['admin']]) {
            expect(readSignupMetadata(authUser({ role })).role).toBe('job_seeker');
        }
    });

    it('drops the company name unless the role really is employer', () => {
        expect(readSignupMetadata(authUser({ role: 'admin', company: 'Acme' })).company).toBeNull();
        expect(readSignupMetadata(authUser({ role: 'employer', company: 'Acme' })).company).toBe('Acme');
    });
});

describe('app/auth/callback/route.ts profile creation', () => {
    const src = fs.readFileSync(CALLBACK, 'utf8');

    it('derives the role through the shared allow-list', () => {
        expect(src).toContain('readSignupMetadata');
    });

    it('never writes a role read straight off client metadata', () => {
        // The exact shapes that granted admin before the fix.
        expect(src).not.toMatch(/role:\s*metadata\.role/);
        expect(src).not.toMatch(/metadata\.role\s*\|\|/);
        expect(src).not.toMatch(/user_metadata\??\.role/);
    });

    it('passes the derived role, not raw metadata, into userProfile.create', () => {
        const create = src.slice(src.indexOf('prisma.userProfile.create'));
        const block = create.slice(0, create.indexOf('})') + 2);
        expect(block).toMatch(/role:\s*signupRole/);
    });
});
