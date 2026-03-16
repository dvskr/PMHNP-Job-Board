require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const email = 'daggulasatish143@gmail.com';

    // Find the user
    const user = await prisma.userProfile.findFirst({ where: { email } });
    if (!user) {
        console.error(`User with email ${email} not found!`);
        process.exit(1);
    }

    console.log(`Found user: ${user.id} (${user.email})`);

    // ── 1. Update all UserProfile fields ──
    await prisma.userProfile.update({
        where: { id: user.id },
        data: {
            firstName: 'Satish',
            lastName: 'Daggula',
            phone: '(512) 555-0147',
            headline: 'Board-Certified PMHNP | 6+ Years in Adult & Geriatric Psych',
            yearsExperience: 6,
            certifications: 'PMHNP-BC, ANCC; BLS, AHA; CPI Non-Violent Crisis Intervention',
            licenseStates: 'TX, CA, NY',
            specialties: 'Adult Psychiatry, Geriatric Psychiatry, Substance Use Disorders, Anxiety & Mood Disorders, PTSD/Trauma, ADHD',
            bio: 'Dedicated Psychiatric Mental Health Nurse Practitioner with 6+ years of clinical experience providing comprehensive psychiatric evaluations, medication management, and evidence-based psychotherapy. Experienced in both inpatient and outpatient settings with a focus on adult and geriatric populations. Proficient in telehealth delivery and collaborative care models.',
            linkedinUrl: 'https://linkedin.com/in/satishdaggula',
            preferredWorkMode: 'Hybrid',
            preferredJobType: 'Full-Time',
            desiredSalaryMin: 140000,
            desiredSalaryMax: 185000,
            desiredSalaryType: 'yearly',
            availableDate: new Date('2025-03-15'),
            openToOffers: true,
            profileVisible: true,
            addressLine1: '4520 Elm Creek Drive',
            addressLine2: 'Apt 302',
            city: 'Austin',
            state: 'TX',
            zipCode: '78749',
            country: 'US',
            workAuthorized: true,
            requiresSponsorship: false,
            veteranStatus: 'Not a Veteran',
            disabilityStatus: 'No',
            raceEthnicity: 'Asian',
            gender: 'Male',
            npiNumber: '1234567890',
            deaNumber: 'FD1234563',
            deaExpirationDate: new Date('2027-06-30'),
            deaScheduleAuthority: 'Schedules II-V',
            stateControlledSubstanceReg: 'TX-CSR-98765',
            stateCSRExpirationDate: new Date('2026-12-31'),
            pmpRegistered: true,
            malpracticeCarrier: 'NSO (Nursing Service Organization)',
            malpracticePolicyNumber: 'NSO-2024-PMH-44521',
            malpracticeCoverage: '$1M/$6M Occurrence',
            malpracticeClaimsHistory: false,
            fullPracticeAuthority: true,
            collaborativeAgreementReq: false,
            prescriptiveAuthorityStatus: 'Full prescriptive authority including controlled substances',
            // NOTE: resumeUrl intentionally NOT set here — it would overwrite the real Supabase signed URL
        },
    });
    console.log('✅ UserProfile updated with all fields');

    // ── 2. Licenses ──
    await prisma.candidateLicense.deleteMany({ where: { userId: user.id } });
    await prisma.candidateLicense.createMany({
        data: [
            { userId: user.id, licenseType: 'APRN', licenseNumber: 'AP-TX-224589', licenseState: 'TX', expirationDate: new Date('2026-09-30'), status: 'active' },
            { userId: user.id, licenseType: 'RN', licenseNumber: 'RN-TX-887234', licenseState: 'TX', expirationDate: new Date('2026-09-30'), status: 'active' },
            { userId: user.id, licenseType: 'APRN', licenseNumber: 'AP-CA-331200', licenseState: 'CA', expirationDate: new Date('2027-03-31'), status: 'active' },
            { userId: user.id, licenseType: 'APRN', licenseNumber: 'AP-NY-556700', licenseState: 'NY', expirationDate: new Date('2026-12-31'), status: 'active' },
        ],
    });
    console.log('✅ 4 Licenses created');

    // ── 3. Certifications ──
    await prisma.candidateCertification.deleteMany({ where: { userId: user.id } });
    await prisma.candidateCertification.createMany({
        data: [
            { userId: user.id, certificationName: 'PMHNP-BC', certifyingBody: 'ANCC', certificationNumber: 'ANCC-PMHNP-2019-44521', expirationDate: new Date('2029-06-30') },
            { userId: user.id, certificationName: 'Basic Life Support (BLS)', certifyingBody: 'American Heart Association', certificationNumber: 'AHA-BLS-2024-78901', expirationDate: new Date('2026-08-15') },
            { userId: user.id, certificationName: 'CPI Non-Violent Crisis Intervention', certifyingBody: 'Crisis Prevention Institute', certificationNumber: 'CPI-2024-33456', expirationDate: new Date('2026-04-30') },
        ],
    });
    console.log('✅ 3 Certifications created');

    // ── 4. Education ──
    await prisma.candidateEducation.deleteMany({ where: { userId: user.id } });
    await prisma.candidateEducation.createMany({
        data: [
            { userId: user.id, degreeType: 'MSN', fieldOfStudy: 'Psychiatric-Mental Health Nurse Practitioner', schoolName: 'University of Texas at Arlington', graduationDate: new Date('2019-05-15'), gpa: '3.92', isHighestDegree: true },
            { userId: user.id, degreeType: 'BSN', fieldOfStudy: 'Nursing', schoolName: 'Texas State University', graduationDate: new Date('2016-05-15'), gpa: '3.78', isHighestDegree: false },
        ],
    });
    console.log('✅ 2 Education records created');

    // ── 5. Work Experience ──
    await prisma.candidateWorkExperience.deleteMany({ where: { userId: user.id } });
    await prisma.candidateWorkExperience.createMany({
        data: [
            {
                userId: user.id, jobTitle: 'Psychiatric Nurse Practitioner', employerName: 'Austin Behavioral Health Center',
                employerCity: 'Austin', employerState: 'TX', startDate: new Date('2022-03-01'), isCurrent: true,
                supervisorName: 'Dr. Rebecca Montoya', supervisorPhone: '(512) 555-0200', supervisorEmail: 'rmontoya@abhc.com', mayContact: true,
                description: 'Outpatient psychiatric evaluations, medication management, and psychotherapy for adults and geriatric patients. Caseload of 80+ patients.',
                patientVolume: '80-100 patients/month', patientPopulations: 'Adults, Geriatric',
                treatmentModalities: 'CBT, DBT, Motivational Interviewing', disordersTreated: 'MDD, Bipolar, Schizophrenia, PTSD, GAD, ADHD, SUD',
                practiceSetting: 'Outpatient Clinic', telehealthExperience: true, telehealthPlatforms: 'Doxy.me, Zoom',
                ehrSystems: 'Epic, Athenahealth', prescribingExp: true, prescribingSchedules: 'II-V',
                assessmentTools: 'PHQ-9, GAD-7, MDQ, AUDIT, CSSRS, MoCA', supervisoryRole: true, supervisoryDetails: 'Supervise 2 nursing students per semester',
            },
            {
                userId: user.id, jobTitle: 'Psychiatric Nurse Practitioner', employerName: 'Cedar Ridge Psychiatric Hospital',
                employerCity: 'Georgetown', employerState: 'TX', startDate: new Date('2019-08-01'), endDate: new Date('2022-02-28'), isCurrent: false,
                supervisorName: 'Dr. James Chen', supervisorPhone: '(512) 555-0300', supervisorEmail: 'jchen@cedarridge.org', mayContact: true,
                reasonForLeaving: 'Transition to outpatient practice',
                description: 'Managed acute psychiatric admissions including evaluations, medication management, crisis stabilization, and discharge planning.',
                patientVolume: '15-20 inpatients daily', patientPopulations: 'Adults',
                treatmentModalities: 'Crisis Intervention, Medication Management', disordersTreated: 'Acute psychosis, Suicidal ideation, MDD, Bipolar mania, SUD detox',
                practiceSetting: 'Inpatient Psychiatric Hospital', telehealthExperience: false,
                ehrSystems: 'Cerner', prescribingExp: true, prescribingSchedules: 'II-V',
                assessmentTools: 'PHQ-9, GAD-7, CSSRS, CIWA, COWS', supervisoryRole: false,
            },
        ],
    });
    console.log('✅ 2 Work Experience records created');

    // ── 6. Screening Answers ──
    await prisma.candidateScreeningAnswer.deleteMany({ where: { userId: user.id } });
    await prisma.candidateScreeningAnswer.createMany({
        data: [
            { userId: user.id, questionKey: 'willing_to_relocate', questionText: 'Are you willing to relocate?', answerType: 'boolean', answerBool: true, category: 'general' },
            { userId: user.id, questionKey: 'authorized_to_work_us', questionText: 'Are you authorized to work in the US?', answerType: 'boolean', answerBool: true, category: 'eligibility' },
            { userId: user.id, questionKey: 'require_visa_sponsorship', questionText: 'Do you require visa sponsorship?', answerType: 'boolean', answerBool: false, category: 'eligibility' },
            { userId: user.id, questionKey: 'years_pmhnp_experience', questionText: 'Years of PMHNP experience?', answerType: 'text', answerText: '6', category: 'experience' },
            { userId: user.id, questionKey: 'willing_to_travel', questionText: 'Are you willing to travel?', answerType: 'boolean', answerBool: true, category: 'general' },
            { userId: user.id, questionKey: 'start_date', questionText: 'Earliest start date?', answerType: 'text', answerText: '2 weeks notice', category: 'general' },
            { userId: user.id, questionKey: 'telehealth_experience', questionText: 'Do you have telehealth experience?', answerType: 'boolean', answerBool: true, category: 'experience' },
            { userId: user.id, questionKey: 'controlled_substance_prescribing', questionText: 'Authorized to prescribe controlled substances?', answerType: 'boolean', answerBool: true, category: 'clinical' },
            { userId: user.id, questionKey: 'malpractice_claims', questionText: 'Any malpractice claims?', answerType: 'boolean', answerBool: false, category: 'background' },
            { userId: user.id, questionKey: 'license_disciplinary_action', questionText: 'Any license disciplinary action?', answerType: 'boolean', answerBool: false, category: 'background' },
        ],
    });
    console.log('✅ 10 Screening Answers created');

    // ── 7. Open-Ended Responses ──
    await prisma.candidateOpenEndedResponse.deleteMany({ where: { userId: user.id } });
    await prisma.candidateOpenEndedResponse.createMany({
        data: [
            { userId: user.id, questionKey: 'why_interested', questionText: 'Why are you interested in this position?', response: 'I am passionate about providing high-quality psychiatric care and am seeking an organization that aligns with my commitment to evidence-based treatment and collaborative patient care. With over 6 years of experience in both inpatient and outpatient psychiatric settings, I bring expertise in medication management, psychotherapy, and telehealth.', isAIGenerated: false },
            { userId: user.id, questionKey: 'clinical_philosophy', questionText: 'Describe your clinical philosophy.', response: 'My clinical philosophy centers on patient-centered, evidence-based psychiatric care. I believe in a holistic approach combining pharmacotherapy with psychotherapeutic interventions tailored to each patient\'s unique needs. I prioritize building therapeutic alliances and utilizing measurement-based care.', isAIGenerated: false },
            { userId: user.id, questionKey: 'greatest_strength', questionText: 'What is your greatest professional strength?', response: 'My ability to build strong therapeutic rapport with diverse patients while maintaining clinical rigor. I combine empathetic communication with evidence-based assessment, resulting in high patient satisfaction and improved treatment adherence.', isAIGenerated: false },
            { userId: user.id, questionKey: 'challenging_case', questionText: 'Describe a challenging patient case.', response: 'I managed a geriatric patient with treatment-resistant depression comorbid with early dementia and chronic pain. I implemented a multi-modal approach including medication adjustment (SSRI to SNRI with augmentation), coordinated pain management with their PCP, and incorporated behavioral activation therapy. Over 12 weeks, the patient showed significant PHQ-9 improvement.', isAIGenerated: false },
        ],
    });
    console.log('✅ 4 Open-Ended Responses created');

    // ── 8. References ──
    await prisma.candidateReference.deleteMany({ where: { userId: user.id } });
    await prisma.candidateReference.createMany({
        data: [
            { userId: user.id, fullName: 'Dr. Rebecca Montoya, MD', title: 'Medical Director', organization: 'Austin Behavioral Health Center', phone: '(512) 555-0200', email: 'rmontoya@abhc.com', relationship: 'Direct Supervisor', yearsKnown: 3 },
            { userId: user.id, fullName: 'Dr. James Chen, MD', title: 'Chief of Psychiatry', organization: 'Cedar Ridge Psychiatric Hospital', phone: '(512) 555-0300', email: 'jchen@cedarridge.org', relationship: 'Former Supervisor', yearsKnown: 5 },
            { userId: user.id, fullName: 'Sarah Kim, LCSW', title: 'Clinical Social Worker', organization: 'Austin Behavioral Health Center', phone: '(512) 555-0250', email: 'skim@abhc.com', relationship: 'Colleague', yearsKnown: 3 },
        ],
    });
    console.log('✅ 3 References created');

    console.log('\n🎉 All sample data populated!');
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
