/**
 * Persist mined leads to employer_leads.
 *
 * Strategy: one EmployerLead per unique email. Phone/website per job
 * are attached to all leads from that job (typically a single shared
 * company contact block at the bottom of the description).
 *
 * Idempotent — re-running is safe. Uses findFirst-then-create to play
 * nice with rows that may have been hand-edited / partly populated by
 * the existing collectEmployerEmails flow.
 */
import { prisma } from './prisma';
import { mineLeadsFromText } from './lead-mining';

export interface MineAndPersistResult {
    emailsFound: number;
    leadsCreated: number;
    leadsUpdated: number;
    skipped: number;
}

export async function mineAndPersistFromJob(job: {
    id: string;
    employer: string;
    description: string | null;
}): Promise<MineAndPersistResult> {
    const result: MineAndPersistResult = {
        emailsFound: 0,
        leadsCreated: 0,
        leadsUpdated: 0,
        skipped: 0,
    };
    if (!job.description) return result;

    const mined = mineLeadsFromText(job.description);
    result.emailsFound = mined.emails.length;
    if (mined.emails.length === 0) return result;

    // Phones / websites are job-scoped; pick the first of each as the
    // best-guess shared contact. (Multiple distinct phones per posting
    // are rare and usually duplicates of the same number in different
    // formats — already collapsed to one by `normalizePhone`.)
    const phone = mined.phones[0] ?? null;
    const website = mined.websites[0] ?? null;

    for (const email of mined.emails) {
        try {
            const existing = await prisma.employerLead.findFirst({
                where: { contactEmail: email },
                select: { id: true, phone: true, website: true, jobsPosted: true },
            });

            if (existing) {
                await prisma.employerLead.update({
                    where: { id: existing.id },
                    data: {
                        phone: existing.phone ?? phone,
                        website: existing.website ?? website,
                        jobsPosted: { increment: 1 },
                    },
                });
                result.leadsUpdated++;
            } else {
                await prisma.employerLead.create({
                    data: {
                        companyName: job.employer,
                        contactEmail: email,
                        phone,
                        website,
                        source: 'mined_from_description',
                        status: 'prospect',
                        jobsPosted: 1,
                    },
                });
                result.leadsCreated++;
            }
        } catch (e) {
            console.warn(`[Lead-Mining] Failed to upsert lead for ${email} (job ${job.id}):`, e);
            result.skipped++;
        }
    }

    return result;
}
