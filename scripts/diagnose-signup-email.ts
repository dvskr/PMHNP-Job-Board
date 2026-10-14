/**
 * Read-only. Why is one address not receiving mail from us?
 *
 * Dumps every row and flag that can stop a send, plus the recent send log,
 * for a single address. Written for signup/verification complaints, where
 * the usual cause is a suppression the person has no way to see.
 *
 *   npx tsx scripts/diagnose-signup-email.ts --email=someone@example.com
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_DATABASE_URL;

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
/* eslint-enable @typescript-eslint/no-require-imports */

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];
  if (!arg) { console.error('need --email=<address>'); process.exit(1); }
  const email = arg.trim().toLowerCase();

  const host = (process.env.DIRECT_URL || process.env.DATABASE_URL || '')
    .replace(/^.*@([^/:]+).*$/, '$1');
  console.log(`database host: ${host}`);
  console.log(`address:       ${email}`);
  console.log('READ ONLY.\n');

  const [lead, profile, alerts, employerLead, employerJobs, sends] = await Promise.all([
    prisma.emailLead.findUnique({ where: { email } }),
    prisma.userProfile.findUnique({ where: { email } }),
    prisma.jobAlert.findMany({ where: { email }, select: { id: true, isActive: true, createdAt: true } }),
    prisma.employerLead.findFirst({ where: { contactEmail: email } }),
    prisma.employerJob.findMany({ where: { contactEmail: email }, select: { id: true, createdAt: true } }),
    prisma.emailSend.findMany({
      where: { to: email },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { emailType: true, createdAt: true, status: true, subject: true },
    }).catch(() => []),
  ]);

  console.log('— EmailLead —');
  if (!lead) console.log('  (none)');
  else {
    console.log(`  isSubscribed  ${lead.isSubscribed}`);
    console.log(`  isSuppressed  ${lead.isSuppressed}   <-- blocks every send when true`);
    console.log(`  createdAt     ${lead.createdAt.toISOString()}`);
  }

  console.log('\n— UserProfile —');
  if (!profile) console.log('  (none)  <-- no account row yet');
  else {
    console.log(`  role            ${profile.role}`);
    console.log(`  emailSuppressed ${profile.emailSuppressed}   <-- also blocks every send`);
    console.log(`  createdAt       ${profile.createdAt.toISOString()}`);
  }

  console.log('\n— Other traces —');
  console.log(`  jobAlert      ${alerts.length}`);
  console.log(`  employerLead  ${employerLead ? 'YES (outbound prospect)' : 'no'}`);
  console.log(`  employerJob   ${employerJobs.length}`);

  console.log('\n— Last 15 sends —');
  const rows = sends as { emailType: string; createdAt: Date; status: string | null; subject: string | null }[];
  if (!rows.length) console.log('  (none logged)');
  for (const s of rows) {
    console.log(`  ${s.createdAt.toISOString()}  ${String(s.emailType).padEnd(26)} ${String(s.status).padEnd(10)} ${s.subject ?? ''}`);
  }

  const blocked = !!lead?.isSuppressed || !!profile?.emailSuppressed;
  console.log(`\nVERDICT: ${blocked ? 'SUPPRESSED — our senders will refuse this address' : 'not suppressed by our flags'}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
