import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_DATABASE_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_DATABASE_URL;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

(async (): Promise<void> => {
    const ps = await prisma.userProfile.findMany({
        where: { email: { in: ['info@bloompsychiatry.com', 'abe@mindhealthmd.com'] } },
        select: { email: true, role: true, company: true, createdAt: true, updatedAt: true },
    });
    for (const p of ps) {
        console.log(`${p.email.padEnd(30)}  role=${p.role}  company=${p.company ?? '(null)'}  updated=${p.updatedAt.toISOString()}`);
    }
    await prisma.$disconnect();
})();
