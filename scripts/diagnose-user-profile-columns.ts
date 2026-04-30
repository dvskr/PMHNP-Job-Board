/**
 * Compare user_profiles columns in prod DB vs columns referenced by the
 * saved-candidates API route. Identifies which migrations haven't been
 * applied to prod (cause of P2022 'column does not exist' errors).
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    // Also check employer_jobs since the saved-candidates route includes it
    const empJobCols = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'employer_jobs'
        ORDER BY column_name
    `;
    console.log(`employer_jobs has ${empJobCols.length} columns in prod:`);
    for (const c of empJobCols) console.log(`  ${c.column_name}`);
    console.log();
    const empJobNeeded = ['id', 'job_id', 'pricing_tier'];
    for (const e of empJobNeeded) {
        const has = empJobCols.some((c) => c.column_name === e);
        console.log(`  ${has ? '✓' : '✗ MISSING'}  ${e}  (used by saved-candidates route)`);
    }
    console.log();

    // Also check saved_candidates table itself
    const scCols = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'saved_candidates'
        ORDER BY column_name
    `;
    console.log(`saved_candidates has ${scCols.length} columns in prod:`);
    for (const c of scCols) console.log(`  ${c.column_name}`);
    console.log();
    const scNeeded = ['id', 'employer_id', 'candidate_id', 'employer_job_id', 'note', 'tags', 'saved_at'];
    for (const e of scNeeded) {
        const has = scCols.some((c) => c.column_name === e);
        console.log(`  ${has ? '✓' : '✗ MISSING'}  ${e}`);
    }
    console.log();

    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'user_profiles'
        ORDER BY column_name
    `;
    const got = new Set(cols.map((c) => c.column_name));

    console.log(`user_profiles has ${cols.length} columns in prod.\n`);

    // Columns the saved-candidates GET route references via Prisma select.
    const expected = [
        'id', 'supabase_id', 'first_name', 'last_name', 'avatar_url', 'headline',
        'years_experience', 'specialties', 'preferred_work_mode',
        // Growth+
        'certifications', 'license_states', 'desired_salary_min',
        'desired_salary_max', 'desired_salary_type', 'available_date', 'resume_url',
        // Premium
        'bio', 'preferred_job_type', 'state', 'city',
    ];

    const missing = expected.filter((e) => !got.has(e));
    console.log('Columns expected by /api/employer/saved-candidates:');
    for (const c of expected) {
        console.log(`  ${got.has(c) ? '✓' : '✗ MISSING'}  ${c}`);
    }
    console.log();
    if (missing.length > 0) {
        console.log(`MISSING ${missing.length} columns — this is the source of the P2022 errors.`);
    } else {
        console.log('All expected columns exist. The error must be elsewhere (relation, embedded model, etc.).');
    }

    // Also list any DB columns that ARE present but NOT in our expected list
    // (helps spot legacy columns).
    const extra = cols.map((c) => c.column_name).filter((c) => !expected.includes(c));
    if (extra.length > 0) {
        console.log(`\nUnreferenced columns in prod (not used by this route, just FYI):`);
        for (const c of extra.slice(0, 30)) console.log(`  ${c}`);
        if (extra.length > 30) console.log(`  ... and ${extra.length - 30} more`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Diagnose failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
