#!/usr/bin/env node
// Load env BEFORE any import that touches process.env.
// eslint-disable-next-line import/order
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig();

/**
 * Local-dev seeder — gives the two Sathish job_seeker test accounts richly
 * populated PMHNP profiles so the candidate dashboard, AI search, AI recs,
 * and resume parser flows all have realistic data to render against.
 *
 * Two distinct personas so the AI recs can be visually compared:
 *   Account A  →  Mid-career Adult Telehealth PMHNP, west coast multi-state
 *   Account B  →  Senior Child & Adolescent specialist, east coast
 *
 * Idempotent: deletes all related rows for each account first, then re-inserts.
 * Safe to re-run; leaves all OTHER candidate profiles untouched.
 */

import { prisma } from '@/lib/prisma';

interface SeedPersona {
    label: string;
    supabaseId: string;
    profile: {
        firstName: string;
        lastName: string;
        headline: string;
        yearsExperience: number;
        certifications: string;
        licenseStates: string;
        specialties: string;
        skills: string[];
        bio: string;
        preferredWorkMode: string;
        preferredJobType: string;
        desiredSalaryMin?: number;
        desiredSalaryMax?: number;
        desiredSalaryType?: string;
    };
    education: Array<{ degreeType: string; fieldOfStudy: string; schoolName: string; graduationYear: number; isHighest: boolean }>;
    workExperience: Array<{ jobTitle: string; employerName: string; city?: string; state?: string; startYear: number; endYear?: number; isCurrent?: boolean; description: string; setting: string }>;
    licenseRows: Array<{ licenseType: string; licenseNumber: string; licenseState: string }>;
    certificationRows: Array<{ name: string; body: string; number?: string }>;
}

const PERSONAS: SeedPersona[] = [
    {
        label: 'Account A — Adult Telehealth (west coast)',
        supabaseId: '4eded3a0-aa24-465c-8f47-0ef674237fc8',
        profile: {
            firstName: 'Sathish',
            lastName: 'Kumar',
            headline: 'Board-Certified PMHNP-BC | 7 Years Adult Telehealth',
            yearsExperience: 7,
            certifications: 'PMHNP-BC, ANCC, Buprenorphine X-waiver',
            licenseStates: 'CA, OR, WA, NV',
            specialties: 'Adult Psychiatry, Mood Disorders, Anxiety, Substance Use, Telehealth',
            skills: ['Telepsychiatry', 'Psychopharmacology', 'Medication-Assisted Treatment', 'CBT', 'DBT', 'Motivational Interviewing', 'Trauma-Informed Care'],
            bio: 'Board-certified Psychiatric Mental Health Nurse Practitioner with 7 years of clinical experience focused on adult outpatient psychiatry via telehealth. Special interest in mood disorders, anxiety, and co-occurring substance use. Comfortable managing complex pharmacotherapy and integrating brief evidence-based therapy.',
            preferredWorkMode: 'Remote',
            preferredJobType: 'Full-Time',
            desiredSalaryMin: 165_000,
            desiredSalaryMax: 200_000,
            desiredSalaryType: 'annual',
        },
        education: [
            { degreeType: 'DNP', fieldOfStudy: 'Psychiatric Mental Health', schoolName: 'University of California, San Francisco', graduationYear: 2019, isHighest: true },
            { degreeType: 'BSN', fieldOfStudy: 'Nursing', schoolName: 'University of Washington',                  graduationYear: 2015, isHighest: false },
        ],
        workExperience: [
            { jobTitle: 'Telehealth PMHNP',     employerName: 'SteadyMD',           city: 'Remote',       state: 'CA', startYear: 2022, isCurrent: true,  description: 'Provide outpatient psychiatric care to adults across CA, OR, WA, and NV via telehealth. Manage complex medication regimens for mood, anxiety, and substance use disorders.', setting: 'Telehealth' },
            { jobTitle: 'Outpatient PMHNP',     employerName: 'Kaiser Permanente',  city: 'Oakland',      state: 'CA', startYear: 2019, endYear: 2022, description: 'Outpatient psychiatry rotation across primary care integrated and behavioral health clinics. Average panel of 600 patients.', setting: 'Outpatient' },
            { jobTitle: 'Psychiatric RN',       employerName: 'UCSF Medical Center',city: 'San Francisco',state: 'CA', startYear: 2015, endYear: 2019, description: 'Inpatient adult psychiatric unit. Crisis stabilization, medication administration, suicide risk assessment.', setting: 'Inpatient' },
        ],
        licenseRows: [
            { licenseType: 'APRN', licenseNumber: 'CA-APRN-A1', licenseState: 'CA' },
            { licenseType: 'APRN', licenseNumber: 'OR-APRN-A1', licenseState: 'OR' },
            { licenseType: 'APRN', licenseNumber: 'WA-APRN-A1', licenseState: 'WA' },
            { licenseType: 'APRN', licenseNumber: 'NV-APRN-A1', licenseState: 'NV' },
        ],
        certificationRows: [
            { name: 'Psychiatric Mental Health Nurse Practitioner — Board Certified (PMHNP-BC)', body: 'ANCC', number: 'PMHNP-A1' },
            { name: 'DEA-X (Buprenorphine waiver)', body: 'DEA' },
            { name: 'Basic Life Support (BLS)', body: 'American Heart Association' },
        ],
    },
    {
        label: 'Account B — Child & Adolescent specialist (east coast)',
        supabaseId: '16f16feb-1ab9-44fb-adf5-cce0759511b4',
        profile: {
            firstName: 'Sathish',
            lastName: 'Kumar',
            headline: 'PMHNP-BC | 12 Years Child & Adolescent Psychiatry',
            yearsExperience: 12,
            certifications: 'PMHNP-BC, ANCC, Pediatric Mental Health Specialist (PMHS)',
            licenseStates: 'NY, NJ, MA, CT',
            specialties: 'Child & Adolescent Psychiatry, ADHD, Anxiety, Depression, Eating Disorders, Family-Based Treatment',
            skills: ['Pediatric Psychopharmacology', 'ADHD Assessment', 'Family-Based Therapy', 'CBT for Youth', 'Play Therapy', 'Crisis Intervention', 'Parent Coaching'],
            bio: 'Senior PMHNP with 12 years of focused practice in child and adolescent psychiatric care. Mixed inpatient + outpatient experience across academic medical centers in the Northeast. Passionate about evidence-based pediatric psychopharmacology and integrating families into the treatment plan.',
            preferredWorkMode: 'Hybrid',
            preferredJobType: 'Full-Time',
            desiredSalaryMin: 195_000,
            desiredSalaryMax: 245_000,
            desiredSalaryType: 'annual',
        },
        education: [
            { degreeType: 'DNP', fieldOfStudy: 'Child & Adolescent Psychiatric Mental Health', schoolName: 'Yale University',         graduationYear: 2014, isHighest: true },
            { degreeType: 'MSN', fieldOfStudy: 'Psychiatric Mental Health',                    schoolName: 'Columbia University',     graduationYear: 2012, isHighest: false },
            { degreeType: 'BSN', fieldOfStudy: 'Nursing',                                      schoolName: 'Boston College',          graduationYear: 2010, isHighest: false },
        ],
        workExperience: [
            { jobTitle: 'Lead Child & Adolescent PMHNP',         employerName: 'Mount Sinai Adolescent Health Center', city: 'New York', state: 'NY', startYear: 2020, isCurrent: true,  description: 'Lead clinician for the adolescent psychiatry outpatient program. Oversee a team of 4 PMHNPs and supervise APRN students. Specialize in mood, anxiety, and eating disorders.', setting: 'Outpatient' },
            { jobTitle: 'Inpatient Child & Adolescent PMHNP',    employerName: 'NewYork-Presbyterian',                  city: 'New York', state: 'NY', startYear: 2017, endYear: 2020, description: 'Acute inpatient pediatric psychiatry — crisis stabilization, medication management, family meetings, and discharge planning.', setting: 'Inpatient' },
            { jobTitle: 'Adolescent PMHNP',                      employerName: 'McLean Hospital',                       city: 'Belmont',  state: 'MA', startYear: 2014, endYear: 2017, description: 'Adolescent residential program for mood and anxiety disorders. Group and family work alongside medication management.', setting: 'Residential' },
            { jobTitle: 'Pediatric Psychiatric RN',              employerName: 'Boston Children\'s Hospital',           city: 'Boston',   state: 'MA', startYear: 2010, endYear: 2014, description: 'Acute inpatient pediatric psychiatry unit. Crisis assessment, medication administration, milieu management.', setting: 'Inpatient' },
        ],
        licenseRows: [
            { licenseType: 'APRN', licenseNumber: 'NY-APRN-B1', licenseState: 'NY' },
            { licenseType: 'APRN', licenseNumber: 'NJ-APRN-B1', licenseState: 'NJ' },
            { licenseType: 'APRN', licenseNumber: 'MA-APRN-B1', licenseState: 'MA' },
            { licenseType: 'APRN', licenseNumber: 'CT-APRN-B1', licenseState: 'CT' },
        ],
        certificationRows: [
            { name: 'Psychiatric Mental Health Nurse Practitioner — Board Certified (PMHNP-BC)', body: 'ANCC', number: 'PMHNP-B1' },
            { name: 'Pediatric Mental Health Specialist (PMHS)',                                  body: 'PNCB', number: 'PMHS-B1' },
            { name: 'Basic Life Support (BLS)',                                                   body: 'American Heart Association' },
            { name: 'Pediatric Advanced Life Support (PALS)',                                     body: 'American Heart Association' },
        ],
    },
];

async function seedPersona(persona: SeedPersona): Promise<void> {
    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: persona.supabaseId },
        select: { id: true },
    });
    if (!profile) {
        console.log(`[seed] ${persona.label} — supabase_id not found, skipping`);
        return;
    }
    const userId = profile.id;
    const p = persona.profile;

    // 1. Update direct fields on user_profiles.
    await prisma.userProfile.update({
        where: { id: userId },
        data: {
            firstName: p.firstName,
            lastName: p.lastName,
            headline: p.headline,
            yearsExperience: p.yearsExperience,
            certifications: p.certifications,
            licenseStates: p.licenseStates,
            specialties: p.specialties,
            skills: p.skills,
            bio: p.bio,
            preferredWorkMode: p.preferredWorkMode,
            preferredJobType: p.preferredJobType,
            desiredSalaryMin: p.desiredSalaryMin ?? null,
            desiredSalaryMax: p.desiredSalaryMax ?? null,
            desiredSalaryType: p.desiredSalaryType ?? null,
            openToOffers: true,
            profileVisible: true,
        },
    });

    // 2. Wipe + re-insert related rows so the seeder is idempotent.
    await prisma.candidateEducation.deleteMany({ where: { userId } });
    await prisma.candidateWorkExperience.deleteMany({ where: { userId } });
    await prisma.candidateCertification.deleteMany({ where: { userId } });
    await prisma.candidateLicense.deleteMany({ where: { userId } });

    await prisma.candidateEducation.createMany({
        data: persona.education.map((e) => ({
            userId,
            degreeType: e.degreeType,
            fieldOfStudy: e.fieldOfStudy,
            schoolName: e.schoolName,
            graduationDate: new Date(`${e.graduationYear}-05-01`),
            isHighestDegree: e.isHighest,
        })),
    });

    await prisma.candidateWorkExperience.createMany({
        data: persona.workExperience.map((w) => ({
            userId,
            jobTitle: w.jobTitle,
            employerName: w.employerName,
            employerCity: w.city ?? null,
            employerState: w.state ?? null,
            startDate: new Date(`${w.startYear}-01-01`),
            endDate: w.endYear ? new Date(`${w.endYear}-12-31`) : null,
            isCurrent: !!w.isCurrent,
            description: w.description,
            practiceSetting: w.setting,
        })),
    });

    await prisma.candidateCertification.createMany({
        data: persona.certificationRows.map((c) => ({
            userId,
            certificationName: c.name,
            certifyingBody: c.body,
            certificationNumber: c.number ?? null,
        })),
    });

    await prisma.candidateLicense.createMany({
        data: persona.licenseRows.map((l) => ({
            userId,
            licenseType: l.licenseType,
            licenseNumber: l.licenseNumber,
            licenseState: l.licenseState,
            status: 'active',
        })),
    });

    console.log(`[seed] ${persona.label} — profile + ${persona.education.length} education + ${persona.workExperience.length} jobs + ${persona.certificationRows.length} certs + ${persona.licenseRows.length} licenses`);
}

async function main(): Promise<void> {
    for (const persona of PERSONAS) {
        await seedPersona(persona);
    }
    console.log('[seed] DONE — re-run `npm run backfill:embeddings -- --candidates` and `npm run recs:run` to refresh AI recs for these accounts.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('[seed] fatal', err); process.exit(1); });
