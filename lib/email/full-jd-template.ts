/**
 * "The Full Brief": one job, the whole description, one apply button.
 *
 * A separate format from the daily digest, for people who would rather decide
 * from the email than click through to decide. It only runs on employer
 * postings, because those hold author-written HTML sanitized at save time;
 * aggregator rows are plain text of wildly varying quality with a 50 character
 * floor, and this layout wrapped around two sentences of boilerplate looks
 * broken in a way the digest never does.
 *
 * Structure, in the order the reader needs it:
 *   hero (role, employer) -> snapshot strip (pay, place, schedule) ->
 *   description -> screening questions -> one apply button -> why you got this
 *
 * There is deliberately no second call to action competing with the apply
 * button, and no "view more jobs" link above it.
 */

import {
  emailShellV2, headerBlockV2, primaryButtonV2,
  spacerV2, closeContentV2, V2, SANS, SERIF,
} from '@/lib/email-templates-v2';
import { escapeHtml } from '@/lib/sanitize';
import { buildJdBodyHtml, type JdBody } from '@/lib/email/jd-body';

export interface FullJdJob {
  id: string;
  title: string;
  employer: string;
  location: string;
  description: string;
  jobType?: string | null;
  mode?: string | null;
  experienceLabel?: string | null;
  normalizedMinSalary?: number | null;
  normalizedMaxSalary?: number | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  /** Shaped as Prisma returns it, so no mapping layer can silently drop it. */
  screeningQuestions?: { questionText: string }[];
}

export interface FullJdEmail {
  subject: string;
  html: string;
  preheader: string;
}

function k(primary?: number | null, fallback?: number | null): number {
  const v = primary || fallback;
  return v && v > 0 ? Math.round(v / 1000) : 0;
}

/** "$168k to $195k", "$168k and up", or empty when nothing was published. */
export function formatPayRange(job: FullJdJob): string {
  const lo = k(job.normalizedMinSalary, job.minSalary);
  const hi = k(job.normalizedMaxSalary, job.maxSalary);
  if (lo && hi && lo !== hi) return `$${lo}k to $${hi}k`;
  if (lo) return `$${lo}k and up`;
  if (hi) return `Up to $${hi}k`;
  return '';
}

/** One cell of the snapshot strip. */
function statCell(label: string, value: string, last: boolean, accent = false): string {
  const edge = last ? '' : `border-right:1px solid ${V2.borderLight};`;
  return `<td valign="top" class="stat-cell" style="padding:13px 16px;${edge}">
    <div style="font-family:${SANS};font-size:9.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${V2.textFaded};">${escapeHtml(label)}</div>
    <div style="font-family:${SANS};font-size:15px;font-weight:700;color:${accent ? V2.teal : V2.textPrimary};margin-top:5px;">${escapeHtml(value)}</div>
  </td>`;
}

/**
 * The screening block.
 *
 * The strongest thing this email has that a job aggregator's cannot copy:
 * the questions the employer will actually ask on the application. Capped at
 * six so a long questionnaire does not push the apply button past Gmail's
 * clipping threshold.
 */
function screeningBlock(questions: { questionText: string }[]): string {
  const usable = questions.filter((q) => q.questionText && q.questionText.trim());
  if (!usable.length) return '';
  const shown = usable.slice(0, 6);
  const items = shown
    .map((q) => `<li style="margin:0 0 6px;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${V2.textBody};">${escapeHtml(q.questionText)}</li>`)
    .join('');
  const more = usable.length > shown.length
    ? `<p style="margin:9px 0 0;font-family:${SANS};font-size:12px;color:${V2.textMuted};">${usable.length - shown.length} more on the application form.</p>`
    : '';

  return `${spacerV2(24)}
  <tr><td class="content-pad" style="padding:0 40px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${V2.bgCardAlt};border:1px solid ${V2.borderLight};border-radius:10px;">
      <tr><td style="padding:17px 19px;">
        <div style="font-family:${SANS};font-size:10.5px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${V2.textMuted};">They will ask you</div>
        <p style="margin:6px 0 0;font-family:${SANS};font-size:13px;color:${V2.textMuted};line-height:1.6;">Worth having answers ready before you start.</p>
        <ol style="margin:12px 0 0;padding-left:19px;">${items}</ol>
        ${more}
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * Compose the email.
 *
 * Returns the preheader separately because it is the second line of the inbox
 * listing and deserves to be written, not inherited from whatever text the
 * body happens to open with.
 */
export function buildFullJdEmail(args: {
  job: FullJdJob;
  jobUrl: string;
  alertToken: string;
  criteriaText: string;
  manageUrl: string;
}): FullJdEmail {
  const { job, jobUrl, alertToken, criteriaText, manageUrl } = args;

  const pay = formatPayRange(job);
  const body: JdBody = buildJdBodyHtml(job.description);

  const stats: string[] = [];
  if (pay) stats.push(statCell('Advertised', pay, false, true));
  stats.push(statCell('Where', job.location, !job.jobType));
  if (job.jobType) stats.push(statCell('Schedule', job.jobType, true));

  const chips: string[] = [];
  if (job.mode) chips.push(job.mode);
  if (job.experienceLabel) chips.push(job.experienceLabel);
  const chipRow = chips.length
    ? `<tr><td class="content-pad" style="padding:0 40px;">
        <div style="margin-top:14px;">${chips.map((c) =>
          `<span style="font-family:${SANS};font-size:12px;font-weight:600;color:#374151;background-color:#F3F6F4;border:1px solid #E0E5E1;border-radius:10px;padding:4px 11px;">${escapeHtml(c)}</span>`
        ).join('&nbsp;')}</div>
      </td></tr>`
    : '';

  const readMore = body.truncated
    ? `<tr><td class="content-pad" style="padding:0 40px;">
        <p style="margin:6px 0 0;font-family:${SANS};font-size:13px;color:${V2.textMuted};line-height:1.6;">
          This posting continues. <a href="${jobUrl}" style="color:${V2.teal};text-decoration:underline;">Read the rest on the site</a>.
        </p>
      </td></tr>`
    : '';

  const subject = pay
    ? `${job.title} at ${job.employer}, ${pay}`
    : `${job.title} at ${job.employer}`;

  // Deduped, because location and mode overlap constantly: a remote Texas
  // role has location "Remote, TX" and mode "Remote", and the naive join
  // read "Remote, TX, Full-time, Remote" in the inbox listing.
  const parts: string[] = [];
  for (const raw of [job.location, job.jobType, job.mode]) {
    const part = (raw ?? '').trim();
    if (!part) continue;
    const seen = parts.some(
      (p) => p.toLowerCase() === part.toLowerCase() || p.toLowerCase().includes(part.toLowerCase()),
    );
    if (!seen) parts.push(part);
  }
  const preheader = `${parts.join(', ')}. Full description inside.`;

  const html = emailShellV2(`
      ${headerBlockV2('A role worth reading', '')}
      ${spacerV2(18)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <p style="margin:0;font-family:${SANS};font-size:11px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:2px;">Matches your alert</p>
        <h2 style="margin:10px 0 0;font-family:${SERIF};font-size:26px;font-weight:600;color:${V2.textHeading};line-height:1.22;letter-spacing:-0.01em;">${escapeHtml(job.title)}</h2>
        <p style="margin:9px 0 0;font-family:${SANS};font-size:15px;color:${V2.textBody};">${escapeHtml(job.employer)}</p>
      </td></tr>
      ${chipRow}
      ${spacerV2(20)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${V2.bgElevated};border:1px solid ${V2.borderLight};border-radius:10px;">
          <tr class="stack">${stats.join('')}</tr>
        </table>
      </td></tr>
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;">${body.html}</td></tr>
      ${readMore}
      ${screeningBlock(job.screeningQuestions ?? [])}
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Apply on PMHNP Hiring', jobUrl)}
      </td></tr>
      ${spacerV2(18)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr><td style="border-top:1px solid ${V2.borderLight};padding-top:15px;">
            <p style="margin:0;font-family:${SANS};font-size:12px;color:${V2.textFaded};line-height:1.65;">
              You are getting the full description because your alert is set to full posting for
              <strong style="color:${V2.textMuted};">${escapeHtml(criteriaText)}</strong>.
              <a href="${manageUrl}" style="color:${V2.textMuted};text-decoration:underline;">Switch back to the daily brief</a>.
            </p>
          </td></tr>
        </table>
      </td></tr>
      ${spacerV2(40)}
      ${closeContentV2()}`,
    `<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;color:${V2.textMuted};">
      <a href="${manageUrl}" style="color:${V2.textMuted};text-decoration:underline;">Manage alert</a>
      &nbsp;&middot;&nbsp;
      <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'}/job-alerts/unsubscribe?token=${alertToken}" style="color:${V2.textMuted};text-decoration:underline;">Delete alert</a>
    </p>`,
    preheader,
  );

  return { subject, html, preheader };
}
