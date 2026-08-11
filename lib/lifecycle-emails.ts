/**
 * lib/lifecycle-emails.ts — product/lifecycle email registry + eligibility.
 *
 * Code-defined registry of one-time lifecycle emails for both audiences
 * (employer + candidate). Each entry declares:
 *   - id           stable identifier, also the LifecycleEmailSend.emailId key
 *   - audience     'employer' | 'candidate'
 *   - subject      subject line builder
 *   - buildHtml    V2 "Warm Diorama" HTML builder (pure, no DB access)
 *   - findEligible Prisma query returning users inside the trigger window
 *
 * SENDING RULES (enforced by the cron via isSendable + claim-first writes):
 *   - An emailId is sent AT MOST ONCE per user, ever (LifecycleEmailSend
 *     @@unique([userId, emailId])).
 *   - Max 1 lifecycle/marketing email per user per SHARED_MARKETING_CAP_DAYS
 *     across ALL new email types (lifecycle + match digests + system
 *     messages), checked against both LifecycleEmailSend and EmailSend.
 *   - Suppressed addresses (EmailLead.isSuppressed / UserProfile.
 *     emailSuppressed) are never mailed.
 *   - Every trigger window has an UPPER bound (maxDays) so first enablement
 *     does not blast the entire historical user base.
 *
 * This module is deliberately free of side effects: it does not import
 * lib/email-service (the vitest harness globally mocks that module), so the
 * registry and its HTML builders stay unit-testable. Sending lives in
 * app/api/cron/lifecycle-emails/route.ts, gated on ENABLE_LIFECYCLE_EMAILS.
 */
import { prisma } from '@/lib/prisma';
import { brand } from '@/config/brand';
import {
  CONNECT_LIFECYCLE_EMAIL_TYPES,
  SHARED_LIFECYCLE_CAP_DAYS,
} from '@/lib/email/match-digest-policy';
import {
  emailShellV2,
  headerBlockV2,
  primaryButtonV2,
  spacerV2,
  closeContentV2,
  unsubscribeFooterV2,
  infoCardV2,
  featureRowV2,
  V2,
  SANS,
  SERIF,
} from '@/lib/email-templates-v2';

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl).replace(/\/$/, '');

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shared frequency cap: max 1 lifecycle/marketing email per user per 7 days
 * across ALL new connect-feature email types. The single source of truth for
 * both the day count and the emailType list is lib/email/match-digest-policy.ts
 * (CONNECT_LIFECYCLE_EMAIL_TYPES includes 'lifecycle'); every sender checks
 * that one list against EmailSend rows.
 */
export const SHARED_MARKETING_CAP_DAYS = SHARED_LIFECYCLE_CAP_DAYS;
export const SHARED_MARKETING_CAP_EMAIL_TYPES: readonly string[] =
  CONNECT_LIFECYCLE_EMAIL_TYPES;

/** Upper bound on sends per cron run, keeps the daily run inside maxDuration. */
export const MAX_SENDS_PER_RUN = 200;

// ─── Registry types ──────────────────────────────────────────────────────────

export type LifecycleAudience = 'employer' | 'candidate';

export type LifecycleEmailId =
  | 'employer_day2_screening'
  | 'employer_day7_talent'
  | 'employer_expired_renewal'
  | 'candidate_day2_alert'
  | 'candidate_day7_resume'
  | 'candidate_day14_visibility';

export interface LifecycleEmailContext {
  firstName?: string | null;
  jobTitle?: string | null;
  jobId?: string | null;
  expiredAt?: Date | null;
}

export interface LifecycleTarget {
  /** UserProfile.id (NOT supabaseId) — the LifecycleEmailSend anchor. */
  userId: string;
  email: string;
  ctx: LifecycleEmailContext;
}

export interface LifecycleEmailDef {
  id: LifecycleEmailId;
  audience: LifecycleAudience;
  /** Admin console label. */
  label: string;
  subject: (ctx: LifecycleEmailContext) => string;
  buildHtml: (ctx: LifecycleEmailContext) => string;
  /** Realistic fictional context for admin previews and test sends. */
  sampleContext: LifecycleEmailContext;
  findEligible: (now: Date) => Promise<LifecycleTarget[]>;
}

// ─── Trigger windows ─────────────────────────────────────────────────────────
//
// minDays: how long after the anchor event the email becomes due.
// maxDays: staleness cutoff — anchors older than this are never mailed, so
//          flipping ENABLE_LIFECYCLE_EMAILS on for the first time cannot
//          blast the entire historical base in one run.

export interface TriggerWindow {
  minDays: number;
  maxDays: number;
}

export const LIFECYCLE_WINDOWS: Record<LifecycleEmailId, TriggerWindow> = {
  employer_day2_screening: { minDays: 2, maxDays: 30 },
  employer_day7_talent: { minDays: 7, maxDays: 35 },
  employer_expired_renewal: { minDays: 3, maxDays: 30 },
  candidate_day2_alert: { minDays: 2, maxDays: 30 },
  candidate_day7_resume: { minDays: 7, maxDays: 35 },
  candidate_day14_visibility: { minDays: 14, maxDays: 45 },
};

/** True when `anchor` falls inside [now - maxDays, now - minDays]. */
export function isWithinTriggerWindow(anchor: Date, now: Date, window: TriggerWindow): boolean {
  const age = now.getTime() - anchor.getTime();
  return age >= window.minDays * DAY_MS && age <= window.maxDays * DAY_MS;
}

/** Date bounds for a window: anchor must satisfy earliest <= anchor <= latest. */
export function windowBounds(now: Date, window: TriggerWindow): { earliest: Date; latest: Date } {
  return {
    earliest: new Date(now.getTime() - window.maxDays * DAY_MS),
    latest: new Date(now.getTime() - window.minDays * DAY_MS),
  };
}

// ─── Send-gate predicate (pure, unit-tested) ─────────────────────────────────

export interface SendGateInputs {
  emailId: LifecycleEmailId;
  /** emailIds ever recorded in LifecycleEmailSend for this user. */
  alreadySentEmailIds: ReadonlySet<string>;
  /** Most recent LifecycleEmailSend.sentAt for this user, any emailId. */
  lastLifecycleSentAt: Date | null;
  /** True when EmailSend has a row for this address within the cap window
   *  with emailType in SHARED_MARKETING_CAP_EMAIL_TYPES. */
  recentSharedMarketingSend: boolean;
  /** EmailLead.isSuppressed OR UserProfile.emailSuppressed. */
  suppressed: boolean;
  /** True when an earlier registry entry already selected this user this run. */
  alreadySelectedThisRun: boolean;
  now: Date;
}

export function isSendable(i: SendGateInputs): { ok: boolean; reason?: string } {
  if (i.suppressed) return { ok: false, reason: 'suppressed' };
  if (i.alreadySentEmailIds.has(i.emailId)) return { ok: false, reason: 'already_sent' };
  if (i.alreadySelectedThisRun) return { ok: false, reason: 'one_per_run' };
  const capCutoff = i.now.getTime() - SHARED_MARKETING_CAP_DAYS * DAY_MS;
  if (i.lastLifecycleSentAt && i.lastLifecycleSentAt.getTime() >= capCutoff) {
    return { ok: false, reason: 'lifecycle_7d_cap' };
  }
  if (i.recentSharedMarketingSend) return { ok: false, reason: 'shared_marketing_7d_cap' };
  return { ok: true };
}

// ─── HTML building blocks (V2 house style) ───────────────────────────────────

/** Local escape — this module must not import lib/email-service (globally
 *  mocked in the vitest harness), so it carries its own 5-line escaper. */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function greeting(firstName?: string | null): string {
  return firstName ? `Hi ${esc(firstName)},` : 'Hi there,';
}

function para(html: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF};font-size:17px;color:${V2.textBody};line-height:1.7;text-align:center;">${html}</p></td></tr>`;
}

function featureList(rows: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>`;
}

function ctaBlock(label: string, url: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;text-align:center;">${primaryButtonV2(label, url)}</td></tr>`;
}

function textLink(html: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textMuted};line-height:1.6;">${html}</p></td></tr>`;
}

function lifecycleShell(title: string, inner: string, preheader: string): string {
  return emailShellV2(
    `${headerBlockV2(title, '')}${spacerV2(12)}${inner}${spacerV2(48)}${closeContentV2()}`,
    unsubscribeFooterV2('sample'),
    preheader,
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Shared eligibility fragments ────────────────────────────────────────────

const MAILABLE_PROFILE = { deletedAt: null, emailSuppressed: false } as const;

/** First-post anchor per employer: min(EmployerJob.createdAt) grouped by the
 *  posting account. EmployerJob.userId references UserProfile.supabaseId. */
async function firstPostAnchors(): Promise<Map<string, Date>> {
  const groups = await prisma.employerJob.groupBy({
    by: ['userId'],
    where: { userId: { not: null } },
    _min: { createdAt: true },
  });
  const anchors = new Map<string, Date>();
  for (const g of groups) {
    if (g.userId && g._min.createdAt) anchors.set(g.userId, g._min.createdAt);
  }
  return anchors;
}

async function employerProfilesBySupabaseIds(
  supabaseIds: string[],
  extraWhere: Record<string, unknown> = {},
): Promise<Array<{ id: string; supabaseId: string; email: string; firstName: string | null }>> {
  if (supabaseIds.length === 0) return [];
  return prisma.userProfile.findMany({
    where: {
      supabaseId: { in: supabaseIds },
      role: 'employer',
      ...MAILABLE_PROFILE,
      ...extraWhere,
    },
    select: { id: true, supabaseId: true, email: true, firstName: true },
  });
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const LIFECYCLE_EMAILS: LifecycleEmailDef[] = [
  // ── EMPLOYER: day 2 after first post — screening questions + Easy Apply ──
  {
    id: 'employer_day2_screening',
    audience: 'employer',
    label: 'Employer day 2: screening questions and Easy Apply',
    subject: () => 'Qualify applicants faster with screening questions and Easy Apply',
    sampleContext: { firstName: 'Jordan' },
    buildHtml: (ctx) =>
      lifecycleShell(
        'Hear From the Right Candidates Sooner',
        [
          para(
            `${greeting(ctx.firstName)} your posting is live. Two built in tools help you separate strong applicants from the rest before you spend time on calls.`,
          ),
          spacerV2(24),
          featureList(
            featureRowV2(
              '&#10067;',
              'Screening questions',
              'Ask about licensure, availability, and experience up front. Answers arrive attached to every application, so you can shortlist in minutes instead of scheduling exploratory calls.',
            ) +
              featureRowV2(
                '&#9889;',
                'Easy Apply',
                'Candidates apply on the platform with a structured profile, so every application lands in your dashboard in the same clean format.',
              ),
          ),
          spacerV2(28),
          ctaBlock('Update Your Posting', `${BASE_URL}/employer/dashboard`),
        ].join(''),
        'Add screening questions and Easy Apply to your live posting.',
      ),
    findEligible: async (now) => {
      const window = LIFECYCLE_WINDOWS.employer_day2_screening;
      const anchors = await firstPostAnchors();
      const due = [...anchors.entries()].filter(([, anchor]) =>
        isWithinTriggerWindow(anchor, now, window),
      );
      const profiles = await employerProfilesBySupabaseIds(due.map(([sid]) => sid));
      return profiles.map((p) => ({
        userId: p.id,
        email: p.email,
        ctx: { firstName: p.firstName },
      }));
    },
  },

  // ── EMPLOYER: day 7 after first post — candidate database + AI talent search ──
  {
    id: 'employer_day7_talent',
    audience: 'employer',
    label: 'Employer day 7: candidate database and AI talent search',
    subject: () => 'Your active posting unlocks candidate search',
    sampleContext: { firstName: 'Jordan' },
    buildHtml: (ctx) =>
      lifecycleShell(
        'Search Candidates While Your Posting Is Active',
        [
          para(
            `${greeting(ctx.firstName)} your active posting includes access to the candidate database. Browse visible PMHNP profiles, or let AI talent search rank candidates against your job description.`,
          ),
          spacerV2(20),
          infoCardV2(
            `<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">What you see</p>` +
              `<p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textPrimary};line-height:1.6;">Each visible candidate appears as a first name and last initial, with their headline, license states, specialties, and years of experience. Contact details and resume files stay locked until you unlock a candidate from the dashboard, which uses one of your unlocks.</p>`,
          ),
          spacerV2(28),
          ctaBlock('Try AI Talent Search', `${BASE_URL}/employer/talent-search`),
          spacerV2(16),
          textLink(
            `Prefer to browse? <a href="${BASE_URL}/employer/candidates" style="color:${V2.teal};text-decoration:underline;">Open the candidate database</a>.`,
          ),
        ].join(''),
        'Browse the candidate database and AI talent search while your posting is active.',
      ),
    findEligible: async (now) => {
      const window = LIFECYCLE_WINDOWS.employer_day7_talent;
      const anchors = await firstPostAnchors();
      const due = [...anchors.entries()].filter(([, anchor]) =>
        isWithinTriggerWindow(anchor, now, window),
      );
      // Gate on an ACTIVE posting: talent tools are tied to it, and the copy
      // says so. Published + not yet expired.
      const profiles = await employerProfilesBySupabaseIds(
        due.map(([sid]) => sid),
        {
          employerJobs: {
            some: {
              job: {
                isPublished: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        },
      );
      return profiles.map((p) => ({
        userId: p.id,
        email: p.email,
        ctx: { firstName: p.firstName },
      }));
    },
  },

  // ── EMPLOYER: posting expired 3+ days ago, not renewed ──
  {
    id: 'employer_expired_renewal',
    audience: 'employer',
    label: 'Employer: posting expired 3 days ago without renewal',
    subject: (ctx) =>
      ctx.jobTitle
        ? `Your posting for "${ctx.jobTitle}" has expired: renewing puts it back in front of candidates`
        : 'Your posting has expired: renewing puts it back in front of candidates',
    sampleContext: {
      firstName: 'Jordan',
      jobTitle: 'Psychiatric Mental Health Nurse Practitioner',
      jobId: 'sample-job-id',
      expiredAt: new Date('2026-01-15T00:00:00Z'),
    },
    buildHtml: (ctx) => {
      const renewTarget = ctx.jobId
        ? `/employer/dashboard?renew=${encodeURIComponent(ctx.jobId)}`
        : '/employer/dashboard';
      const renewUrl = `${BASE_URL}/login?role=employer&redirectTo=${encodeURIComponent(renewTarget)}`;
      const expiredLine = ctx.expiredAt ? ` on ${formatDate(ctx.expiredAt)}` : '';
      return lifecycleShell(
        'Your Posting Has Expired',
        [
          para(
            `${greeting(ctx.firstName)} your posting${ctx.jobTitle ? ` for <strong>${esc(ctx.jobTitle)}</strong>` : ''} expired${expiredLine}. It is no longer visible to candidates browsing the board.`,
          ),
          spacerV2(20),
          infoCardV2(
            `<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">What renewing re-triggers</p>` +
              `<p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textPrimary};line-height:1.6;">Your listing returns to search and browse. Job alert subscribers whose filters match receive it in their next digest, and it re-enters AI search and candidate recommendations.</p>`,
          ),
          spacerV2(28),
          ctaBlock('Renew Your Listing', renewUrl),
        ].join(''),
        'Your posting expired. Renewing puts it back in front of candidates.',
      );
    },
    findEligible: async (now) => {
      const window = LIFECYCLE_WINDOWS.employer_expired_renewal;
      const { earliest, latest } = windowBounds(now, window);
      // A renewal moves Job.expiresAt into the future, so "expiresAt still in
      // the 3-to-30-days-ago band" IS the not-renewed condition. No role
      // filter: anyone who posted can renew.
      //
      // Deliberately NOT filtering on isPublished: /api/cron/cleanup-expired
      // force-unpublishes every listing the moment it expires, so requiring
      // isPublished:true would match nothing. archivedAt IS the right signal
      // for "the employer took this down on purpose" (filled the role, pulled
      // the req) — that write is only made by the employer archive action, and
      // pitching a renewal at it would be tone deaf.
      const rows = await prisma.employerJob.findMany({
        where: {
          userId: { not: null },
          user: { is: MAILABLE_PROFILE },
          job: { expiresAt: { gte: earliest, lte: latest }, archivedAt: null },
        },
        select: {
          userId: true,
          user: { select: { id: true, email: true, firstName: true } },
          job: { select: { id: true, title: true, expiresAt: true } },
        },
      });
      // One target per user: keep the most recently expired posting.
      const byUser = new Map<string, LifecycleTarget>();
      for (const row of rows) {
        if (!row.user) continue;
        const existing = byUser.get(row.user.id);
        const existingExpiredAt = existing?.ctx.expiredAt?.getTime() ?? 0;
        const thisExpiredAt = row.job.expiresAt?.getTime() ?? 0;
        if (!existing || thisExpiredAt > existingExpiredAt) {
          byUser.set(row.user.id, {
            userId: row.user.id,
            email: row.user.email,
            ctx: {
              firstName: row.user.firstName,
              jobTitle: row.job.title,
              jobId: row.job.id,
              expiredAt: row.job.expiresAt,
            },
          });
        }
      }
      return [...byUser.values()];
    },
  },

  // ── CANDIDATE: day 2 after signup, no job alert yet ──
  {
    id: 'candidate_day2_alert',
    audience: 'candidate',
    label: 'Candidate day 2: no job alert yet',
    subject: () => 'Set a job alert: your filters, your cadence',
    sampleContext: { firstName: 'Casey' },
    buildHtml: (ctx) =>
      lifecycleShell(
        'Let the Right Jobs Come to You',
        [
          para(
            `${greeting(ctx.firstName)} new PMHNP roles land on the board every day. A job alert delivers the ones that match your filters straight to your inbox, on the cadence you choose.`,
          ),
          spacerV2(24),
          featureList(
            featureRowV2(
              '&#127919;',
              'Your filters',
              'Location, salary range, work mode, job type, and experience level. Only roles that fit come through.',
            ) +
              featureRowV2(
                '&#128197;',
                'Your cadence',
                'Daily or weekly digests, whichever suits how actively you are looking.',
              ) +
              featureRowV2(
                '&#9993;&#65039;',
                'One click to stop',
                'Pause or unsubscribe any time from the link in every email.',
              ),
          ),
          spacerV2(28),
          ctaBlock('Set Up Your Alert', `${BASE_URL}/job-alerts`),
        ].join(''),
        'Set a job alert with your filters and cadence.',
      ),
    findEligible: async (now) => {
      const window = LIFECYCLE_WINDOWS.candidate_day2_alert;
      const { earliest, latest } = windowBounds(now, window);
      const profiles = await prisma.userProfile.findMany({
        where: {
          role: 'job_seeker',
          ...MAILABLE_PROFILE,
          createdAt: { gte: earliest, lte: latest },
        },
        select: { id: true, email: true, firstName: true },
      });
      if (profiles.length === 0) return [];
      // "Without an alert" means no JobAlert row at all for their address,
      // confirmed or not: an unconfirmed alert still means they set one up.
      //
      // Matched case-insensitively on BOTH sides. /api/job-alerts lowercases
      // the address before writing JobAlert, but UserProfile.email keeps
      // whatever case the account was created with, so an exact `in` match
      // silently misses those users and tells someone who already has an
      // alert to go set one up — burning their one-shot slot on wrong advice.
      // The `in` list carries both forms so the lookup still hits the index.
      const emailForms = [
        ...new Set(profiles.flatMap((p) => [p.email, p.email.toLowerCase()])),
      ];
      const alerts = await prisma.jobAlert.findMany({
        where: { email: { in: emailForms } },
        select: { email: true },
      });
      const withAlert = new Set(alerts.map((a) => a.email.toLowerCase()));
      return profiles
        .filter((p) => !withAlert.has(p.email.toLowerCase()))
        .map((p) => ({ userId: p.id, email: p.email, ctx: { firstName: p.firstName } }));
    },
  },

  // ── CANDIDATE: day 7 after signup, no resume ──
  {
    id: 'candidate_day7_resume',
    audience: 'candidate',
    label: 'Candidate day 7: no resume yet',
    subject: () => 'Build your resume once, tailor it in minutes',
    sampleContext: { firstName: 'Casey' },
    buildHtml: (ctx) =>
      lifecycleShell(
        'Your Resume, Ready When You Are',
        [
          para(
            `${greeting(ctx.firstName)} Resume Studio lives in your dashboard. Build a clean PMHNP resume, score it against what hiring teams look for, and tailor it to a specific posting when you are ready to apply.`,
          ),
          spacerV2(24),
          featureList(
            featureRowV2(
              '&#128221;',
              'Build',
              'Guided sections for licenses, certifications, education, and clinical experience. No blank page.',
            ) +
              featureRowV2(
                '&#128202;',
                'Score',
                'A rubric check highlights gaps and quick wins before an employer ever sees it.',
              ) +
              featureRowV2(
                '&#127919;',
                'Tailor',
                'Adapt your resume to a specific job posting so the fit is obvious at a glance.',
              ),
          ),
          spacerV2(28),
          ctaBlock('Open Resume Studio', `${BASE_URL}/dashboard/resume-studio`),
        ].join(''),
        'Build, score, and tailor your PMHNP resume in Resume Studio.',
      ),
    findEligible: async (now) => {
      const window = LIFECYCLE_WINDOWS.candidate_day7_resume;
      const { earliest, latest } = windowBounds(now, window);
      const profiles = await prisma.userProfile.findMany({
        where: {
          role: 'job_seeker',
          ...MAILABLE_PROFILE,
          createdAt: { gte: earliest, lte: latest },
          resumeUrl: null,
          resumeDocuments: { none: {} },
        },
        select: { id: true, email: true, firstName: true },
      });
      return profiles.map((p) => ({
        userId: p.id,
        email: p.email,
        ctx: { firstName: p.firstName },
      }));
    },
  },

  // ── CANDIDATE: day 14, has a resume but profile is hidden ──
  {
    id: 'candidate_day14_visibility',
    audience: 'candidate',
    label: 'Candidate day 14: resume uploaded, profile hidden',
    subject: () => 'Turn on profile visibility so matching employers can find you',
    sampleContext: { firstName: 'Casey' },
    buildHtml: (ctx) =>
      lifecycleShell(
        'Let Matching Employers Find You',
        [
          para(
            `${greeting(ctx.firstName)} your resume is in. With profile visibility on, employers hiring PMHNPs can find you in candidate search and start a conversation. Your profile is currently hidden from them.`,
          ),
          spacerV2(20),
          infoCardV2(
            // HONESTY GATE: this card is the consent statement that persuades a
            // candidate to switch profileVisible on, so it must describe the
            // real product. It previously claimed employers never see the email
            // address or resume file. That is false: an employer with an active
            // posting can unlock a visible profile
            // (app/api/employer/candidates/[id]) and the unlock reveals the
            // contact email and mints a signed resume download
            // (app/api/employer/candidates/[id]/resume). Describe the browse
            // view and the unlock step separately, and promise nothing the code
            // does not enforce.
            `<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">What employers see when they browse</p>` +
              `<p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textPrimary};line-height:1.6;">Your first name and last initial, your headline, license states, specialties, and years of experience. Your contact details and resume file are not in that view. An employer with an active posting has to unlock your profile to reach those, which uses one of their unlocks and is recorded against their account. You decide which conversations to answer, and you can switch visibility off again any time.</p>`,
          ),
          spacerV2(28),
          ctaBlock('Review Visibility Settings', `${BASE_URL}/settings`),
        ].join(''),
        'Turn on profile visibility so matching employers can find you.',
      ),
    findEligible: async (now) => {
      const window = LIFECYCLE_WINDOWS.candidate_day14_visibility;
      const { earliest, latest } = windowBounds(now, window);
      const profiles = await prisma.userProfile.findMany({
        where: {
          role: 'job_seeker',
          ...MAILABLE_PROFILE,
          createdAt: { gte: earliest, lte: latest },
          profileVisible: false,
          OR: [{ resumeUrl: { not: null } }, { resumeDocuments: { some: {} } }],
        },
        select: { id: true, email: true, firstName: true },
      });
      return profiles.map((p) => ({
        userId: p.id,
        email: p.email,
        ctx: { firstName: p.firstName },
      }));
    },
  },
];

export function getLifecycleEmail(id: string): LifecycleEmailDef | undefined {
  return LIFECYCLE_EMAILS.find((def) => def.id === id);
}
