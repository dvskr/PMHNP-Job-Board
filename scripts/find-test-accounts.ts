/**
 * Find, and permanently stop mailing, the operator's own test addresses.
 *
 *   npx tsx scripts/find-test-accounts.ts                # report only
 *   npx tsx scripts/find-test-accounts.ts --apply        # suppress them
 *   npx tsx scripts/find-test-accounts.ts --apply --hard-delete
 *
 * WHY SUPPRESS RATHER THAN DELETE, by default.
 *
 * Suppression is stored ON the EmailLead row (isSuppressed) and on
 * UserProfile.emailSuppressed; lib/email-service.ts isEmailSuppressed reads
 * exactly those two and nothing else. There is no separate suppression list.
 * So deleting the row deletes the block along with it: the next time that
 * address touches a signup or an alert form, a fresh EmailLead is written
 * with isSubscribed true and isSuppressed false, and the mail resumes.
 *
 * Suppressing keeps a tombstone that says "never mail this", which is what
 * "permanently" actually requires, and it is reversible if an address is ever
 * wanted back. --hard-delete is there for when the row itself must go, and it
 * is the weaker guarantee of the two.
 *
 * An address that also owns a UserProfile needs
 * scripts/purge-test-user.ts --apply --email=<one> instead, which is
 * cascade-aware and removes the Supabase auth user too. This script refuses
 * to hard-delete those rather than orphan an account.
 *
 * MATCHING. Gmail ignores dots in the local part and treats everything after
 * a "+" as an alias, so dvskr.1234@, dvskr1234@ and d.v.s.k.r.1234+x@ are one
 * mailbox. Addresses are normalized the same way before comparing, otherwise
 * a dotted variant of a keeper looks like a different account and gets
 * deleted. KEEP_NORMALIZED is the one mailbox that must survive.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_DATABASE_URL;

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
/* eslint-enable @typescript-eslint/no-require-imports */

/** The mailbox that must NOT be touched, in normalized form. */
const KEEP_NORMALIZED = 'dvskr1234@gmail.com';

/** Exact addresses to remove regardless of pattern. */
const REMOVE_EXACT = new Set(['support@pmhnphiring.com']);

/** Gmail's own rules: dots are noise, "+suffix" is an alias of the mailbox. */
function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0].replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function shouldRemove(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  if (REMOVE_EXACT.has(email)) return true;

  const normalized = normalizeEmail(email);
  if (normalized === KEEP_NORMALIZED) return false;

  // Any other dvskr* mailbox on gmail.
  return /^dvskr/.test(normalized) && normalized.endsWith('@gmail.com');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const hardDelete = process.argv.includes('--hard-delete');

  const host = (process.env.DIRECT_URL || process.env.DATABASE_URL || '')
    .replace(/^.*@([^/:]+).*$/, '$1');
  console.log(`database host: ${host || 'unknown'}`);
  console.log(`keeping:       ${KEEP_NORMALIZED} (and its dotted / +alias forms)`);
  console.log(
    apply
      ? `mode:          APPLY (${hardDelete ? 'hard delete rows' : 'suppress, rows kept as tombstones'})`
      : 'mode:          report only, nothing is written',
  );
  console.log('');

  // JobApplication is deliberately absent: it keys on userId, not email, so
  // it has no address of its own to match and it cascades when the
  // UserProfile goes.
  const [profiles, alerts, leads, employerLeads, employerJobs] = await Promise.all([
    prisma.userProfile.findMany({ select: { email: true, role: true, createdAt: true } }),
    prisma.jobAlert.findMany({ select: { email: true, isActive: true } }),
    prisma.emailLead.findMany({ select: { email: true, isSubscribed: true } }),
    prisma.employerLead.findMany({ select: { contactEmail: true } }),
    prisma.employerJob.findMany({ select: { contactEmail: true } }),
  ]);

  /** address -> which tables it appears in, and how many times. */
  const hits = new Map<string, Record<string, number>>();
  const note = (raw: string | null | undefined, table: string): void => {
    if (!raw || !shouldRemove(raw)) return;
    const key = raw.trim().toLowerCase();
    const row = hits.get(key) ?? {};
    row[table] = (row[table] ?? 0) + 1;
    hits.set(key, row);
  };

  for (const p of profiles) note(p.email, `userProfile(${p.role})`);
  for (const a of alerts) note(a.email, a.isActive ? 'jobAlert(active)' : 'jobAlert(inactive)');
  for (const l of leads) note(l.email, l.isSubscribed ? 'emailLead(subscribed)' : 'emailLead(unsub)');
  for (const l of employerLeads) note(l.contactEmail, 'employerLead');
  for (const j of employerJobs) note(j.contactEmail, 'employerJob');

  if (hits.size === 0) {
    console.log('No matching addresses found.');
  } else {
    console.log(`${hits.size} address(es) matched:\n`);
    for (const [email, tables] of [...hits.entries()].sort()) {
      const where = Object.entries(tables).map(([t, n]) => (n > 1 ? `${t} x${n}` : t)).join(', ');
      console.log(`  ${email.padEnd(34)} ${where}`);
    }
  }

  const targets = [...hits.keys()];
  const profileEmails = new Set(
    profiles.filter((p) => shouldRemove(p.email)).map((p) => p.email.trim().toLowerCase()),
  );

  if (apply && targets.length) {
    console.log('\nwriting:');

    // Alerts go unconditionally: an alert is a standing request for mail and
    // these addresses are not to receive any.
    const alertsGone = await prisma.jobAlert.deleteMany({ where: { email: { in: targets } } });
    console.log(`  jobAlert deleted            ${alertsGone.count}`);

    if (hardDelete) {
      // Refused for anything owning a UserProfile: removing the lead while
      // the account survives leaves an account that can re-subscribe, and
      // the account itself needs the cascade-aware purge script.
      const safe = targets.filter((e) => !profileEmails.has(e));
      const skipped = targets.filter((e) => profileEmails.has(e));
      const leadsGone = await prisma.emailLead.deleteMany({ where: { email: { in: safe } } });
      console.log(`  emailLead deleted           ${leadsGone.count}`);
      for (const e of skipped) {
        console.log(`  SKIPPED ${e}: owns a UserProfile, use purge-test-user.ts --apply --email=${e}`);
      }
    } else {
      const suppressed = await prisma.emailLead.updateMany({
        where: { email: { in: targets } },
        data: { isSubscribed: false, isSuppressed: true },
      });
      console.log(`  emailLead suppressed        ${suppressed.count}`);
      // The second half of isEmailSuppressed. Without this an address that
      // also owns an account stays mailable through the profile.
      const profilesSuppressed = await prisma.userProfile.updateMany({
        where: { email: { in: targets } },
        data: { emailSuppressed: true },
      });
      console.log(`  userProfile suppressed      ${profilesSuppressed.count}`);
    }
  }

  // Shown so the keeper is visibly intact rather than merely unmentioned.
  const keptProfiles = profiles.filter((p) => normalizeEmail(p.email) === KEEP_NORMALIZED);
  const keptAlerts = alerts.filter((a) => normalizeEmail(a.email) === KEEP_NORMALIZED);
  const keptLeads = leads.filter((l) => normalizeEmail(l.email) === KEEP_NORMALIZED);
  console.log('\nKEPT (must survive):');
  console.log(`  userProfile ${keptProfiles.length}, jobAlert ${keptAlerts.length}, emailLead ${keptLeads.length}`);
  for (const p of keptProfiles) console.log(`    profile  ${p.email}  role=${p.role}`);
  for (const a of keptAlerts) console.log(`    alert    ${a.email}`);
  for (const l of keptLeads) console.log(`    lead     ${l.email}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
