const { PrismaClient } = require('@prisma/client');

async function check() {
    const p = new PrismaClient();

    const jobs = await p.job.findMany({
        where: {
            OR: [
                { employer: { contains: 'Frederick Mental' } },
                { employer: { contains: 'New York Psychotherapy' } }
            ],
            isPublished: true
        },
        select: {
            id: true,
            title: true,
            employer: true,
            sourceType: true,
            minSalary: true,
            maxSalary: true,
            salaryPeriod: true,
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
            displaySalary: true,
            description: true
        }
    });

    console.log(JSON.stringify(jobs, null, 2));
    await p.$disconnect();
}

check();
