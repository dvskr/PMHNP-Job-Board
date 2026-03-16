import { prisma } from '../lib/prisma';

async function main() {
    // Step 1: Find employer emails that are incorrectly in email_leads
    // These are the ones with source = 'employer_signup' or 'employer_posting'
    const employerEmailLeads = await prisma.emailLead.findMany({
        where: {
            OR: [
                { source: 'employer_signup' },
                { source: 'employer_posting' },
            ],
        },
        select: { id: true, email: true, source: true },
    });

    console.log(`Found ${employerEmailLeads.length} employer emails in email_leads (wrong table):\n`);
    employerEmailLeads.forEach(e => console.log(`  - ${e.email} (source: ${e.source})`));

    // Also check: employer user profile emails that ended up in email_leads
    const employerProfiles = await prisma.userProfile.findMany({
        where: { role: 'employer' },
        select: { email: true, company: true, firstName: true, lastName: true },
    });

    const employerEmails = new Set(employerProfiles.map(e => e.email.toLowerCase()));

    // Find any email_leads with employer profile emails
    const additionalEmployerLeads = await prisma.emailLead.findMany({
        where: {
            email: { in: Array.from(employerEmails) },
            source: { notIn: ['employer_signup', 'employer_posting'] }, // not already counted
        },
        select: { id: true, email: true, source: true },
    });

    if (additionalEmployerLeads.length > 0) {
        console.log(`\nAlso found ${additionalEmployerLeads.length} employer profile emails in email_leads:`);
        additionalEmployerLeads.forEach(e => console.log(`  - ${e.email} (source: ${e.source})`));
    }

    // Combine all employer emails to remove from email_leads
    const allToRemove = [...employerEmailLeads, ...additionalEmployerLeads];
    const emailsToRemove = allToRemove.map(e => e.email);

    if (emailsToRemove.length === 0) {
        console.log('\nNo employer emails to clean up in email_leads!');
        process.exit(0);
        return;
    }

    // Step 2: Ensure these employers are in employer_leads
    for (const entry of allToRemove) {
        const existing = await prisma.employerLead.findFirst({
            where: { contactEmail: entry.email },
        });

        if (!existing) {
            // Check if we have company info from their profile
            const profile = employerProfiles.find(p => p.email.toLowerCase() === entry.email.toLowerCase());
            const empJob = await prisma.employerJob.findFirst({
                where: { contactEmail: entry.email },
                select: { employerName: true },
            });

            await prisma.employerLead.create({
                data: {
                    companyName: profile?.company || empJob?.employerName || 'Unknown',
                    contactEmail: entry.email,
                    contactName: profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null : null,
                    source: 'migrated_from_email_leads',
                    status: 'prospect',
                },
            });
            console.log(`  + Moved to employer_leads: ${entry.email}`);
        } else {
            console.log(`  ~ Already in employer_leads: ${entry.email}`);
        }
    }

    // Step 3: Check for job_alerts linked to these emails before deletion
    for (const email of emailsToRemove) {
        const alerts = await prisma.jobAlert.findMany({
            where: { email },
            select: { id: true },
        });
        if (alerts.length > 0) {
            // Delete alerts for employer emails (they shouldn't have job alerts)
            await prisma.jobAlert.deleteMany({ where: { email } });
            console.log(`  ✗ Removed ${alerts.length} job alerts for employer: ${email}`);
        }
    }

    // Step 4: Delete employer emails from email_leads
    const deleted = await prisma.emailLead.deleteMany({
        where: { email: { in: emailsToRemove } },
    });

    console.log(`\n=== Cleanup Summary ===`);
    console.log(`Removed ${deleted.count} employer emails from email_leads`);

    // Verify
    const remainingLeads = await prisma.emailLead.count();
    const totalEmployerLeads = await prisma.employerLead.count();
    console.log(`Remaining email_leads: ${remainingLeads}`);
    console.log(`Total employer_leads: ${totalEmployerLeads}`);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
