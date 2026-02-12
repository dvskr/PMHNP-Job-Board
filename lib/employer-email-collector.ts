import { prisma } from './prisma';

/**
 * Collects employer contact emails from EmployerJob records and
 * from user profiles with role "employer", then upserts them into
 * the employer_leads table (NOT email_leads — that's for job seekers).
 *
 * This is idempotent — existing leads are matched by contactEmail.
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
        select: { contactEmail: true, employerName: true, companyWebsite: true },
    });

    // email -> { companyName, website }
    const emailMap = new Map<string, { companyName: string; website?: string | null }>();
    for (const job of employerJobs) {
        const email = job.contactEmail.toLowerCase();
        if (!emailMap.has(email)) {
            emailMap.set(email, {
                companyName: job.employerName,
                website: job.companyWebsite,
            });
        }
    }

    // Source 2: Emails from user profiles with role "employer"
    const employers = await prisma.userProfile.findMany({
        where: { role: 'employer' },
        select: { email: true, company: true, firstName: true, lastName: true },
    });

    for (const emp of employers) {
        const email = emp.email.toLowerCase();
        if (!emailMap.has(email)) {
            emailMap.set(email, {
                companyName: emp.company || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Unknown',
            });
        }
    }

    // Upsert each into employer_leads
    for (const [email, info] of emailMap) {
        try {
            // Check if this employer already exists in employer_leads by contactEmail
            const existing = await prisma.employerLead.findFirst({
                where: { contactEmail: email },
            });

            if (existing) {
                // Already exists — nothing to do
                updated++;
            } else {
                // Create new employer lead
                await prisma.employerLead.create({
                    data: {
                        companyName: info.companyName,
                        contactEmail: email,
                        website: info.website || null,
                        source: 'auto_collected',
                        status: 'prospect',
                    },
                });
                created++;
            }
        } catch (error) {
            console.error(`[Employer Email Collect] Error for ${email}:`, error);
        }
    }

    const total = emailMap.size;
    console.log(`[Employer Email Collect] Done: ${created} created, ${updated} existing, ${total} total`);

    return { created, updated, total };
}
