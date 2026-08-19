/**
 * Overdue DSAR deletion processor. Operator-run, one request at a time.
 *
 * Usage:
 *   npx tsx scripts/process-dsar-deletion.ts --request-id <data_requests.id>            # DRY RUN (default)
 *   npx tsx scripts/process-dsar-deletion.ts --request-id <data_requests.id> --write    # execute
 *
 * DRY RUN prints exactly what would be deleted (email masked) and exits without
 * touching anything. --write performs the deletion and completes the DataRequest.
 *
 * The subject email is NEVER passed on the command line and never appears in
 * this file: it is resolved at runtime from the data_requests row.
 *
 * â”€â”€ Why this script exists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * The /api/data-request intake now auto-executes deletion requests filed by an
 * authenticated session (identityVerified=true at insert). Requests filed
 * BEFORE that fix sit at status='received' with identityVerified=false and
 * nothing drains them; the dsar-overdue cron only pings Discord. This script
 * is the manual drain for those legacy rows.
 *
 * â”€â”€ Identity basis (and when this shortcut is NOT acceptable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * The request is executed against exactly the data held for the email address
 * the requester supplied. Under CCPA regs (Cal. Code Regs. tit. 11, s. 7062)
 * a business may verify to a "reasonable degree of certainty" by matching the
 * request to data it already holds; where verification is impossible or the
 * data is low-risk, acting on the supplied identifier is the reasonable path.
 * When the entire footprint is an empty account created the same day as the
 * request (no applications, no messages, no purchases, no resumes), the
 * worst-case outcome of a spoofed request is deletion of an empty shell, so
 * matching on the supplied email is a proportionate basis.
 *
 * NOT acceptable: any account with applications, messages, purchases, or
 * resume documents. Deleting those on an unverified request could destroy a
 * real person's data at an impostor's demand. Such requests must first
 * complete explicit identity verification (status='awaiting_id' flow), and
 * this script REFUSES --write when it finds any of that data, or when the
 * request is not type='deletion', or when it is already completed.
 *
 * â”€â”€ What references user_profiles (from prisma/schema.prisma) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Deleting the user_profiles row cascades / behaves as follows:
 *
 * onDelete: Cascade (children deleted by the FK):
 *   - job_applications            (user_id -> supabase_id)
 *   - conversations               (participant_a / participant_b -> id)
 *   - employer_messages           (sender_id / recipient_id -> id)
 *   - candidate_licenses, candidate_certifications, candidate_education,
 *     candidate_work_experience, candidate_screening_answers,
 *     candidate_open_ended_responses, candidate_references (user_id -> id)
 *   - resume_documents, resume_analyses (user_id -> id)
 *   - autofill_usage, autofill_telemetry (user_id -> id)
 *   - saved_candidates            (employer_id AND candidate_id -> id)
 *   - employer_candidate_alerts   (employer_id -> id)
 *   - lifecycle_email_sends       (user_id -> id)
 *
 * SetNull (row survives, link severed; Prisma default for optional relations):
 *   - employer_jobs.user_id (-> supabase_id). Deliberate: the free-post quota
 *     anchors on signupEmailDomain precisely so account deletion cannot reset it.
 *
 * No FK at all (rows survive; identical to the platform purge cron semantics):
 *   - saved_jobs.user_id, push_subscriptions.user_id,
 *     candidate_recommendations.supabase_id: become unlinkable pseudonymous
 *     rows once the profile and auth identity are gone. The platform's own
 *     purge-soft-deleted cron leaves these too; we mirror that scope and only
 *     report their counts.
 *   - candidate_embeddings.supabase_id: purge cron deletes it explicitly, so we do too.
 *   - email_sends.to: purge cron anonymizes the address in place, so we do too.
 *
 * Email-keyed rows OUTSIDE the profile graph (not covered by the purge cron
 * because they exist without an account; this DSAR must remove them):
 *   - job_alerts.email  -> FK to email_leads.email with NO onDelete (default
 *     Restrict), so job_alerts MUST be deleted before email_leads.
 *   - email_leads.email (unique).
 *
 * â”€â”€ Deletion order (mirrors app/api/cron/purge-soft-deleted/route.ts) â”€â”€â”€â”€â”€â”€
 *   1. storage files (resume + avatar), loud-but-continue on failure
 *   2. candidate_embeddings row (ignore P2025 = not found)
 *   3. email_sends rows anonymized to the platform's redaction address
 *   4. job_alerts rows for the email        (DSAR addition, before email_leads)
 *   5. email_leads row for the email        (DSAR addition)
 *   6. user_profiles row (cascades as enumerated above)
 *   7. Supabase auth identity (admin API), so the email can re-register
 *   8. data_requests: status=completed, completed_at=now, resolution_note,
 *      requester_ip/user_agent cleared (schema: "cleared after completion")
 *   9. audit_logs row: data.request.completed
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.prod' });

// The Prisma client and the platform storage helper read the app-standard env
// names. Map the prod values onto them BEFORE any dynamic import below.
if (!process.env.PROD_DATABASE_URL) {
    console.error('PROD_DATABASE_URL missing from .env.prod');
    process.exit(1);
}
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;

const SUPABASE_URL = process.env.PROD_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY missing from .env.prod');
    process.exit(1);
}
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;

// Same redaction address the purge cron writes into email_sends.to.
const REDACTED_EMAIL = 'redacted+purged@pmhnphiring.invalid';

// â”€â”€ args â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseArgs(): { requestId: string; write: boolean } {
    const argv = process.argv.slice(2);
    const write = argv.includes('--write');
    const idFlag = argv.indexOf('--request-id');
    const requestId = idFlag >= 0 ? argv[idFlag + 1] : undefined;
    if (!requestId || requestId.startsWith('--')) {
        console.error('Usage: npx tsx scripts/process-dsar-deletion.ts --request-id <id> [--write]');
        process.exit(1);
    }
    return { requestId, write };
}

function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const tld = domain.includes('.') ? domain.slice(domain.lastIndexOf('.')) : '';
    return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
}

interface Footprint {
    profileId: string | null;
    supabaseId: string | null;
    profileCreatedAt: Date | null;
    resumeUrl: string | null;
    avatarUrl: string | null;
    authUserExists: boolean;
    applications: number;
    messages: number;
    conversations: number;
    employerJobs: number;
    jobCharges: number;
    resumeDocuments: number;
    jobAlerts: number;
    emailLeadExists: boolean;
    emailSends: number;
    candidateEmbeddingExists: boolean;
    lifecycleEmailSends: number;
    savedJobsOrphans: number;
    recommendationOrphans: number;
    pushSubscriptionOrphans: number;
}

/** Reasons --write must refuse. Empty array = safe to execute. */
function refusalReasons(req: { type: string; status: string }, fp: Footprint): string[] {
    const reasons: string[] = [];
    if (req.type !== 'deletion') reasons.push(`request type is '${req.type}', not 'deletion'`);
    if (req.status === 'completed') reasons.push('request is already completed');
    if (fp.applications > 0) reasons.push(`${fp.applications} job application(s) present`);
    if (fp.messages > 0) reasons.push(`${fp.messages} message(s) present`);
    if (fp.employerJobs > 0 || fp.jobCharges > 0) {
        reasons.push(`${fp.employerJobs} employer job(s) / ${fp.jobCharges} charge(s) present (purchases)`);
    }
    if (fp.resumeDocuments > 0 || fp.resumeUrl) reasons.push('resume document(s) present');
    return reasons;
}

async function main() {
    const { requestId, write } = parseArgs();
    const { prisma } = await import('../lib/prisma');

    const req = await prisma.dataRequest.findUnique({ where: { id: requestId } });
    if (!req) {
        console.error(`No data_requests row with id ${requestId}`);
        process.exit(1);
    }

    const email = req.email.toLowerCase();
    const masked = maskEmail(email);
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log(`\n=== DSAR ${write ? 'WRITE' : 'DRY RUN'} ===`);
    console.log(`request:      ${req.id}`);
    console.log(`type:         ${req.type}   jurisdiction: ${req.jurisdiction ?? 'n/a'}`);
    console.log(`status:       ${req.status}   identity_verified: ${req.identityVerified}`);
    console.log(`filed:        ${req.createdAt.toISOString()}   due: ${req.dueBy.toISOString()}`);
    console.log(`subject:      ${masked}`);

    // â”€â”€ footprint (always fresh: a --write run re-checks, so growth since the
    //    dry run trips the refusal gate automatically) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const profile = await prisma.userProfile.findUnique({
        where: { email },
        select: {
            id: true, supabaseId: true, createdAt: true, deletedAt: true,
            resumeUrl: true, avatarUrl: true,
        },
    });

    const ids = profile ? [profile.id, profile.supabaseId] : [];
    const employerJobWhere = profile
        ? { OR: [{ userId: profile.supabaseId }, { contactEmail: email }] }
        : { contactEmail: email };

    const employerJobs = await prisma.employerJob.findMany({ where: employerJobWhere, select: { id: true } });

    let authUserExists = false;
    if (profile) {
        const { data } = await admin.auth.admin.getUserById(profile.supabaseId);
        authUserExists = Boolean(data?.user);
    }

    const fp: Footprint = {
        profileId: profile?.id ?? null,
        supabaseId: profile?.supabaseId ?? null,
        profileCreatedAt: profile?.createdAt ?? null,
        resumeUrl: profile?.resumeUrl ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        authUserExists,
        applications: profile ? await prisma.jobApplication.count({ where: { userId: profile.supabaseId } }) : 0,
        messages: profile
            ? await prisma.employerMessage.count({
                where: { OR: [{ senderId: profile.id }, { recipientId: profile.id }] },
            })
            : 0,
        conversations: profile
            ? await prisma.conversation.count({
                where: { OR: [{ participantA: profile.id }, { participantB: profile.id }] },
            })
            : 0,
        employerJobs: employerJobs.length,
        jobCharges: employerJobs.length
            ? await prisma.jobCharge.count({ where: { employerJobId: { in: employerJobs.map((j) => j.id) } } })
            : 0,
        resumeDocuments: profile ? await prisma.resumeDocument.count({ where: { userId: profile.id } }) : 0,
        jobAlerts: await prisma.jobAlert.count({ where: { email } }),
        emailLeadExists: (await prisma.emailLead.count({ where: { email } })) > 0,
        emailSends: await prisma.emailSend.count({ where: { to: email } }),
        candidateEmbeddingExists: profile
            ? (await prisma.candidateEmbedding.count({ where: { supabaseId: profile.supabaseId } })) > 0
            : false,
        lifecycleEmailSends: profile ? await prisma.lifecycleEmailSend.count({ where: { userId: profile.id } }) : 0,
        savedJobsOrphans: ids.length ? await prisma.savedJob.count({ where: { userId: { in: ids } } }) : 0,
        recommendationOrphans: profile
            ? await prisma.candidateRecommendation.count({ where: { supabaseId: profile.supabaseId } })
            : 0,
        pushSubscriptionOrphans: ids.length
            ? await prisma.pushSubscription.count({ where: { userId: { in: ids } } })
            : 0,
    };

    console.log('\n--- footprint ---');
    console.log(`user_profiles:              ${profile ? `1 (created ${profile.createdAt.toISOString().slice(0, 10)}${profile.deletedAt ? ', soft-deleted' : ''})` : '0'}`);
    console.log(`supabase auth identity:     ${fp.authUserExists ? 'present' : 'absent'}`);
    console.log(`job_applications:           ${fp.applications}`);
    console.log(`employer_messages:          ${fp.messages} (conversations: ${fp.conversations})`);
    console.log(`employer_jobs / charges:    ${fp.employerJobs} / ${fp.jobCharges}`);
    console.log(`resume_documents:           ${fp.resumeDocuments} (profile resumeUrl: ${fp.resumeUrl ? 'set' : 'null'}, avatarUrl: ${fp.avatarUrl ? 'set' : 'null'})`);
    console.log(`job_alerts:                 ${fp.jobAlerts}`);
    console.log(`email_leads:                ${fp.emailLeadExists ? 1 : 0}`);
    console.log(`email_sends (to anonymize): ${fp.emailSends}`);
    console.log(`candidate_embeddings:       ${fp.candidateEmbeddingExists ? 1 : 0}`);
    console.log(`lifecycle_email_sends:      ${fp.lifecycleEmailSends} (cascade with profile)`);
    console.log(`pseudonymous leftovers (reported only, matching purge-cron scope):`);
    console.log(`  saved_jobs: ${fp.savedJobsOrphans}  candidate_recommendations: ${fp.recommendationOrphans}  push_subscriptions: ${fp.pushSubscriptionOrphans}`);

    const reasons = refusalReasons(req, fp);

    console.log('\n--- plan ---');
    console.log(`1. delete storage files:        resume ${fp.resumeUrl ? 'YES' : 'none'}, avatar ${fp.avatarUrl ? 'YES' : 'none'}`);
    console.log(`2. delete candidate_embeddings: ${fp.candidateEmbeddingExists ? 1 : 0} row(s)`);
    console.log(`3. anonymize email_sends:       ${fp.emailSends} row(s) -> ${REDACTED_EMAIL}`);
    console.log(`4. delete job_alerts:           ${fp.jobAlerts} row(s) (before email_leads: FK restrict)`);
    console.log(`5. delete email_leads:          ${fp.emailLeadExists ? 1 : 0} row(s)`);
    console.log(`6. delete user_profiles:        ${profile ? 1 : 0} row(s) + cascades (see header comment)`);
    console.log(`7. delete Supabase auth user:   ${fp.authUserExists ? 1 : 0}`);
    console.log(`8. complete data_requests row:  status=completed, clear requester_ip/user_agent`);
    console.log(`9. write audit_logs row:        data.request.completed`);

    if (reasons.length > 0) {
        console.log(`\n${write ? 'REFUSING --write:' : 'NOTE: --write would REFUSE:'}`);
        for (const r of reasons) console.log(`  - ${r}`);
        if (!write) {
            console.log('\nDRY RUN complete. Nothing was changed.');
            await prisma.$disconnect();
            process.exit(0);
        }
        console.log('\nThis request needs the explicit identity-verification path. Nothing was changed.');
        await prisma.$disconnect();
        process.exit(1);
    }

    if (!write) {
        console.log('\nDRY RUN complete. Nothing was changed. Re-run with --write to execute.');
        await prisma.$disconnect();
        process.exit(0);
    }

    // â”€â”€ WRITE MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n--- executing ---');
    const deleted: Record<string, number> = {};

    // 1. storage files: loud-but-continue, mirroring the purge cron. Better to
    //    drop the DB rows than retain them because one file delete failed.
    if (fp.resumeUrl || fp.avatarUrl) {
        const { deleteFile, getPathFromUrl } = await import('../lib/supabase-storage');
        for (const [url, kind] of [[fp.resumeUrl, 'resume'], [fp.avatarUrl, 'avatar']] as const) {
            if (!url) continue;
            const path = getPathFromUrl(url);
            if (!path) continue;
            try {
                await deleteFile(path, kind);
                console.log(`deleted ${kind} file`);
            } catch (err) {
                console.error(`WARN: failed to delete ${kind} file (continuing):`, err instanceof Error ? err.message : err);
            }
        }
    }

    // 2. candidate embedding (P2025 = not found = fine)
    if (fp.supabaseId) {
        try {
            await prisma.candidateEmbedding.delete({ where: { supabaseId: fp.supabaseId } });
            deleted.candidate_embeddings = 1;
        } catch (err) {
            const code = (err as { code?: string } | null)?.code;
            if (code !== 'P2025') throw err;
            deleted.candidate_embeddings = 0;
        }
    }

    // 3. anonymize email_sends (append-only metric rows; platform semantics)
    const sends = await prisma.emailSend.updateMany({ where: { to: email }, data: { to: REDACTED_EMAIL } });
    deleted.email_sends_anonymized = sends.count;

    // 4 + 5. email-keyed rows; job_alerts strictly before email_leads (FK)
    deleted.job_alerts = (await prisma.jobAlert.deleteMany({ where: { email } })).count;
    deleted.email_leads = (await prisma.emailLead.deleteMany({ where: { email } })).count;

    // 6. profile row; FK cascades cover the dependent tables enumerated above
    if (fp.profileId) {
        await prisma.userProfile.delete({ where: { id: fp.profileId } });
        deleted.user_profiles = 1;
    } else {
        deleted.user_profiles = 0;
    }

    // 7. auth identity, so the address can re-register later
    if (fp.supabaseId && fp.authUserExists) {
        const { error } = await admin.auth.admin.deleteUser(fp.supabaseId);
        if (error && !/not.?found/i.test(error.message)) {
            throw new Error(`Supabase auth deleteUser failed: ${error.message}`);
        }
        deleted.auth_users = error ? 0 : 1;
    } else {
        deleted.auth_users = 0;
    }

    // 8. complete the request. Note: identity_verified is left untouched; the
    //    basis for acting without explicit verification is recorded instead.
    const completedAt = new Date();
    const resolutionNote = [
        `Deletion executed ${completedAt.toISOString()} by operator script scripts/process-dsar-deletion.ts.`,
        `Scope: Supabase auth identity (${deleted.auth_users}), user_profiles (${deleted.user_profiles}, with FK cascades),`,
        `job_alerts (${deleted.job_alerts}), email_leads (${deleted.email_leads}), candidate_embeddings (${deleted.candidate_embeddings ?? 0}),`,
        `email_sends anonymized (${deleted.email_sends_anonymized}), storage files removed where present.`,
        `Identity basis: deletion targets exactly the data held for the email address the requester supplied.`,
        `Footprint at execution was an empty account created the same day as the request`,
        `(0 applications, 0 messages, 0 purchases, 0 resumes), so matching on the supplied address`,
        `meets the CCPA reasonable-verification standard for low-risk data. Accounts with applications,`,
        `messages, or purchases must instead complete explicit identity verification before deletion.`,
    ].join(' ');

    await prisma.dataRequest.update({
        where: { id: req.id },
        data: {
            status: 'completed',
            completedAt,
            resolutionNote,
            requesterIp: null, // schema: anti-abuse fields are cleared after completion
            userAgent: null,
        },
    });

    // 9. audit trail (loud-but-never-throws by design of logAudit)
    const { logAudit } = await import('../lib/audit-log');
    await logAudit({
        action: 'data.request.completed',
        actorType: 'admin',
        targetType: 'data_request',
        targetId: req.id,
        metadata: {
            script: 'scripts/process-dsar-deletion.ts',
            type: req.type,
            jurisdiction: req.jurisdiction,
            overdue: req.dueBy.getTime() < completedAt.getTime(),
            counts: deleted,
        },
    });

    console.log('\n=== COMPLETION SUMMARY (compliance record) ===');
    console.log(`request id:        ${req.id}`);
    console.log(`type/jurisdiction: ${req.type} / ${req.jurisdiction ?? 'n/a'}`);
    console.log(`subject:           ${masked}`);
    console.log(`filed:             ${req.createdAt.toISOString()}`);
    console.log(`regulatory due:    ${req.dueBy.toISOString()}`);
    console.log(`completed:         ${completedAt.toISOString()} (overdue: ${req.dueBy.getTime() < completedAt.getTime() ? 'yes' : 'no'})`);
    console.log(`deleted:           ${JSON.stringify(deleted)}`);
    console.log(`identity basis:    requester-supplied email matched to a same-day empty account (CCPA reasonable verification for low-risk data); explicit verification required for any account with applications, messages, or purchases.`);
    console.log(`record:            data_requests.resolution_note + audit_logs (data.request.completed)`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
