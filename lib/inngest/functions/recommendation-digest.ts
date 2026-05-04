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
        //   - have a known email + opted in to newsletter
        //   - have email_leads row (the unsubscribe token lives there)
        const candidates = await step.run('list-eligible-candidates', async () => {
            return prisma.$queryRawUnsafe<CandidateForDigest[]>(`
                SELECT DISTINCT up.supabase_id,
                       up.email,
                       up.first_name,
                       el.unsubscribe_token
                FROM user_profiles up
                JOIN candidate_recommendations cr ON cr.supabase_id = up.supabase_id
                JOIN email_leads el ON el.email = up.email
                WHERE cr.created_at >= NOW() - INTERVAL '${FRESH_BATCH_WINDOW_DAYS} days'
                  AND cr.dismissed_at IS NULL
                  AND el.newsletter_opt_in = true
                  AND up.deleted_at IS NULL
                  AND up.role = 'job_seeker'
                  AND up.email IS NOT NULL;
            `);
        });

        if (candidates.length === 0) {
            logger.info('recommendation-digest: no eligible candidates');
            return { sent: 0 };
        }

        let sent = 0;
        let skippedFlag = 0;
        let errored = 0;

        for (const cand of candidates) {
            await step.run(`digest-${cand.supabase_id}`, async () => {
                // Per-candidate flag check (admin can disable for individuals).
                const enabled = await isAiFeatureEnabled(
                    'ai.candidate.recommendations_email',
                    { type: 'candidate', id: cand.supabase_id },
                );
                if (!enabled) { skippedFlag += 1; return; }

                // Pull this candidate's latest batch — top N tier-pinned slots.
                const recs = await prisma.candidateRecommendation.findMany({
                    where: { supabaseId: cand.supabase_id, dismissedAt: null },
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
                if (recs.length === 0) return;

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
                    sent += 1;
                } catch (err) {
                    errored += 1;
                    logger.warn('recommendation-digest: send failed', { supabaseId: cand.supabase_id }, err);
                }
            });
        }

        logger.info('recommendation-digest complete', { eligible: candidates.length, sent, skippedFlag, errored });
        return { eligible: candidates.length, sent, skippedFlag, errored };
    },
);

export const recommendationDigestFunctions = [recommendationDigestWeekly] as const;
