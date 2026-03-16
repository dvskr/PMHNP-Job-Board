import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    // Find the user profile
    const profile = await prisma.userProfile.findFirst({
        where: { firstName: 'Satish' },
        select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!profile) {
        console.error('Profile not found!');
        return;
    }
    console.log('Found profile:', profile);

    // Check existing education
    const existing = await prisma.candidateEducation.findMany({
        where: { userId: profile.id },
    });
    console.log('Existing education records:', existing.length);

    if (existing.length === 0) {
        console.log('No education records found. Inserting placeholder...');

        // Insert education record — UPDATE THESE VALUES if they are wrong
        const edu = await prisma.candidateEducation.create({
            data: {
                userId: profile.id,
                degreeType: 'Master of Science in Nursing (MSN)',
                fieldOfStudy: 'Psychiatric-Mental Health Nurse Practitioner',
                schoolName: 'University of Texas at Austin',
                graduationDate: new Date('2019-05-15'),
                isHighestDegree: true,
            },
        });
        console.log('✅ Created education record:', edu);
    } else {
        console.log('Education records already exist:', existing);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
