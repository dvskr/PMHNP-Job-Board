import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
(async () => {
  const { prisma } = await import('@/lib/prisma');
  const r = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS n FROM jobs
    WHERE is_published = true AND (expires_at IS NULL OR expires_at > NOW())
      AND state IS NULL AND state_code IS NOT NULL
  `) as Array<{ n: bigint }>;
  console.log('Active jobs with NULL state but populated stateCode:', String(r[0].n));
  await prisma.$disconnect();
})();
