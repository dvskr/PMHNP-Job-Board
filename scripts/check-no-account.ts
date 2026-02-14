import { prisma } from '../lib/prisma';

async function main() {
    const leads = await prisma.emailLead.findMany({
        select: { email: true, source: true },
        orderBy: { createdAt: 'asc' },
    });
    const profiles = await prisma.userProfile.findMany({
        select: { email: true, firstName: true, lastName: true, role: true },
    });

    console.log(`Total email_leads: ${leads.length}`);
    console.log(`Total user_profiles: ${profiles.length}\n`);

    const profileEmails = new Set(profiles.map(p => p.email.toLowerCase()));

    const noAccount: typeof leads = [];
    const hasAccount: typeof leads = [];

    for (const l of leads) {
        // Skip sathish's emails
        const e = l.email.toLowerCase();
        if (e.includes('dvskr') || e.includes('satish') || e.includes('sathish') || e.includes('propper')) continue;

        if (profileEmails.has(e)) {
            hasAccount.push(l);
        } else {
            noAccount.push(l);
        }
    }

    console.log(`=== NO ACCOUNT (${noAccount.length}) ===`);
    console.log('These people signed up for alerts but never created an account:\n');
    noAccount.forEach(l => console.log(`  ${l.email.padEnd(38)} (source: ${l.source})`));

    console.log(`\n=== HAVE ACCOUNT (${hasAccount.length}) ===\n`);
    hasAccount.forEach(l => console.log(`  ${l.email.padEnd(38)} (source: ${l.source})`));

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
