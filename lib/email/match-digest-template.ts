/**
 * lib/email/match-digest-template.ts — V2 "Warm Diorama" HTML for employer
 * match digests and their single follow-up reminder.
 *
 * Deliberately import-light: only the pure V2 template builders and the
 * digest policy module, never email-service (which instantiates Resend and
 * Prisma at import time). That keeps this renderable from unit tests.
 *
 * Privacy contract (see match-digest-policy.ts DigestCandidateCard): cards
 * carry NO candidate contact info and only privacy-transformed names. Every
 * link goes through /api/track/email-click into the platform, where the
 * tier gates apply.
 */

import {
  emailShellV2,
  headerBlockV2,
  primaryButtonV2,
  spacerV2,
  closeContentV2,
  unsubscribeFooterV2,
  bodyTextV2,
  V2,
  SANS,
  SERIF,
} from '@/lib/email-templates-v2';
import type { DigestCandidateCard } from '@/lib/email/match-digest-policy';

/** Local HTML escaper — mirrors email-service's, without its import weight. */
export function escapeDigestHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the click-tracked URL for a digest link. Every href in the email
 * goes through /api/track/email-click so clickedAt gets stamped before the
 * 302 into the platform. The destination is a RELATIVE path validated
 * against lib/email/email-click-allowlist.ts on the way back out.
 */
export function buildTrackedUrl(
  baseUrl: string,
  clickToken: string,
  destination: string,
): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/api/track/email-click?t=${encodeURIComponent(clickToken)}&d=${encodeURIComponent(destination)}`;
}

export interface MatchDigestEmailArgs {
  baseUrl: string;
  jobTitle: string;
  candidates: DigestCandidateCard[];
  clickToken: string;
  unsubscribeToken: string;
  isFollowUp?: boolean;
  isTest?: boolean;
}

/**
 * Subject lines are a mail HEADER, not HTML: the risk is not markup but
 * CR/LF (and other control characters) smuggled in through an employer
 * supplied job title, which is classic header injection. Collapse all
 * control characters and runs of whitespace to single spaces, then bound
 * the length so a pathological title cannot push the real subject out of
 * the recipient's view.
 */
export function sanitizeSubjectText(value: string, maxLength = 120): string {
  const collapsed = Array.from(value)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      // C0 controls (this is what covers CR and LF) and DEL become spaces.
      return code < 0x20 || code === 0x7f ? ' ' : ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 3).trimEnd()}...`
    : collapsed;
}

export function buildMatchDigestSubject(args: {
  candidateCount: number;
  jobTitle: string;
  isFollowUp?: boolean;
  isTest?: boolean;
}): string {
  const { candidateCount, jobTitle, isFollowUp, isTest } = args;
  const plural = candidateCount === 1 ? 'candidate' : 'candidates';
  const safeTitle = sanitizeSubjectText(jobTitle);
  const core = isFollowUp
    ? `Reminder: ${candidateCount} PMHNP ${plural} matched "${safeTitle}"`
    : `${candidateCount} PMHNP ${plural} match your post: ${safeTitle}`;
  return isTest ? `[TEST] ${core}` : core;
}

function candidateCardHtml(
  card: DigestCandidateCard,
  trackedUrl: string,
  isLast: boolean,
): string {
  const name = escapeDigestHtml(card.displayName);
  const headline = card.headline ? escapeDigestHtml(card.headline) : '';
  const metaParts: string[] = [];
  if (card.yearsExperience) {
    metaParts.push(`${card.yearsExperience}+ yrs experience`);
  }
  if (card.licenseStates.length > 0) {
    metaParts.push(`Licensed: ${escapeDigestHtml(card.licenseStates.slice(0, 6).join(', '))}`);
  }
  const meta = metaParts.join(' &middot; ');
  const specialties = card.specialties.slice(0, 4).map((s) =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:20px;background:#F0FDFA;border:1px solid rgba(13,148,136,0.2);font-family:${SANS};font-size:11px;font-weight:600;color:${V2.teal};">${escapeDigestHtml(s)}</span>`,
  ).join('');
  const initial = escapeDigestHtml(card.displayName.charAt(0).toUpperCase());

  return `<tr><td style="padding:0 40px ${isLast ? '0' : '12px'};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
      <tr><td style="padding:18px 22px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td width="44" valign="top" style="padding-right:14px;">
            <div style="width:44px;height:44px;border-radius:50%;background:#7C8CF5;color:#ffffff;font-family:${SANS};font-size:18px;font-weight:700;text-align:center;line-height:44px;">${initial}</div>
          </td>
          <td valign="middle" style="width:100%;">
            <p style="margin:0;font-family:${SANS};font-size:15px;font-weight:700;color:${V2.textHeading};">${name}</p>
            ${headline ? `<p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${V2.textBody};line-height:1.5;">${headline}</p>` : ''}
          </td>
        </tr></table>
        ${meta ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:12px;color:${V2.textMuted};">${meta}</p>` : ''}
        ${specialties ? `<div style="margin-top:8px;">${specialties}</div>` : ''}
        <p style="margin:12px 0 0;"><a href="${trackedUrl}" style="font-family:${SANS};font-size:13px;font-weight:700;color:${V2.teal};text-decoration:underline;">View full profile on PMHNP Hiring</a></p>
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * The digest (and follow-up) email body. Candidate cards show ONLY the
 * privacy-safe fields; the CTA and every card link route through the click
 * tracker into the employer candidates page.
 */
export function buildMatchDigestHtml(args: MatchDigestEmailArgs): string {
  const { baseUrl, jobTitle, candidates, clickToken, unsubscribeToken, isFollowUp, isTest } = args;
  const safeTitle = escapeDigestHtml(jobTitle);
  const count = candidates.length;
  const plural = count === 1 ? 'candidate' : 'candidates';

  const intro = isFollowUp
    ? `A few days ago we matched <strong>${count} ${plural}</strong> to your posting <strong>${safeTitle}</strong>. They are still available to review. Strong candidates move fast, so it is worth a look.`
    : `Our matching engine found <strong>${count} ${plural}</strong> on PMHNP Hiring whose profiles line up with your posting <strong>${safeTitle}</strong>. Review their full profiles and reach out from your dashboard.`;

  const cards = candidates
    .map((c, i) =>
      candidateCardHtml(
        c,
        buildTrackedUrl(baseUrl, clickToken, `/employer/candidates/${c.profileId}`),
        i === candidates.length - 1,
      ),
    )
    .join('');

  const ctaUrl = buildTrackedUrl(baseUrl, clickToken, '/employer/candidates');

  const testBanner = isTest
    ? `<tr><td style="padding:0 40px;">
        <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:10px 16px;text-align:center;">
          <span style="font-family:${SANS};font-size:12px;font-weight:700;color:#92400E;">TEST EMAIL: sent to an admin only. No employer received this.</span>
        </div>
      </td></tr>${spacerV2(16)}`
    : '';

  return emailShellV2(
    `
    ${headerBlockV2(isFollowUp ? 'Your Candidate Matches Are Waiting' : 'New Candidate Matches', '')}
    ${spacerV2(12)}
    ${testBanner}
    ${bodyTextV2(intro)}
    ${spacerV2(20)}
    ${cards}
    ${spacerV2(28)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      ${primaryButtonV2('Review All Matches', ctaUrl)}
    </td></tr>
    ${spacerV2(14)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      <p style="margin:0;font-family:${SANS};font-size:12px;color:${V2.textMuted};line-height:1.6;">Names are shown as first name and last initial. Full profiles, messaging, and resumes are available inside your employer dashboard.</p>
    </td></tr>
    ${spacerV2(48)}
    ${closeContentV2()}`,
    unsubscribeFooterV2(unsubscribeToken),
    // The preheader is interpolated into the shell's HTML exactly like the
    // body is, so it MUST use the escaped title. Using the raw one here was
    // a live HTML-injection hole: an employer controls their own job title.
    isFollowUp
      ? `Reminder: ${count} matched ${plural} for ${safeTitle} are still available.`
      : `${count} PMHNP ${plural} match ${safeTitle}. Review them now.`,
  );
}

// Re-exported so route/service code renders serif copy consistently if needed.
export { SERIF as MATCH_DIGEST_SERIF };
