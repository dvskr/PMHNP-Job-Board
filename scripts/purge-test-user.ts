/**
 * Hard-delete the test@pmhnphiring.com user from prod for re-test.
 *
 * Removes UserProfile + every child row that references the user by
 * supabaseId / userId / email, plus the Supabase auth user. Dry-run by
 * default; pass --apply to actually delete.
 *
 *   npx tsx scripts/purge-test-user.ts                   # report what would go
 *   npx tsx scripts/purge-test-user.ts --apply           # delete for real
 *   npx tsx scripts/purge-test-user.ts --email=<other>   # different test user
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_DATABASE_URL;
if (process.env.PROD_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.PROD_SUPABASE_URL;
if (process.env.PROD_SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
/* eslint-enable @typescript-eslint/no-require-imports */

async function main(): Promise<void> {
    const apply = process.argv.includes('--apply');
    const emailArg = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];
    const email = (emailArg ?? 'test@pmhnphiring.com').toLowerCase();

    console.log(`target=${email}  mode=${apply ? 'APPLY' : 'dry-run'}`);
    console.log('');

    const profile = await prisma.userProfile.findUnique({
        where: { email },
        select: { id: true, supabaseId: true, email: true, role: true, createdAt: true },
    });

    let supabaseId = profile?.supabaseId ?? null;
    let supaUser: { id: string; email: string | undefined } | null = null;

    // Find Supabase auth user by email even if no UserProfile exists yet
    // (signup might have created auth but failed to write profile).
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supaUrl || !supaKey) {
        console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY');
        process.exit(1);
    }
    const admin = createClient(supaUrl, supaKey);
    let page = 1;
    while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) {
            console.error(`listUsers error: ${error.message}`);
            break;
        }
        const match = data.users.find((u) => u.email?.toLowerCase() === email);
        if (match) {
            supaUser = { id: match.id, email: match.email };
            if (!supabaseId) supabaseId = match.id;
            break;
        }
        if (data.users.length < 1000) break;
        page += 1;
        if (page > 50) break;
    }

    console.log(`UserProfile:      ${profile ? `${profile.id}  role=${profile.role}` : '(none)'}`);
    console.log(`Supabase auth:    ${supaUser ? supaUser.id : '(none)'}`);
    console.log('');

    if (!profile && !supaUser) {
        console.log('Nothing to delete — exiting.');
        return;
    }

    // Count related rows so the dry-run output is informative.
    const sid = supabaseId;
    if (!sid) {
        console.log('No supabaseId to scan child rows by; will only delete UserProfile by email.');
    }

    // Per-model counts — only the rows we'll explicitly delete here.
    // Anything with an ON DELETE CASCADE FK to UserProfile gets handled
    // automatically when we delete the profile row at the end.
    const counts: Record<string, number> = {};
    async function tally(label: string, fn: () => Promise<number>): Promise<void> {
        try { counts[label] = await fn(); } catch { counts[label] = 0; }
    }
    const pid = profile?.id;
    if (sid) {
        await tally('employerJob', () => prisma.employerJob.count({ where: { userId: sid } }));
        await tally('jobDraft', () => prisma.jobDraft.count({ where: { userId: sid } }));
        await tally('jdTemplate', () => prisma.jdTemplate.count({ where: { userId: sid } }));
        await tally('savedJob', () => prisma.savedJob.count({ where: { userId: sid } }));
        await tally('pushSubscription', () => prisma.pushSubscription.count({ where: { userId: sid } }));
    }
    if (pid) {
        await tally('profileView (as viewer)', () => prisma.profileView.count({ where: { viewerId: pid } }));
        await tally('savedCandidate', () => prisma.savedCandidate.count({ where: { employerId: pid } }));
    }
    await tally('jobAlert', () => prisma.jobAlert.count({ where: { email } }));
    await tally('emailLead', () => prisma.emailLead.count({ where: { email } }));
    await tally('employerLead', () => prisma.employerLead.count({ where: { contactEmail: email } }));

    console.log('child-row counts:');
    for (const [k, v] of Object.entries(counts)) {
        if (v > 0) console.log(`  ${k.padEnd(28)}  ${v}`);
    }
    console.log('');

    if (!apply) {
        console.log('dry-run — pass --apply to delete.');
        return;
    }

    // Delete in FK-aware order. Each step uses deleteMany so missing rows
    // don't error. Wrapped in try so unknown models don't abort the run.
    async function safeDelete(label: string, fn: () => Promise<unknown>): Promise<void> {
        try {
            await fn();
            console.log(`  ✅ ${label}`);
        } catch (err) {
            console.error(`  ⚠  ${label}: ${(err as Error).message}`);
        }
    }
    // Delete loose-userId rows first (no FK cascade), then email-keyed
    // rows, then the profile (cascades fire for FK'd children like
    // JobApplication / Conversation), then Supabase auth.
    if (sid) {
        await safeDelete('savedJob', () => prisma.savedJob.deleteMany({ where: { userId: sid } }));
        await safeDelete('pushSubscription', () => prisma.pushSubscription.deleteMany({ where: { userId: sid } }));
        await safeDelete('jobDraft', () => prisma.jobDraft.deleteMany({ where: { userId: sid } }));
        await safeDelete('jdTemplate', () => prisma.jdTemplate.deleteMany({ where: { userId: sid } }));
        await safeDelete('employerJob', () => prisma.employerJob.deleteMany({ where: { userId: sid } }));
    }
    if (pid) {
        await safeDelete('profileView', () => prisma.profileView.deleteMany({ where: { viewerId: pid } }));
        await safeDelete('savedCandidate', () => prisma.savedCandidate.deleteMany({ where: { employerId: pid } }));
    }
    await safeDelete('jobAlert', () => prisma.jobAlert.deleteMany({ where: { email } }));
    await safeDelete('emailLead', () => prisma.emailLead.deleteMany({ where: { email } }));
    await safeDelete('employerLead', () => prisma.employerLead.deleteMany({ where: { contactEmail: email } }));

    // The profile itself
    if (profile) {
        await prisma.userProfile.delete({ where: { id: profile.id } });
        console.log(`  ✅ deleted UserProfile ${profile.id}`);
    }

    // Supabase auth user
    if (supaUser) {
        const { error } = await admin.auth.admin.deleteUser(supaUser.id);
        if (error) {
            console.error(`  ❌ supabase deleteUser: ${error.message}`);
        } else {
            console.log(`  ✅ deleted Supabase auth user ${supaUser.id}`);
        }
    }

    console.log('\ndone.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
