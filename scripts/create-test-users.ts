#!/usr/bin/env node
// Load env BEFORE any import that touches process.env.
// eslint-disable-next-line import/order
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig();

/**
 * Local-dev E2E account seeder.
 *
 * Creates (or repairs) the three accounts the Playwright journeys expect,
 * matching .env.test.example: a job seeker, an employer, and an admin.
 *
 * Idempotent and safe to re-run:
 *   - If the Supabase auth user exists, its password is reset to the known
 *     E2E value and the email is confirmed.
 *   - If the UserProfile row exists, its role is corrected.
 *   - Nothing else in the database is touched.
 *
 * Run:
 *   npm run e2e:users
 *   (equivalent to: npx ts-node -r tsconfig-paths/register --project scripts/tsconfig.json scripts/create-test-users.ts)
 *
 * Never point this at production: it reads NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL from .env.local / .env.
 */

import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
}

if (/sggccmqjzuimwlahocmy/.test(supabaseUrl)) {
    console.error('Refusing to seed E2E accounts into the production Supabase project.');
    process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

interface TestAccount {
    email: string;
    password: string;
    role: 'job_seeker' | 'employer' | 'admin';
    firstName: string;
    company?: string;
}

const ACCOUNTS: TestAccount[] = [
    { email: 'testseeker@pmhnptest.com', password: 'TestSeeker123!', role: 'job_seeker', firstName: 'TestCandidate' },
    { email: 'testemployer@pmhnptest.com', password: 'TestEmployer123!', role: 'employer', firstName: 'TestEmployer', company: 'Test Corp' },
    { email: 'testadmin@pmhnptest.com', password: 'TestAdmin123!', role: 'admin', firstName: 'TestAdmin' },
];

async function findAuthUserByEmail(email: string): Promise<string | null> {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    return match?.id ?? null;
}

async function ensureAuthUser(account: TestAccount, knownId: string | null): Promise<string> {
    const existingId = knownId ?? (await findAuthUserByEmail(account.email));
    if (existingId) {
        const { error } = await admin.auth.admin.updateUserById(existingId, {
            password: account.password,
            email_confirm: true,
        });
        if (error) throw new Error(`updateUserById failed for ${account.email}: ${error.message}`);
        console.log(`  = auth user exists, password reset: ${account.email}`);
        return existingId;
    }

    const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser failed for ${account.email}: ${error?.message}`);
    console.log(`  + created auth user: ${account.email}`);
    return data.user.id;
}

async function ensureProfile(account: TestAccount, supabaseId: string) {
    const existing = await prisma.userProfile.findFirst({ where: { email: account.email } });
    if (existing) {
        if (existing.role !== account.role || existing.supabaseId !== supabaseId) {
            await prisma.userProfile.update({
                where: { id: existing.id },
                data: { role: account.role, supabaseId },
            });
            console.log(`  ~ profile repaired (role=${account.role}): ${account.email}`);
        } else {
            console.log(`  = profile exists (role=${account.role}): ${account.email}`);
        }
        return existing;
    }

    const created = await prisma.userProfile.create({
        data: {
            supabaseId,
            email: account.email,
            role: account.role,
            firstName: account.firstName,
            lastName: 'Test',
            ...(account.company ? { company: account.company } : {}),
        },
    });
    console.log(`  + created profile (role=${account.role}): ${account.email}`);
    return created;
}

async function main() {
    console.log('=== E2E test accounts ===\n');

    for (const account of ACCOUNTS) {
        console.log(`${account.role}:`);
        const profile = await prisma.userProfile.findFirst({ where: { email: account.email } });
        const supabaseId = await ensureAuthUser(account, profile?.supabaseId ?? null);
        await ensureProfile(account, supabaseId);
    }

    const testJob = await prisma.job.findFirst({
        where: { sourceType: 'employer', isPublished: true },
        select: { title: true, slug: true },
    });

    console.log('\n=== Credentials (copy into .env.test) ===');
    for (const account of ACCOUNTS) {
        const key = account.role === 'job_seeker' ? 'SEEKER' : account.role.toUpperCase();
        console.log(`E2E_${key}_EMAIL=${account.email}`);
        console.log(`E2E_${key}_PASS=${account.password}`);
    }
    if (testJob) {
        console.log(`\nEmployer-posted job for apply tests: "${testJob.title}" at /jobs/${testJob.slug}`);
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
