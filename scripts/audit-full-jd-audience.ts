/**
 * Read-only. Who would the full-description chain actually mail, and which
 * of them are employers?
 *
 * Replicates the recipient computation in lib/full-jd-alert-service.ts
 * exactly, then cross-checks the survivors against every signal that an
 * address belongs to an employer rather than a candidate. Anything listed
 * under STILL REACHABLE is a hole in the filter.
 *
 *   npx tsx scripts/audit-full-jd-audience.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_DATABASE_URL;

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
/* eslint-enable @typescript-eslint/no-require-imports */

const lower = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

async function main(): Promise<void> {
  const host = (process.env.DIRECT_URL || process.env.DATABASE_URL || '')
    .replace(/^.*@([^/:]+).*$/, '$1');
  console.log(`database host: ${host}`);
  console.log('READ ONLY.\n');

  const [leads, nonCandidateAccounts, legacyContacts, allEmployerJobs, employerLeads] =
    await Promise.all([
      // Exactly the audience query the service runs.
      prisma.emailLead.findMany({
        where: { isSubscribed: true, isSuppressed: false },
        select: { email: true },
      }),
      // Exactly the two exclusions the service applies today.
      prisma.userProfile.findMany({
        where: { role: { not: 'job_seeker' } },
        select: { email: true, role: true },
      }),
      prisma.employerJob.findMany({ select: { contactEmail: true } }),
      // Every posting contact, regardless of whether the row has a userId.
      prisma.employerJob.findMany({ select: { contactEmail: true, userId: true } }),
      prisma.employerLead.findMany({ select: { contactEmail: true } }),
    ]);

  // Mirrors the three exclusion arms in lib/full-jd-alert-service.ts.
  const excludedToday = new Set<string>(
    [
      ...nonCandidateAccounts.map((p) => p.email),
      ...legacyContacts.map((e) => e.contactEmail),
      ...employerLeads.map((e) => e.contactEmail),
    ].map(lower).filter(Boolean),
  );

  const allLeads = [...new Set(leads.map((l) => lower(l.email)))];
  const wouldReceive = allLeads.filter((e) => !excludedToday.has(e));

  console.log(`mailable leads:        ${allLeads.length}`);
  console.log(`excluded by the fix:   ${allLeads.length - wouldReceive.length}`);
  console.log(`would receive:         ${wouldReceive.length}\n`);

  // Every other way an address can be an employer.
  const postedWithAccount = new Map<string, number>();
  for (const j of allEmployerJobs) {
    if (!j.userId) continue;
    const e = lower(j.contactEmail);
    if (e) postedWithAccount.set(e, (postedWithAccount.get(e) ?? 0) + 1);
  }
  const employerLeadSet = new Set(employerLeads.map((l) => lower(l.contactEmail)));

  const stillReachable: { email: string; why: string[] }[] = [];
  for (const email of wouldReceive) {
    const why: string[] = [];
    const posts = postedWithAccount.get(email);
    if (posts) why.push(`posted ${posts} job(s) from an account`);
    if (employerLeadSet.has(email)) why.push('employerLead');
    if (why.length) stillReachable.push({ email, why });
  }

  if (!stillReachable.length) {
    console.log('STILL REACHABLE: none. Every employer signal is covered.');
  } else {
    console.log(`STILL REACHABLE BY THE FULL-JD CHAIN: ${stillReachable.length}\n`);
    for (const r of stillReachable) {
      console.log(`  ${r.email.padEnd(38)} ${r.why.join(', ')}`);
    }
  }

  // Context for why the current filter missed them.
  const withAccount = allEmployerJobs.filter((j) => j.userId).length;
  console.log(`\nemployer_jobs rows: ${allEmployerJobs.length} total, ${withAccount} with a userId,`
    + ` ${allEmployerJobs.length - withAccount} without.`);
  console.log(`userProfile rows with role != job_seeker: ${nonCandidateAccounts.length}`);
  for (const p of nonCandidateAccounts) console.log(`  ${lower(p.email).padEnd(38)} role=${p.role}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
