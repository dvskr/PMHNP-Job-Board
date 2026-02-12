import { prisma } from './prisma';

/**
 * Collects employer contact emails from EmployerJob records and
 * from user profiles with role "employer", then upserts them into
 * the email_leads table with newsletter opt-in enabled.
 *
 * This is idempotent — existing leads are updated, not duplicated.
 */
export async function collectEmployerEmails(): Promise<{
    created: number;
    updated: number;
    total: number;
}> {
    let created = 0;
    let updated = 0;

    // Source 1: Contact emails from employer job postings
    const employerJobs = await prisma.employerJob.findMany({
        select: { contactEmail: true, employerName: true },
    });

    const emailSet = new Map<string, string>(); // email -> source label
    for (const job of employerJobs) {
        if (job.contactEmail && !emailSet.has(job.contactEmail.toLowerCase())) {
            emailSet.set(job.contactEmail.toLowerCase(), 'employer_posting');
        }
    }

    // Source 2: Emails from user profiles with role "employer"
    const employers = await prisma.userProfile.findMany({
        where: { role: 'employer' },
        select: { email: true },
    });

    for (const emp of employers) {
        if (emp.email && !emailSet.has(emp.email.toLowerCase())) {
            emailSet.set(emp.email.toLowerCase(), 'employer_signup');
        }
    }

    // Upsert each email into email_leads
    for (const [email, source] of emailSet) {
        try {
            const existing = await prisma.emailLead.findUnique({
                where: { email },
            });

            if (existing) {
                if (!existing.newsletterOptIn || !existing.isSubscribed) {
                    await prisma.emailLead.update({
                        where: { email },
                        data: { isSubscribed: true, newsletterOptIn: true },
                    });
                    updated++;
                }
            } else {
                await prisma.emailLead.create({
                    data: {
                        email,
                        isSubscribed: true,
                        newsletterOptIn: true,
                        source,
                    },
                });
                created++;
            }
        } catch (error) {
            // Skip duplicate key errors (race conditions)
            console.error(`[Employer Email Collect] Error for ${email}:`, error);
        }
    }

    const total = emailSet.size;
    console.log(`[Employer Email Collect] Done: ${created} created, ${updated} updated, ${total} total`);

    return { created, updated, total };
}
