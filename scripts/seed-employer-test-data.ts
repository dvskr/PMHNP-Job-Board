/**
 * Seed script for employer feature testing.
 *
 * Creates:
 *   1. Test employer Supabase user + UserProfile
 *   2. Test job seeker Supabase user + UserProfile (with full candidate data)
 *   3. 3 additional candidate profiles (existing Supabase IDs not required — profileVisible flag)
 *   4. 3 Job + EmployerJob records (active, expired, featured)
 *   5. EmployerLead records for CRM testing
 *   6. ProfileView records for analytics
 *
 * Usage:  npx tsx scripts/seed-employer-test-data.ts
 *
 * Idempotent: deletes prior test data before re-seeding.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ── DB ──
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Supabase admin ──
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ════════════════════════════════════════════════════════════════════════
// CONSTANTS — adjust emails/passwords as you like
// ════════════════════════════════════════════════════════════════════════
const TEST_EMPLOYER = {
    email: 'test-employer@mindfulhealthsystems.com',
    password: 'TestEmployer123!',
    firstName: 'Jennifer',
    lastName: 'Martinez',
    company: 'Mindful Health Systems',
    phone: '(214) 555-0190',
};

const TEST_SEEKER = {
    email: 'test-seeker@pmhnptest.com',
    password: 'TestSeeker123!',
    firstName: 'Marcus',
    lastName: 'Williams',
};

// Extra candidates (Prisma-only, no Supabase auth)
const EXTRA_CANDIDATES = [
    {
        firstName: 'Aisha', lastName: 'Patel',
        email: 'aisha.patel@pmhnptest.com',
        headline: 'PMHNP-BC | Child & Adolescent Psychiatry',
        yearsExperience: 4,
        certifications: 'PMHNP-BC, ANCC; PALS',
        licenseStates: 'CA, OR, WA',
        specialties: 'Child Psychiatry, Adolescent Psychiatry, ADHD, Autism',
        bio: 'Dedicated to improving mental health outcomes for children and teens through evidence-based medication management and family-centered care.',
        preferredWorkMode: 'Remote',
        preferredJobType: 'Full-Time',
        desiredSalaryMin: 130000,
        desiredSalaryMax: 170000,
        availableDate: new Date('2026-04-01'),
    },
    {
        firstName: 'Robert', lastName: 'Chen',
        email: 'robert.chen@pmhnptest.com',
        headline: 'Experienced PMHNP | Substance Use & Dual Diagnosis',
        yearsExperience: 10,
        certifications: 'PMHNP-BC, ANCC; CARN-AP; BLS',
        licenseStates: 'TX, FL, GA, NC',
        specialties: 'Substance Use Disorders, Dual Diagnosis, MAT, Crisis Intervention',
        bio: '10-year veteran in psychiatric mental health with deep expertise in substance use treatment and MAT programs. Experienced in both inpatient and outpatient settings.',
        preferredWorkMode: 'In-Person',
        preferredJobType: 'Full-Time',
        desiredSalaryMin: 155000,
        desiredSalaryMax: 200000,
        availableDate: new Date('2026-03-15'),
    },
    {
        firstName: 'Sophia', lastName: 'Nguyen',
        email: 'sophia.nguyen@pmhnptest.com',
        headline: 'Telehealth PMHNP | Anxiety & Mood Disorders',
        yearsExperience: 2,
        certifications: 'PMHNP-BC, ANCC',
        licenseStates: 'NY, NJ, CT, PA',
        specialties: 'Anxiety Disorders, Mood Disorders, OCD, Insomnia',
        bio: 'New-ish PMHNP passionate about expanding access to mental health via telehealth. Trained in CBT-informed med management.',
        preferredWorkMode: 'Remote',
        preferredJobType: 'Full-Time',
        desiredSalaryMin: 115000,
        desiredSalaryMax: 145000,
        availableDate: new Date('2026-05-01'),
    },
];

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════
function generateToken() { return crypto.randomBytes(24).toString('hex'); }
function cuid() { return `test_${crypto.randomBytes(12).toString('hex')}`; }

async function getOrCreateSupabaseUser(email: string, password: string, meta: Record<string, string>) {
    // Try to find existing user first
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const existing = users?.find((u: { email?: string }) => u.email === email);
    if (existing) {
        console.log(`  ↳ Supabase user already exists: ${email} (${existing.id})`);
        return existing.id;
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: meta,
    });
    if (error) throw new Error(`Failed to create Supabase user ${email}: ${error.message}`);
    console.log(`  ↳ Created Supabase user: ${email} (${data.user.id})`);
    return data.user.id;
}

// ════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('🧹 Cleaning up prior test data...\n');

    // Clean up test EmployerJobs & Jobs (cascade handles most)
    const testEmails = [
        TEST_EMPLOYER.email,
        TEST_SEEKER.email,
        ...EXTRA_CANDIDATES.map(c => c.email),
    ];
    const existingEmployerJobs = await prisma.employerJob.findMany({
        where: { contactEmail: TEST_EMPLOYER.email },
        select: { jobId: true },
    });
    for (const ej of existingEmployerJobs) {
        await prisma.employerJob.deleteMany({ where: { jobId: ej.jobId } });
        await prisma.job.deleteMany({ where: { id: ej.jobId } });
    }

    // Clean up test profiles (and cascade sub-records)
    for (const email of testEmails) {
        const profile = await prisma.userProfile.findFirst({ where: { email } });
        if (profile) {
            await prisma.candidateLicense.deleteMany({ where: { userId: profile.id } });
            await prisma.candidateCertification.deleteMany({ where: { userId: profile.id } });
            await prisma.candidateEducation.deleteMany({ where: { userId: profile.id } });
            await prisma.candidateWorkExperience.deleteMany({ where: { userId: profile.id } });
            await prisma.candidateScreeningAnswer.deleteMany({ where: { userId: profile.id } });
            await prisma.candidateOpenEndedResponse.deleteMany({ where: { userId: profile.id } });
            await prisma.candidateReference.deleteMany({ where: { userId: profile.id } });
            await prisma.profileView.deleteMany({
                where: { OR: [{ viewerId: profile.supabaseId }, { candidateId: profile.supabaseId }] }
            });
            await prisma.userProfile.delete({ where: { id: profile.id } });
        }
    }

    // Clean up test employer leads
    await prisma.employerLead.deleteMany({
        where: { source: 'test_seed' },
    });

    console.log('✅ Cleanup done\n');

    // ──────────────────────────────────────────────────────────────────
    // 1. EMPLOYER USER
    // ──────────────────────────────────────────────────────────────────
    console.log('👔 Creating test employer...');
    const employerSupabaseId = await getOrCreateSupabaseUser(
        TEST_EMPLOYER.email,
        TEST_EMPLOYER.password,
        { full_name: `${TEST_EMPLOYER.firstName} ${TEST_EMPLOYER.lastName}`, company: TEST_EMPLOYER.company }
    );

    const employerProfile = await prisma.userProfile.create({
        data: {
            supabaseId: employerSupabaseId,
            email: TEST_EMPLOYER.email,
            role: 'employer',
            firstName: TEST_EMPLOYER.firstName,
            lastName: TEST_EMPLOYER.lastName,
            company: TEST_EMPLOYER.company,
            phone: TEST_EMPLOYER.phone,
            headline: 'HR Director — Mindful Health Systems',
            bio: 'Managing recruitment for a growing behavioral health network with 12 clinics across Texas and Oklahoma.',
        },
    });
    console.log(`✅ Employer profile created: ${employerProfile.id}\n`);

    // ──────────────────────────────────────────────────────────────────
    // 2. JOB POSTINGS (3 jobs with different statuses)
    // ──────────────────────────────────────────────────────────────────
    console.log('📋 Creating test job postings...');

    const jobsData = [
        {
            title: 'PMHNP - Outpatient Adult Psychiatry',
            employer: TEST_EMPLOYER.company,
            location: 'Dallas, TX',
            city: 'Dallas', state: 'TX', stateCode: 'TX',
            mode: 'Hybrid',
            jobType: 'Full-Time',
            description: `<h2>About the Role</h2>
<p>Mindful Health Systems is seeking a board-certified PMHNP to join our growing outpatient team in Dallas, TX. You will provide comprehensive psychiatric evaluations, medication management, and brief psychotherapy for adult patients.</p>
<h2>Responsibilities</h2>
<ul>
<li>Conduct psychiatric diagnostic evaluations</li>
<li>Develop and implement treatment plans</li>
<li>Prescribe and manage psychotropic medications</li>
<li>Collaborate with multidisciplinary treatment team</li>
<li>Maintain accurate clinical documentation</li>
</ul>
<h2>Requirements</h2>
<ul>
<li>Active PMHNP-BC certification</li>
<li>Active TX APRN license</li>
<li>DEA registration</li>
<li>2+ years outpatient experience preferred</li>
</ul>`,
            salaryRange: '$140,000 - $170,000/yr',
            minSalary: 140000, maxSalary: 170000, salaryPeriod: 'yearly',
            normalizedMinSalary: 140000, normalizedMaxSalary: 170000,
            displaySalary: '$140,000 – $170,000 per year',
            applyLink: 'https://mindfulhealthsystems.com/careers/pmhnp-dallas',
            isFeatured: false,
            isPublished: true,
            sourceType: 'employer',
            sourceProvider: 'employer_direct',
            qualityScore: 90,
            expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days from now
            paymentStatus: 'paid',
        },
        {
            title: 'PMHNP - Telehealth (Remote, Multi-State)',
            employer: TEST_EMPLOYER.company,
            location: 'Remote',
            city: null, state: null, stateCode: null,
            mode: 'Remote',
            jobType: 'Full-Time',
            isRemote: true,
            description: `<h2>Remote Telehealth PMHNP Position</h2>
<p>Join our expanding telehealth program providing virtual psychiatric services across TX, OK, and AR. Flexible scheduling with full benefits.</p>
<h2>What We Offer</h2>
<ul>
<li>100% remote — work from home</li>
<li>Flexible schedule (4x10 or 5x8)</li>
<li>Full benefits + CME allowance</li>
<li>Company-provided equipment</li>
<li>Multi-state license support</li>
</ul>
<h2>Requirements</h2>
<ul>
<li>PMHNP-BC certification</li>
<li>Licensed in TX (OK and AR preferred)</li>
<li>Telehealth experience preferred</li>
</ul>`,
            salaryRange: '$150,000 - $185,000/yr',
            minSalary: 150000, maxSalary: 185000, salaryPeriod: 'yearly',
            normalizedMinSalary: 150000, normalizedMaxSalary: 185000,
            displaySalary: '$150,000 – $185,000 per year',
            applyLink: 'https://mindfulhealthsystems.com/careers/pmhnp-telehealth',
            isFeatured: true,
            isPublished: true,
            sourceType: 'employer',
            sourceProvider: 'employer_direct',
            qualityScore: 95,
            expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000), // 28 days
            paymentStatus: 'paid',
        },
        {
            title: 'PMHNP - Inpatient (Night Shift)',
            employer: TEST_EMPLOYER.company,
            location: 'Oklahoma City, OK',
            city: 'Oklahoma City', state: 'Oklahoma', stateCode: 'OK',
            mode: 'In-Person',
            jobType: 'Full-Time',
            description: `<h2>Inpatient PMHNP — Night Shift</h2>
<p>Now hiring a PMHNP for our 48-bed acute psychiatric unit. 7p-7a shifts, 3 days/week. Competitive night differential.</p>
<h2>Responsibilities</h2>
<ul>
<li>Manage psychiatric admissions and crisis evaluations</li>
<li>Medication management for acute patients</li>
<li>Coordinate with day team on treatment plans</li>
</ul>`,
            salaryRange: '$160,000 - $195,000/yr',
            minSalary: 160000, maxSalary: 195000, salaryPeriod: 'yearly',
            normalizedMinSalary: 160000, normalizedMaxSalary: 195000,
            displaySalary: '$160,000 – $195,000 per year',
            applyLink: 'https://mindfulhealthsystems.com/careers/pmhnp-okc',
            isFeatured: false,
            isPublished: true,
            sourceType: 'employer',
            sourceProvider: 'employer_direct',
            qualityScore: 85,
            // Expired 3 days ago — for testing renewal flow
            expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            paymentStatus: 'paid',
        },
    ];

    for (const jobData of jobsData) {
        const { paymentStatus, ...jobFields } = jobData;

        const slug = jobFields.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + crypto.randomBytes(3).toString('hex');

        const job = await prisma.job.create({
            data: {
                ...jobFields,
                slug,
            },
        });

        const editToken = generateToken();
        const dashboardToken = cuid();

        await prisma.employerJob.create({
            data: {
                employerName: TEST_EMPLOYER.company,
                contactEmail: TEST_EMPLOYER.email,
                companyWebsite: 'https://mindfulhealthsystems.com',
                companyDescription: 'Mindful Health Systems is a behavioral health network with 12 clinics across TX and OK providing outpatient, inpatient, and telehealth psychiatric services.',
                jobId: job.id,
                editToken,
                dashboardToken,
                paymentStatus,
                userId: employerSupabaseId,
            },
        });

        const status = job.expiresAt && job.expiresAt < new Date() ? '⏰ EXPIRED' : job.isFeatured ? '⭐ FEATURED' : '✅ ACTIVE';
        console.log(`  ${status}: "${job.title}" (slug: ${slug})`);
        console.log(`    editToken: ${editToken}`);
        console.log(`    dashboardToken: ${dashboardToken}`);
    }
    console.log('');

    // ──────────────────────────────────────────────────────────────────
    // 3. JOB SEEKER (full profile for candidate search testing)
    // ──────────────────────────────────────────────────────────────────
    console.log('🩺 Creating test job seeker...');
    const seekerSupabaseId = await getOrCreateSupabaseUser(
        TEST_SEEKER.email,
        TEST_SEEKER.password,
        { full_name: `${TEST_SEEKER.firstName} ${TEST_SEEKER.lastName}` }
    );

    const seekerProfile = await prisma.userProfile.create({
        data: {
            supabaseId: seekerSupabaseId,
            email: TEST_SEEKER.email,
            role: 'job_seeker',
            firstName: TEST_SEEKER.firstName,
            lastName: TEST_SEEKER.lastName,
            phone: '(713) 555-0234',
            headline: 'Board-Certified PMHNP | Crisis & Emergency Psychiatry',
            yearsExperience: 8,
            certifications: 'PMHNP-BC, ANCC; BLS; ACLS; CPI',
            licenseStates: 'TX, LA, AR',
            specialties: 'Crisis Psychiatry, Emergency Psych, Substance Use Disorders, PTSD/Trauma',
            bio: 'Experienced PMHNP with 8 years in emergency and crisis psychiatric settings. Expert in rapid psychiatric evaluations, medication stabilization, and de-escalation. Seeking outpatient or hybrid role to transition to more sustainable practice.',
            linkedinUrl: 'https://linkedin.com/in/marcuswilliams-pmhnp',
            preferredWorkMode: 'Hybrid',
            preferredJobType: 'Full-Time',
            desiredSalaryMin: 150000,
            desiredSalaryMax: 190000,
            desiredSalaryType: 'yearly',
            availableDate: new Date('2026-04-01'),
            openToOffers: true,
            profileVisible: true,
            city: 'Houston',
            state: 'TX',
            zipCode: '77030',
            workAuthorized: true,
            requiresSponsorship: false,
            npiNumber: '9876543210',
        },
    });

    // Add work experience for this seeker
    await prisma.candidateWorkExperience.createMany({
        data: [
            {
                userId: seekerProfile.id, jobTitle: 'Psychiatric Nurse Practitioner - Emergency',
                employerName: 'Houston Methodist Hospital', employerCity: 'Houston', employerState: 'TX',
                startDate: new Date('2021-06-01'), isCurrent: true,
                description: 'Provide emergency psychiatric consultations, crisis evaluations, and medication management in a Level 1 trauma center ED.',
                practiceSetting: 'Emergency Department',
            },
            {
                userId: seekerProfile.id, jobTitle: 'Psychiatric Nurse Practitioner',
                employerName: 'Baton Rouge Behavioral Health', employerCity: 'Baton Rouge', employerState: 'LA',
                startDate: new Date('2018-07-01'), endDate: new Date('2021-05-31'), isCurrent: false,
                description: 'Managed acute inpatient psychiatric unit with 30-bed capacity. Responsible for admissions, daily rounds, and discharge planning.',
                practiceSetting: 'Inpatient Psychiatric Unit',
                reasonForLeaving: 'Relocation to Houston',
            },
        ],
    });

    // Education
    await prisma.candidateEducation.createMany({
        data: [
            { userId: seekerProfile.id, degreeType: 'MSN', fieldOfStudy: 'Psychiatric-Mental Health Nurse Practitioner', schoolName: 'University of Texas Health Science Center at Houston', graduationDate: new Date('2018-05-15'), isHighestDegree: true },
            { userId: seekerProfile.id, degreeType: 'BSN', fieldOfStudy: 'Nursing', schoolName: 'Louisiana State University', graduationDate: new Date('2015-05-15'), isHighestDegree: false },
        ],
    });

    console.log(`✅ Job seeker profile created: ${seekerProfile.id}\n`);

    // ──────────────────────────────────────────────────────────────────
    // 4. ADDITIONAL CANDIDATES (Prisma-only, simulating visible profiles)
    // ──────────────────────────────────────────────────────────────────
    console.log('👥 Creating additional candidate profiles...');
    const candidateSupabaseIds: string[] = [];

    for (const candidate of EXTRA_CANDIDATES) {
        // Create a Supabase user for each candidate too (needed for candidate detail API)
        const candidateSupabaseId = await getOrCreateSupabaseUser(
            candidate.email,
            'TestCandidate123!',
            { full_name: `${candidate.firstName} ${candidate.lastName}` }
        );
        candidateSupabaseIds.push(candidateSupabaseId);

        await prisma.userProfile.create({
            data: {
                supabaseId: candidateSupabaseId,
                email: candidate.email,
                role: 'job_seeker',
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                headline: candidate.headline,
                yearsExperience: candidate.yearsExperience,
                certifications: candidate.certifications,
                licenseStates: candidate.licenseStates,
                specialties: candidate.specialties,
                bio: candidate.bio,
                preferredWorkMode: candidate.preferredWorkMode,
                preferredJobType: candidate.preferredJobType,
                desiredSalaryMin: candidate.desiredSalaryMin,
                desiredSalaryMax: candidate.desiredSalaryMax,
                desiredSalaryType: 'yearly',
                availableDate: candidate.availableDate,
                openToOffers: true,
                profileVisible: true,
            },
        });
        console.log(`  ✅ ${candidate.firstName} ${candidate.lastName} (${candidate.specialties?.split(',')[0]})`);
    }
    console.log('');

    // ──────────────────────────────────────────────────────────────────
    // 5. PROFILE VIEWS (simulate employer viewing candidates)
    // ──────────────────────────────────────────────────────────────────
    console.log('👁️ Creating profile view records...');
    await prisma.profileView.create({
        data: {
            viewerId: employerSupabaseId,
            candidateId: seekerSupabaseId,
        },
    });
    if (candidateSupabaseIds.length > 0) {
        await prisma.profileView.create({
            data: {
                viewerId: employerSupabaseId,
                candidateId: candidateSupabaseIds[0],
            },
        });
    }
    console.log('✅ 2 profile views created\n');

    // ──────────────────────────────────────────────────────────────────
    // 6. EMPLOYER LEADS (for CRM / outreach testing)
    // ──────────────────────────────────────────────────────────────────
    console.log('📇 Creating employer leads...');
    const leadsData = [
        {
            companyName: 'Sunrise Behavioral Health',
            contactName: 'David Kim',
            contactEmail: 'dkim@sunrisebh.com',
            contactTitle: 'Talent Acquisition Manager',
            website: 'https://sunrisebh.com',
            status: 'prospect',
            source: 'test_seed',
            notes: 'Large behavioral health network, 25+ locations in Southeast. High hiring volume.',
        },
        {
            companyName: 'TelePsych Connect',
            contactName: 'Lisa Rodriguez',
            contactEmail: 'lisa@telepsychconnect.com',
            contactTitle: 'CEO',
            website: 'https://telepsychconnect.com',
            status: 'contacted',
            source: 'test_seed',
            lastContactedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            notes: 'Growing telehealth startup. Interested in posting 5+ positions. Follow up scheduled.',
        },
        {
            companyName: 'Veterans Mental Health Center',
            contactName: 'Tom Washington',
            contactEmail: 'twashington@vmhc.org',
            contactTitle: 'Clinical Director',
            website: 'https://vmhc.org',
            status: 'converted',
            source: 'test_seed',
            lastContactedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            jobsPosted: 2,
            notes: 'Posted 2 jobs. Happy with candidate quality. Will post more next quarter.',
        },
        {
            companyName: 'Pacific Northwest Psychiatry',
            contactName: null,
            contactEmail: 'hr@pnwpsychiatry.com',
            contactTitle: null,
            website: 'https://pnwpsychiatry.com',
            status: 'prospect',
            source: 'test_seed',
            notes: 'Found via Indeed scraping — they are actively hiring PMHNPs.',
        },
    ];

    for (const lead of leadsData) {
        await prisma.employerLead.create({ data: lead });
    }
    console.log(`✅ ${leadsData.length} employer leads created\n`);

    // ──────────────────────────────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────────────────────────────
    console.log('═'.repeat(60));
    console.log('🎉 TEST DATA SEED COMPLETE');
    console.log('═'.repeat(60));
    console.log('');
    console.log('👔 EMPLOYER LOGIN:');
    console.log(`   Email:    ${TEST_EMPLOYER.email}`);
    console.log(`   Password: ${TEST_EMPLOYER.password}`);
    console.log(`   Company:  ${TEST_EMPLOYER.company}`);
    console.log('');
    console.log('🩺 JOB SEEKER LOGIN:');
    console.log(`   Email:    ${TEST_SEEKER.email}`);
    console.log(`   Password: ${TEST_SEEKER.password}`);
    console.log('');
    console.log('📋 JOBS POSTED: 3 total');
    console.log('   • PMHNP - Outpatient Adult Psychiatry (Active, Standard)');
    console.log('   • PMHNP - Telehealth (Active, Featured ⭐)');
    console.log('   • PMHNP - Inpatient Night Shift (Expired ⏰ — test renewal)');
    console.log('');
    console.log('👥 CANDIDATES: 4 total (all visible + open to offers)');
    console.log('   • Marcus W. — Crisis/Emergency, 8yr, TX/LA/AR');
    console.log('   • Aisha P. — Child/Adolescent, 4yr, CA/OR/WA');
    console.log('   • Robert C. — Substance Use, 10yr, TX/FL/GA/NC');
    console.log('   • Sophia N. — Anxiety/Mood, 2yr, NY/NJ/CT/PA');
    console.log('');
    console.log('📇 EMPLOYER LEADS: 4 (prospect, contacted, converted, prospect)');
    console.log('');
    console.log('🔗 TEST URLS (after starting dev server):');
    console.log('   • Employer Login:     http://localhost:3000/employer/login');
    console.log('   • Employer Dashboard: http://localhost:3000/employer/dashboard');
    console.log('   • Candidate Search:   http://localhost:3000/employer/candidates');
    console.log('   • Post a Job:         http://localhost:3000/post-job');
    console.log('   • For Employers:      http://localhost:3000/for-employers');
    console.log('   • Admin Outreach:     http://localhost:3000/admin/outreach');
    console.log('');
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
