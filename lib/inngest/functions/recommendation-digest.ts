/**
 * Weekly recommendation digest — Sprint 1.2.3.
 *
 * Every Monday 09:00 UTC, walks every candidate who has:
 *   - At least one fresh recommendation in the latest batch (≤7 days old)
 *   - Opted in to email digests via `email_leads.newsletterOptIn`
 *   - The `ai.candidate.recommendations_email` flag enabled for them
 *
 * Sends a curated "5 new jobs match your profile" email containing the top
 * 5 recommendations (Easy Apply pinned first, same selector ordering as the
 * dashboard surface).
 *
 * Reuses `candidate_recommendations` so we never recompute — the daily recs
 * cron is the source of truth, this just emails what's already there.
 *
 * ── STEP-OUTPUT DISCIPLINE (2026-08-13) ──────────────────────────────────
 * Inngest persists every step.run() return value as durable run state and
 * caps its size. `list-eligible-candidates` used to return a full row per
 * candidate (email, first name, unsubscribe token) at roughly 160 B each.
 * That is comfortably under the cap today, but it is the same unbounded shape
 * that broke recommendations.ts (see that file's docblock), it grows linearly
 * with the candidate base, and it copies addresses plus unsubscribe tokens
 * into durable third-party run state for no reason.
 *
 * So this function follows the same three rules, locked by
 * tests/lib/inngest-step-output-size.test.ts:
 *   1. Steps return ids, counts and compact scalars only.
 *   2. Contact details are re-fetched inside the step that sends the mail —
 *      which also means a suppression flip mid-run is honoured.
 *   3. Outcome counts are folded from the returned step VALUES. Inngest
 *      replays the function body on every request, so counters mutated
 *      inside a step closure lose every increment from an earlier replay.
 */

import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { isAiFeatureEnabled } from '@/lib/ai/feature-flags';
import { sendAndLog, escapeHtml } from '@/lib/email-service';
import { getBaseUrl } from '@/lib/env';

interface DigestJob {
    id: string;
    title: string;
    slug: string | null;
    employer: string;
    location: string | null;
    state: string | null;
    isRemote: boolean;
    displaySalary: string | null;
    tier: 'easy_apply' | 'direct_apply' | 'external';
}

const DIGEST_TOP_N = 5;
const FRESH_BATCH_WINDOW_DAYS = 7;

/**
 * Hard ceiling on per-candidate steps in one run, mirroring the cap in
 * recommendations.ts. Each candidate costs one step and Inngest caps the steps
 * a single run may take, so an uncapped roster turns "the candidate base grew"
 * into "the weekly digest stopped running" with no warning: the same failure
 * mode, one step-boundary over, that took the daily recommendations pipeline
 * down. Ordered freshest-recommendations first so the cap, if it ever binds,
 * mails the people whose picks are newest; the daily cron already rotates who
 * that is, so nobody is permanently starved. A warning fires when it binds.
 */
const MAX_CANDIDATES_PER_RUN = 750;

function tierBadgeHtml(tier: DigestJob['tier']): string {
    if (tier === 'easy_apply') {
        return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#A7F3D0;color:#065F46;font-size:11px;font-weight:700;">⚡ Easy Apply</span>`;
    }
    if (tier === 'direct_apply') {
        return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#CCFBF1;color:#0F766E;font-size:11px;font-weight:700;">↗ Direct Apply</span>`;
    }
    return '';
}

function renderJobRow(job: DigestJob, baseUrl: string): string {
    const url = job.slug ? `${baseUrl}/jobs/${job.slug}` : `${baseUrl}/jobs/${job.id}`;
    const salaryLine = job.displaySalary ? `<div style="margin-top:4px;font-size:13px;color:#065F46;font-weight:600;">${escapeHtml(job.displaySalary)}</div>` : '';
    const locationParts: string[] = [];
    if (job.state) locationParts.push(escapeHtml(job.state));
    if (job.isRemote) locationParts.push('Remote');
    else if (job.location) locationParts.push(escapeHtml(job.location));
    const locationLine = locationParts.join(' · ');

    return `
<tr>
  <td style="padding:14px 0;border-bottom:1px solid #E5E7EB;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td>
          ${tierBadgeHtml(job.tier)}
          <div style="margin-top:8px;font-size:16px;font-weight:700;font-family:Georgia,serif;color:#1A2E35;">
            <a href="${url}" style="color:#1A2E35;text-decoration:none;">${escapeHtml(job.title)}</a>
          </div>
          <div style="margin-top:2px;font-size:13px;color:#6B7F8A;">${escapeHtml(job.employer)}</div>
          ${locationLine ? `<div style="margin-top:4px;font-size:12px;color:#8A9BA6;">${locationLine}</div>` : ''}
          ${salaryLine}
          <div style="margin-top:10px;">
            <a href="${url}" style="display:inline-block;padding:8px 18px;border-radius:10px;background:#0D9488;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;">View role →</a>
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

function renderDigestHtml(args: {
    firstName: string | null;
    jobs: DigestJob[];
    unsubscribeUrl: string;
    settingsUrl: string;
}): string {
    const greeting = args.firstName ? `Hi ${escapeHtml(args.firstName)},` : 'Hi there,';
    const rows = args.jobs.map((j) => renderJobRow(j, getBaseUrl())).join('');
    return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FDFBF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A2E35;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FDFBF7;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#FFFFFF;border-radius:20px;padding:32px;border:1px solid rgba(0,0,0,0.06);">
        <tr><td>
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0D9488;">PMHNP Hiring · Weekly Digest</p>
          <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;font-weight:800;color:#1A2E35;">${args.jobs.length} new role${args.jobs.length === 1 ? '' : 's'} match your profile</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#6B7F8A;">${greeting} We picked these from your latest recommendations — Easy Apply jobs first.</p>

          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows}
          </table>

          <div style="margin-top:24px;padding-top:18px;border-top:1px solid #E5E7EB;font-size:12px;color:#8A9BA6;line-height:1.5;">
            You're getting this because you opted into email recommendations.
            <br>
            <a href="${args.settingsUrl}" style="color:#0D9488;text-decoration:underline;">Manage email preferences</a>
            &nbsp;·&nbsp;
            <a href="${args.unsubscribeUrl}" style="color:#0D9488;text-decoration:underline;">Unsubscribe</a>
          </div>
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</body></html>`;
}

interface CandidateForDigest {
    supabase_id: string;
    email: string;
    first_name: string | null;
    unsubscribe_token: string | null;
}

/**
 * Compact per-candidate step result. One short string, never a row.
 *
 * `gone` covers a candidate whose profile was hidden, deleted or suppressed
 * between the roster step and their own step.
 */
export type DigestOutcome = 'sent' | 'skipped_flag' | 'no_recs' | 'gone' | 'error';

export interface DigestTotals {
    sent: number;
    skippedFlag: number;
    noRecs: number;
    gone: number;
    errored: number;
}

/** Fold per-candidate outcomes into run totals. Pure; ignores unknown values. */
export function foldDigestOutcomes(outcomes: ReadonlyArray<DigestOutcome>): DigestTotals {
    const totals: DigestTotals = { sent: 0, skippedFlag: 0, noRecs: 0, gone: 0, errored: 0 };
    for (const o of outcomes) {
        if (o === 'sent') totals.sent += 1;
        else if (o === 'skipped_flag') totals.skippedFlag += 1;
        else if (o === 'no_recs') totals.noRecs += 1;
        else if (o === 'gone') totals.gone += 1;
        else if (o === 'error') totals.errored += 1;
    }
    return totals;
}

export const recommendationDigestWeekly = inngest.createFunction(
    {
        id: 'recommendation-digest-weekly',
        name: 'Weekly recommendation digest email',
        triggers: [{ cron: 'TZ=UTC 0 9 * * 1' }], // Mondays 09:00 UTC
        retries: 2,
        concurrency: 5,
    },
    async ({ step }) => {
        // Find candidates who:
        //   - have at least one rec in the past 7 days
        //   - have a known email and aren't hard-suppressed (bounce/complaint)
        //   - have an email_leads row for the unsubscribe token
        //
        // NOTE: We deliberately do NOT require `newsletter_opt_in = true` here.
        // The AI digest is a separate opt-in (ai.candidate.recommendations_email
        // flag, toggleable from /settings) from the general newsletter. A user
        // can subscribe to the AI digest without subscribing to the newsletter,
        // and vice versa. The per-candidate flag check in the loop below is
        // the actual opt-in gate; this query just narrows to "has an email,
        // has recs, isn't suppressed."
        // IDS ONLY — addresses and unsubscribe tokens are re-fetched inside
        // each candidate's own step rather than parked in durable run state.
        const candidateIds = await step.run('list-eligible-candidate-ids', async () => {
            const rows = await prisma.$queryRawUnsafe<Array<{ supabase_id: string }>>(`
                SELECT up.supabase_id
                FROM user_profiles up
                JOIN candidate_recommendations cr ON cr.supabase_id = up.supabase_id
                JOIN email_leads el ON el.email = up.email
                WHERE cr.created_at >= NOW() - INTERVAL '${FRESH_BATCH_WINDOW_DAYS} days'
                  AND cr.dismissed_at IS NULL
                  AND el.is_suppressed = false
                  AND up.deleted_at IS NULL
                  AND up.role = 'job_seeker'
                  AND up.email IS NOT NULL
                GROUP BY up.supabase_id
                ORDER BY MAX(cr.created_at) DESC, up.supabase_id ASC
                LIMIT ${MAX_CANDIDATES_PER_RUN};
            `);
            if (rows.length >= MAX_CANDIDATES_PER_RUN) {
                logger.warn('recommendation-digest: candidate roster truncated by per-run cap', {
                    processing: rows.length,
                    cap: MAX_CANDIDATES_PER_RUN,
                });
            }
            return rows.map((r) => r.supabase_id);
        });

        if (candidateIds.length === 0) {
            logger.info('recommendation-digest: no eligible candidates');
            return { sent: 0 };
        }

        const outcomes: DigestOutcome[] = [];

        for (const supabaseId of candidateIds) {
            const outcome = await step.run(`digest-${supabaseId}`, async (): Promise<DigestOutcome> => {
                // Per-candidate flag check (admin can disable for individuals).
                const enabled = await isAiFeatureEnabled(
                    'ai.candidate.recommendations_email',
                    { type: 'candidate', id: supabaseId },
                );
                if (!enabled) return 'skipped_flag';

                // Re-fetch contact details HERE. Re-running the eligibility
                // joins means a profile hidden or an address suppressed since
                // the roster step drops out instead of being mailed.
                const contacts = await prisma.$queryRawUnsafe<CandidateForDigest[]>(
                    `
                    SELECT up.supabase_id, up.email, up.first_name, el.unsubscribe_token
                    FROM user_profiles up
                    JOIN email_leads el ON el.email = up.email
                    WHERE up.supabase_id = $1
                      AND el.is_suppressed = false
                      AND up.deleted_at IS NULL
                      AND up.role = 'job_seeker'
                      AND up.email IS NOT NULL
                    LIMIT 1;
                    `,
                    supabaseId,
                );
                const cand = contacts[0];
                if (!cand) return 'gone';

                // Pull this candidate's latest batch — top N tier-pinned slots.
                const recs = await prisma.candidateRecommendation.findMany({
                    where: { supabaseId, dismissedAt: null },
                    orderBy: [{ createdAt: 'desc' }, { rank: 'asc' }],
                    take: DIGEST_TOP_N,
                    include: {
                        job: {
                            select: {
                                id: true, title: true, slug: true, employer: true,
                                location: true, state: true, isRemote: true,
                                displaySalary: true,
                            },
                        },
                    },
                });
                if (recs.length === 0) return 'no_recs';

                const jobs: DigestJob[] = recs.map((r) => ({
                    id: r.job.id,
                    title: r.job.title,
                    slug: r.job.slug,
                    employer: r.job.employer,
                    location: r.job.location,
                    state: r.job.state,
                    isRemote: r.job.isRemote,
                    displaySalary: r.job.displaySalary,
                    tier: r.tier as DigestJob['tier'],
                }));

                const baseUrl = getBaseUrl();
                const unsubscribeUrl = cand.unsubscribe_token
                    ? `${baseUrl}/email-preferences?token=${cand.unsubscribe_token}`
                    : `${baseUrl}/email-preferences`;
                const settingsUrl = `${baseUrl}/settings?tab=account`;

                const html = renderDigestHtml({
                    firstName: cand.first_name,
                    jobs,
                    unsubscribeUrl,
                    settingsUrl,
                });

                try {
                    await sendAndLog(
                        {
                            from: '', // sendAndLog overrides with marketing sender
                            to: cand.email,
                            subject: `${jobs.length} new ${jobs.length === 1 ? 'role' : 'roles'} match your profile`,
                            html,
                        },
                        'recommendation_digest',
                        { supabaseId: cand.supabase_id, recIds: recs.map((r) => r.id) },
                        unsubscribeUrl,
                    );
                    return 'sent';
                } catch (err) {
                    logger.warn('recommendation-digest: send failed', { supabaseId }, err);
                    return 'error';
                }
            });

            outcomes.push(outcome);
        }

        // Folded from the returned step values — counters mutated inside the
        // step closures would lose every increment from an earlier replay.
        const totals = foldDigestOutcomes(outcomes);

        logger.info('recommendation-digest complete', { eligible: candidateIds.length, ...totals });
        return { eligible: candidateIds.length, ...totals };
    },
);

export const recommendationDigestFunctions = [recommendationDigestWeekly] as const;
