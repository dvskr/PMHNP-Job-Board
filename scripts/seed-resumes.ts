require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Sample resume PDF content (minimal valid PDF)
function createSamplePDF(name: string): Buffer {
    const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 82 >>
stream
BT
/F1 24 Tf
100 700 Td
(${name} - PMHNP Resume) Tj
/F1 14 Tf
100 660 Td
(Board Certified Psychiatric Mental Health Nurse Practitioner) Tj
/F1 12 Tf
100 620 Td
(Experience: 5+ years in outpatient psychiatric care) Tj
100 600 Td
(License States: NY, NJ, CT) Tj
100 580 Td
(Specialties: Anxiety, Depression, PTSD, ADHD) Tj
100 560 Td
(Education: MSN, Psychiatric Mental Health NP) Tj
100 540 Td
(Certifications: ANCC Board Certified PMHNP-BC) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
800
%%EOF`;
    return Buffer.from(content);
}

async function seedResumes() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get profiles that don't have resumes yet
    const profiles = await prisma.userProfile.findMany({
        where: {
            role: 'job_seeker',
            resumeUrl: null,
        },
        select: {
            id: true,
            supabaseId: true,
            firstName: true,
            lastName: true,
        },
        take: 10,
    });

    if (profiles.length === 0) {
        console.log('No profiles without resumes found. Checking all job_seeker profiles...');
        const allProfiles = await prisma.userProfile.findMany({
            where: { role: 'job_seeker' },
            select: { id: true, supabaseId: true, firstName: true, lastName: true, resumeUrl: true },
            take: 10,
        });
        console.log(`Found ${allProfiles.length} job_seeker profiles:`);
        allProfiles.forEach(p => {
            console.log(`  - ${p.firstName} ${p.lastName} (${p.supabaseId}) | resume: ${p.resumeUrl || 'NONE'}`);
        });
        await prisma.$disconnect();
        return;
    }

    console.log(`Found ${profiles.length} profiles without resumes. Uploading...`);

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === 'resumes')) {
        await supabase.storage.createBucket('resumes', {
            public: false,
            fileSizeLimit: 5 * 1024 * 1024,
        });
        console.log('Created resumes bucket');
    }

    for (const profile of profiles) {
        const name = `${profile.firstName || 'PMHNP'} ${profile.lastName || 'Candidate'}`;
        const pdf = createSamplePDF(name);
        const storagePath = `${profile.supabaseId}/${Date.now()}_resume.pdf`;

        const { error } = await supabase.storage
            .from('resumes')
            .upload(storagePath, pdf, {
                contentType: 'application/pdf',
                upsert: false,
            });

        if (error) {
            console.error(`  ✗ Failed for ${name}: ${error.message}`);
            continue;
        }

        await prisma.userProfile.update({
            where: { id: profile.id },
            data: { resumeUrl: storagePath },
        });

        console.log(`  ✓ ${name} → ${storagePath}`);
    }

    console.log('\nDone!');
}

seedResumes()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
