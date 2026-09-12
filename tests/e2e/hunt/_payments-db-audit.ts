// READ-ONLY audit of payment/quota state in the DEV database.
// Run: npx tsx tests/e2e/hunt/_payments-db-audit.ts
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

const REPO = path.resolve(__dirname, '../../..');
dotenvConfig({ path: path.join(REPO, '.env.local') });
dotenvConfig({ path: path.join(REPO, '.env') });

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.replace(/^[^@]*@/, '').split('/')[0];
  console.log('DB host:', host);
  if (!/zdmpmncrcpgpmwdqvekg/.test(url)) {
    console.log('REFUSING: DATABASE_URL is not the dev project');
    process.exit(2);
  }
  const { prisma } = await import('../../../lib/prisma');

  const byStatus = await prisma.employerJob.groupBy({ by: ['paymentStatus'], _count: { _all: true } });
  console.log('employerJob by paymentStatus:', JSON.stringify(byStatus));

  const paidRows = await prisma.employerJob.findMany({
    where: { paymentStatus: 'paid' },
    select: { id: true, jobId: true, createdAt: true, job: { select: { jobType: true, jobTypes: true, eligibleStateCodes: true, isRemote: true, isHybrid: true, expiresAt: true, isFeatured: true, isPublished: true, lastRenewedAt: true, createdAt: true } } },
  });
  console.log('paid rows:', paidRows.length);
  for (const r of paidRows) {
    console.log('  paid', r.jobId, 'jobType=', r.job.jobType, 'jobTypes=', JSON.stringify(r.job.jobTypes), 'eligible=', JSON.stringify(r.job.eligibleStateCodes), 'remote=', r.job.isRemote, 'exp=', r.job.expiresAt?.toISOString(), 'created=', r.job.createdAt.toISOString(), 'renewed=', r.job.lastRenewedAt?.toISOString());
  }
  const freeRows = await prisma.employerJob.findMany({
    where: { paymentStatus: 'free' },
    select: { id: true, jobId: true, quotaKeys: true, quotaDomain: true, userId: true, job: { select: { jobType: true, jobTypes: true, eligibleStateCodes: true, expiresAt: true, isFeatured: true, isPublished: true, createdAt: true } } },
  });
  console.log('free rows:', freeRows.length);
  for (const r of freeRows) {
    console.log('  free', r.jobId, 'jobType=', r.job.jobType, 'jobTypes=', JSON.stringify(r.job.jobTypes), 'keys=', JSON.stringify(r.quotaKeys), 'dom=', r.quotaDomain, 'user=', r.userId, 'exp=', r.job.expiresAt?.toISOString(), 'featured=', r.job.isFeatured, 'pub=', r.job.isPublished);
  }

  const pendingRows = await prisma.employerJob.findMany({
    where: { paymentStatus: 'pending' },
    select: { id: true, jobId: true, createdAt: true, userId: true, job: { select: { isPublished: true, isFeatured: true, expiresAt: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  console.log('pending rows (latest 20):', pendingRows.length);
  for (const r of pendingRows) {
    console.log('  pending', r.jobId, 'created=', r.createdAt.toISOString(), 'pub=', r.job.isPublished, 'exp=', r.job.expiresAt?.toISOString());
  }

  const renewed = await prisma.job.findMany({
    where: { sourceType: 'employer', lastRenewedAt: { not: null } },
    select: { id: true, createdAt: true, expiresAt: true, lastRenewedAt: true },
  });
  console.log('renewed jobs:', renewed.length);
  for (const j of renewed) {
    console.log('  renewed', j.id, 'created=', j.createdAt.toISOString(), 'exp=', j.expiresAt?.toISOString(), 'renewedAt=', j.lastRenewedAt?.toISOString(), 'renewedPastExpiry=', j.lastRenewedAt && j.expiresAt ? j.lastRenewedAt > j.expiresAt : null);
  }

  const charges = await prisma.jobCharge.findMany({ select: { id: true, employerJobId: true, type: true, amountCents: true, stripePaymentIntentId: true, stripeInvoiceId: true, invoicePdfUrl: true, refundedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 });
  console.log('charges (latest 20):', charges.length);
  for (const c of charges) console.log('  charge', c.id, c.type, c.amountCents, 'pi=', c.stripePaymentIntentId, 'inv=', c.stripeInvoiceId, 'pdf=', !!c.invoicePdfUrl, 'refunded=', c.refundedAt?.toISOString());

  const employers = await prisma.userProfile.findMany({ where: { role: 'employer' }, select: { email: true, company: true, supabaseId: true, deletedAt: true } });
  console.log('employer profiles:', employers.length);
  for (const e of employers) console.log('  emp', e.email, 'company=', JSON.stringify(e.company), 'deleted=', e.deletedAt?.toISOString());

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
