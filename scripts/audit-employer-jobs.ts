
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

// Use DIRECT_URL for direct database access
const connectionString = process.env.DIRECT_URL;

if (!connectionString) {
    throw new Error('DIRECT_URL environment variable is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function auditEmployerJobs() {
    console.log('🔍 PMHNP Job Board - Employer Jobs Audit\n');
    console.log('='.repeat(60));

    // Fetch all employer jobs with related job data
    const employerJobs = await prisma.employerJob.findMany({
        include: {
            job: true
        }
    });

    // Fetch all user profiles for linking check
    const userProfiles = await prisma.userProfile.findMany();
    const employerProfiles = userProfiles.filter(u => u.role === 'employer');

    // Map of email -> UserProfile
    const emailToProfile = new Map(userProfiles.map(u => [u.email.toLowerCase(), u]));

    // 1. EMPLOYER JOBS OVERVIEW
    console.log('\n1. EMPLOYER JOBS OVERVIEW');
    console.log('-'.repeat(30));

    const total = employerJobs.length;

    // Since userId doesn't exist on EmployerJob/Job, we check if they map to a profile
    const linkedToUser = employerJobs.filter(ej => emailToProfile.has(ej.contactEmail.toLowerCase())).length;
    const unlinked = total - linkedToUser;

    const now = new Date();
    let active = 0;
    let expired = 0;
    let unpublished = 0;

    employerJobs.forEach(ej => {
        const job = ej.job;
        if (!job.isPublished) {
            unpublished++;
        } else if (job.expiresAt && job.expiresAt < now) {
            expired++;
        } else {
            active++;
        }
    });

    console.log(`Total employer_jobs records: ${total}`);
    console.log(`Linked to User Profile (via email): ${linkedToUser}`);
    console.log(`No User Profile (Guest/Unlinked): ${unlinked}`);
    console.log(`\nStatus Breakdown:`);
    console.log(`  Active: ${active}`);
    console.log(`  Expired: ${expired}`);
    console.log(`  Unpublished: ${unpublished}`);

    // 2. DUPLICATE DETECTION
    console.log('\n2. DUPLICATE DETECTION');
    console.log('-'.repeat(30));

    // Group by contactEmail
    const jobsByEmail = new Map<string, typeof employerJobs>();
    employerJobs.forEach(ej => {
        const email = ej.contactEmail.toLowerCase();
        if (!jobsByEmail.has(email)) {
            jobsByEmail.set(email, []);
        }
        jobsByEmail.get(email)?.push(ej);
    });

    let totalDefiniteDuplicates = 0;
    let totalPossibleDuplicates = 0;

    for (const [email, jobs] of jobsByEmail.entries()) {
        // Only verify if multiple active jobs exist
        const activeJobs = jobs.filter(ej => ej.job.isPublished && (!ej.job.expiresAt || ej.job.expiresAt > now));

        if (activeJobs.length > 1) {
            // Check titles
            const titleGroups = new Map<string, typeof employerJobs>();

            activeJobs.forEach(ej => {
                const titleKey = ej.job.title.toLowerCase().trim();
                if (!titleGroups.has(titleKey)) {
                    titleGroups.set(titleKey, []);
                }
                titleGroups.get(titleKey)?.push(ej);
            });

            for (const [title, matches] of titleGroups.entries()) {
                if (matches.length > 1) {
                    // Check locations within title dupes
                    const locationGroups = new Map<string, typeof employerJobs>();
                    let hasExactDupes = false;

                    matches.forEach(m => {
                        const loc = m.job.location.toLowerCase().trim();
                        if (!locationGroups.has(loc)) {
                            locationGroups.set(loc, []);
                        }
                        locationGroups.get(loc)?.push(m);
                    });

                    // Check for exact dupes (Title + Location)
                    const exactDupes: typeof employerJobs = [];
                    for (const locMatches of locationGroups.values()) {
                        if (locMatches.length > 1) {
                            hasExactDupes = true;
                            exactDupes.push(...locMatches);
                            totalDefiniteDuplicates += (locMatches.length - 1); // simple count
                        }
                    }

                    // Check for possible dupes (Same title, different location)
                    // Just flag the group if it's not all exact dupes? 
                    // Definition: "Flag same title but different location as 'possible duplicates'"
                    // If we have 3 jobs with same title, 2 in NY, 1 in CA.
                    // The 2 in NY are exact dupes. 
                    // The CA one vs the NY ones are "possible"? Or just distinct jobs?
                    // I'll stick to: Same Title = Possible Duplicate context.

                    const maskedEmail = email.replace(/(^..)(.*)(@.*)/, '$1***$3');

                    if (hasExactDupes) {
                        console.log(`\n📧 ${maskedEmail} has ${activeJobs.length} active jobs`);
                        console.log(`  DEFINITE DUPLICATE: "${title}" (Exact title + location)`);
                        exactDupes.forEach(d => {
                            console.log(`    - ID: ${d.jobId} | Loc: ${d.job.location} | Created: ${d.createdAt.toISOString().split('T')[0]}`);
                        });
                    }

                    if (matches.length > 1 && !hasExactDupes) {
                        console.log(`\n📧 ${maskedEmail} has ${activeJobs.length} active jobs`);
                        console.log(`  POSSIBLE DUPLICATE: "${title}" (Same title, different locations)`);
                        matches.forEach(d => {
                            console.log(`    - ID: ${d.jobId} | Loc: ${d.job.location} | Created: ${d.createdAt.toISOString().split('T')[0]}`);
                        });
                        totalPossibleDuplicates++;
                    }
                }
            }
        }
    }

    // 3. AUTH CONNECTION AUDIT
    console.log('\n3. AUTH CONNECTION AUDIT');
    console.log('-'.repeat(30));

    // Jobs with matching employer user
    const matchingEmployerUser = employerJobs.filter(ej => {
        const profile = emailToProfile.get(ej.contactEmail.toLowerCase());
        return profile && profile.role === 'employer';
    }).length;

    const noMatchingUser = employerJobs.filter(ej => {
        return !emailToProfile.has(ej.contactEmail.toLowerCase());
    }).length;

    // Employer profiles with ZERO jobs
    // Check against all jobs (including expired/unpublished)? Assuming yes.
    const profilesWithJobs = new Set(employerJobs.map(ej => ej.contactEmail.toLowerCase()));
    const orphanedProfiles = employerProfiles.filter(p => !profilesWithJobs.has(p.email.toLowerCase()));

    console.log(`Jobs matching 'employer' role user: ${matchingEmployerUser}`);
    console.log(`Jobs with NO user profile: ${noMatchingUser}`);

    if (orphanedProfiles.length > 0) {
        console.log(`\nEmployer Profiles with 0 jobs (${orphanedProfiles.length}):`);
        orphanedProfiles.forEach(p => {
            const maskedEmail = p.email.replace(/(^..)(.*)(@.*)/, '$1***$3');
            console.log(`  - ${maskedEmail} (ID: ${p.supabaseId})`);
        });
    } else {
        console.log(`\nAll employer profiles have at least one job.`);
    }

    // 4. TOKEN HEALTH
    console.log('\n4. TOKEN HEALTH');
    console.log('-'.repeat(30));

    const nullEditTokens = employerJobs.filter(ej => !ej.editToken).length;
    const nullDashTokens = employerJobs.filter(ej => !ej.dashboardToken).length;

    console.log(`Jobs with null/empty editToken: ${nullEditTokens}`);
    console.log(`Jobs with null/empty dashboardToken: ${nullDashTokens}`);

    // Check duplicate tokens
    const editTokens = employerJobs.map(ej => ej.editToken).filter(Boolean);
    const dashTokens = employerJobs.map(ej => ej.dashboardToken).filter(Boolean);

    const uniqueEdit = new Set(editTokens);
    const uniqueDash = new Set(dashTokens);

    const dupEditCount = editTokens.length - uniqueEdit.size;
    const dupDashCount = dashTokens.length - uniqueDash.size;

    if (dupEditCount > 0) console.log(`⚠️ DUPLICATE EDIT TOKENS FOUND: ${dupEditCount}`);
    if (dupDashCount > 0) console.log(`⚠️ DUPLICATE DASHBOARD TOKENS FOUND: ${dupDashCount}`);

    // 5. SUMMARY
    console.log('\n5. SUMMARY & ACTIONS');
    console.log('='.repeat(60));

    console.log(`Total Employer Jobs: ${total}`);
    console.log(`Total Duplicates to Review: ${totalDefiniteDuplicates} definite, ${totalPossibleDuplicates} possible`);
    console.log(`Total "Guest" Jobs (No User Profile): ${unlinked}`);
    console.log(`Total Orphaned Employer Accounts: ${orphanedProfiles.length}`);

    console.log('\n');

    await prisma.$disconnect();
    await pool.end();
}

auditEmployerJobs().catch(console.error);
