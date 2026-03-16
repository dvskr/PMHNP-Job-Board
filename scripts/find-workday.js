// Use the app's configured prisma instance
async function main() {
    const { prisma } = require('../lib/prisma');

    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            applyUrl: { contains: 'workday' }
        },
        select: { title: true, employer: true, applyUrl: true },
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(jobs, null, 2));
}

main().catch(e => console.error(e));
