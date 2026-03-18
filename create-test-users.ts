import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { prisma } from './lib/prisma.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const TEST_SEEKER_EMAIL = 'testseeker@pmhnptest.com';
const TEST_SEEKER_PASS = 'TestSeeker123!';
const TEST_EMPLOYER_EMAIL = 'testemployer@pmhnptest.com';
const TEST_EMPLOYER_PASS = 'TestEmployer123!';

async function createTestUser(email: string, password: string, role: string, firstName: string, company?: string) {
    // Check if user already exists
    const existing = await prisma.userProfile.findFirst({ where: { email } });
    if (existing) {
        console.log(`  ✓ ${role} already exists: ${email} (supabaseId: ${existing.supabaseId})`);
        return existing;
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
    });

    if (authError) {
        console.error(`  ✗ Failed to create auth user: ${authError.message}`);
        return null;
    }

    console.log(`  ✓ Created Supabase auth user: ${authData.user.id}`);

    // Create UserProfile
    const profile = await prisma.userProfile.create({
        data: {
            supabaseId: authData.user.id,
            email,
            role,
            firstName,
            lastName: 'Test',
            ...(company ? { company } : {}),
        },
    });

    console.log(`  ✓ Created UserProfile: ${profile.id}`);
    return profile;
}

async function main() {
    console.log('=== Creating Test Accounts ===\n');

    console.log('1. Creating test job seeker...');
    const seeker = await createTestUser(TEST_SEEKER_EMAIL, TEST_SEEKER_PASS, 'job_seeker', 'TestCandidate');

    console.log('\n2. Creating test employer...');
    const employer = await createTestUser(TEST_EMPLOYER_EMAIL, TEST_EMPLOYER_PASS, 'employer', 'TestEmployer', 'Test Corp');

    if (!seeker || !employer) {
        console.error('\nFailed to create test users. Exiting.');
        return;
    }

    // Find an employer-posted job to test with
    const testJob = await prisma.job.findFirst({
        where: { sourceType: 'employer', isPublished: true },
        select: { id: true, title: true, slug: true },
    });

    console.log(`\n=== Test Credentials ===`);
    console.log(`Job Seeker: ${TEST_SEEKER_EMAIL} / ${TEST_SEEKER_PASS}`);
    console.log(`Employer:   ${TEST_EMPLOYER_EMAIL} / ${TEST_EMPLOYER_PASS}`);
    if (testJob) {
        console.log(`Test Job:   "${testJob.title}" → /jobs/${testJob.slug}`);
    }
    console.log(`\nSeeker profile ID: ${seeker.id}`);
    console.log(`Employer profile ID: ${employer.id}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
