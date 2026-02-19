require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function run() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            applyLink: {
                contains: 'greenhouse',
            },
        },
        select: { title: true, employer: true, applyLink: true },
        take: 3,
    });

    console.log('=== Greenhouse Jobs ===');
    jobs.forEach(j => console.log(`${j.title} | ${j.employer}\n  ${j.applyLink}\n`));

    const lever = await prisma.job.findMany({
        where: {
            isPublished: true,
            applyLink: {
                contains: 'lever.co',
            },
        },
        select: { title: true, employer: true, applyLink: true },
        take: 3,
    });

    console.log('=== Lever Jobs ===');
    lever.forEach(j => console.log(`${j.title} | ${j.employer}\n  ${j.applyLink}\n`));

    const workday = await prisma.job.findMany({
        where: {
            isPublished: true,
            applyLink: {
                contains: 'workday',
            },
        },
        select: { title: true, employer: true, applyLink: true },
        take: 3,
    });

    console.log('=== Workday Jobs ===');
    workday.forEach(j => console.log(`${j.title} | ${j.employer}\n  ${j.applyLink}\n`));

    // Also get any direct employer posted jobs
    const direct = await prisma.job.findMany({
        where: {
            isPublished: true,
            sourceType: 'employer_posted',
        },
        select: { title: true, employer: true, applyLink: true },
        take: 3,
    });

    console.log('=== Employer Posted Jobs ===');
    direct.forEach(j => console.log(`${j.title} | ${j.employer}\n  ${j.applyLink}\n`));

    await pool.end();
}

run();
