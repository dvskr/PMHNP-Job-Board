/**
 * Repair employer signups that were stranded as job_seeker profiles.
 *
 * Root cause (fixed in app/api/auth/profile/route.ts:2026-05-26): the GET
 * endpoint's auto-create branch used to hardcode role='job_seeker'. When
 * email confirmation was required (Supabase default), the POST call from
 * the signup form ran without a session and returned 401, so the role
 * intent from the form was never persisted to the DB. On first login
 * after email confirm, GET auto-created with the hardcoded role.
 *
 * This script reads each affected UserProfile's Supabase user_metadata and
 * promotes them to 'employer' when the original signup metadata indicates
 * employer intent. Also creates the missing EmployerLead row.
 *
 *   npx tsx scripts/fix-stranded-employer-signups.ts                # dry-run
 *   npx tsx scripts/fix-stranded-employer-signups.ts --apply        # commit
 *   npx tsx scripts/fix-stranded-employer-signups.ts --email=<e>    # one row
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

    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supaUrl || !supaKey) {
        console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY');
        process.exit(1);
    }
    const admin = createClient(supaUrl, supaKey);

    // Candidates: job_seeker profiles created recently. Without a date filter
    // we'd scan every seeker in the DB; the bug surfaced in the past ~6 weeks
    // so we limit to that window. Adjust if you find older complaints.
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const candidates = await prisma.userProfile.findMany({
        where: {
            role: 'job_seeker',
            createdAt: { gte: since },
            ...(emailArg ? { email: emailArg } : {}),
        },
        select: { id: true, supabaseId: true, email: true, firstName: true, lastName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });
    console.log(`scanned ${candidates.length} recent job_seeker profiles (>=${since.toISOString().slice(0, 10)})\n`);

    interface Stranded {
        profileId: string;
        supabaseId: string;
        email: string;
        metadataRole?: string;
        metadataCompany?: string;
    }
    const stranded: Stranded[] = [];

    // Supabase's listUsers is paginated. Walk it once and build a metadata
    // lookup so we don't issue N round-trips.
    let page = 1;
    const perPage = 1000;
    const metaBySupabaseId = new Map<string, { role?: string; company?: string }>();
    while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) {
            console.error('listUsers error', error.message);
            break;
        }
        for (const u of data.users) {
            const m = u.user_metadata as { role?: string; company?: string } | null;
            metaBySupabaseId.set(u.id, { role: m?.role, company: m?.company });
        }
        if (data.users.length < perPage) break;
        page += 1;
        if (page > 50) break; // safety
    }
    console.log(`loaded user_metadata for ${metaBySupabaseId.size} Supabase users\n`);

    for (const c of candidates) {
        const meta = metaBySupabaseId.get(c.supabaseId);
        if (meta?.role === 'employer') {
            stranded.push({
                profileId: c.id,
                supabaseId: c.supabaseId,
                email: c.email,
                metadataRole: meta.role,
                metadataCompany: meta.company,
            });
        }
    }

    console.log(`found ${stranded.length} stranded employer signup(s):`);
    for (const s of stranded) {
        console.log(`  ${s.email.padEnd(45)}  company="${s.metadataCompany ?? ''}"`);
    }

    if (!apply) {
        console.log(`\ndry-run — pass --apply to fix`);
        return;
    }

    let written = 0;
    let failed = 0;
    for (const s of stranded) {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.userProfile.update({
                    where: { id: s.profileId },
                    data: {
                        role: 'employer',
                        company: s.metadataCompany ?? undefined,
                    },
                });
                // Backfill EmployerLead if not present
                const existing = await tx.employerLead.findFirst({
                    where: { contactEmail: s.email },
                });
                if (!existing) {
                    await tx.employerLead.create({
                        data: {
                            companyName: s.metadataCompany || s.email.split('@')[0] || 'Unknown',
                            contactEmail: s.email,
                            source: 'employer_signup_backfill',
                            status: 'prospect',
                        },
                    });
                }
            });
            written += 1;
            console.log(`  ✅  promoted ${s.email}`);
        } catch (err) {
            failed += 1;
            console.error(`  ❌  ${s.email}: ${(err as Error).message}`);
        }
    }
    console.log(`\ndone. written=${written} failed=${failed}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
