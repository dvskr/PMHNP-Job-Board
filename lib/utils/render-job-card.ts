/**
 * Single source of truth for the job-card HTML used in alert + saved-job-reminder
 * emails (and the preview catalog mirroring them).
 *
 * Each card has the same shape:
 *   • Accent stripe (cycles by index)
 *   • Avatar + Title + Employer
 *   • Salary badge + optional Featured badge under the title
 *   • Location / JobType / Mode chips
 *   • Freshness text (left) + bulletproof Apply button (right)
 *
 * Apply button uses VML for Outlook + gradient anchor for everyone else.
 */
import { V2, SANS, SERIF } from '@/lib/email-templates-v2';

const COLORS = ['#4DB6AC', '#E8937A', '#7C8CF5', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#10B981', '#F97316', '#6366F1'];

export interface JobCardData {
  title: string;
  employer: string;
  location?: string | null;
  jobType?: string | null;
  mode?: string | null;
  isFeatured?: boolean | null;
  applyOnPlatform?: boolean | null;
  sourceType?: string | null;
  /** Already-formatted salary string, e.g. "$145k–$175k", "$120k+", "Up to $200k". Empty = no badge. */
  salaryText?: string;
  /** Already-formatted freshness, e.g. "2 hours ago", "Posted 5 days ago". Empty = no text. */
  postedText?: string;
  /** Absolute URL to the job page. */
  jobUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function chip(text: string, bg: string, fg: string, border: string): string {
  return `<span style="display:inline-block;padding:5px 14px;border-radius:20px;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.3px;background:${bg};color:${fg};border:1px solid ${border};">${escapeHtml(text)}</span>`;
}

function applyButtonHtml(url: string, label: string): string {
  return `<!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:42px;v-text-anchor:middle;width:140px;" arcsize="40%" stroke="f" fillcolor="#0D9488">
    <w:anchorlock/>
    <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${label}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-- --><a href="${url}" style="display:inline-block;box-sizing:border-box;padding:11px 26px;border-radius:18px;font-family:${SANS};font-size:14px;font-weight:700;color:#fff;-webkit-text-fill-color:#fff;background:#0d9488;background-image:linear-gradient(135deg,#2DD4BF,#0D9488);text-decoration:none;border:1px solid rgba(255,255,255,0.3);box-shadow:0 4px 12px rgba(13,148,136,0.30);mso-hide:all;">${label}</a><!--<![endif]-->`;
}

export function renderJobCardHtml(job: JobCardData, index: number, isLast: boolean): string {
  const color = COLORS[index % COLORS.length];
  const initial = escapeHtml(job.employer.charAt(0).toUpperCase());

  const applyLabel = job.applyOnPlatform
    ? '⚡ Easy Apply'
    : job.sourceType === 'employer'
      ? 'Direct Apply'
      : 'Apply Now ↗';

  // Chip row excludes location — that now sits inline with the salary badge.
  const chips: string[] = [];
  if (job.jobType) chips.push(chip(job.jobType, '#F3F6F4', '#374151', '#E0E5E1'));
  if (job.mode) {
    const isRemote = job.mode.toLowerCase().includes('remote');
    chips.push(chip(job.mode, isRemote ? '#ECFDF5' : '#F3F6F4', isRemote ? '#065F46' : '#374151', isRemote ? '#A7F3D0' : '#E0E5E1'));
  }

  return `
    <tr><td style="padding:0 40px ${isLast ? '0' : '16px'};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <tr><td style="height:4px;background:${color};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:20px 20px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td width="48" valign="top" style="width:48px;padding-right:14px;">
              <div style="width:48px;height:48px;border-radius:12px;background:${color};color:#fff;font-size:20px;font-weight:700;text-align:center;line-height:48px;">${initial}</div>
            </td>
            <td valign="top" style="width:auto;">
              <a href="${job.jobUrl}" style="font-family:${SERIF};font-size:18px;font-weight:700;color:${V2.textHeading};text-decoration:none;line-height:1.3;display:block;">${escapeHtml(job.title)}</a>
              <p style="margin:4px 0 0;font-family:${SANS};font-size:13px;font-weight:500;color:${V2.textMuted};">${escapeHtml(job.employer)}</p>
            </td>
          </tr></table>
          ${(job.salaryText || job.isFeatured || job.location) ? `<div style="margin-top:12px;">
            ${job.salaryText ? `<span style="display:inline-block;padding:6px 14px;border-radius:8px;font-family:${SANS};font-size:14px;font-weight:700;background:#E6FAF8;color:#0d9488;margin-right:6px;vertical-align:middle;">${escapeHtml(job.salaryText)}</span>` : ''}
            ${job.location ? `<span style="display:inline-block;padding:6px 12px;border-radius:8px;font-family:${SANS};font-size:13px;font-weight:600;background:#F3F6F4;color:#4A5568;border:1px solid #E0E5E1;margin-right:6px;vertical-align:middle;">${escapeHtml(job.location)}</span>` : ''}
            ${job.isFeatured ? `<span style="display:inline-block;padding:6px 12px;border-radius:8px;font-family:${SANS};font-size:12px;font-weight:700;background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;letter-spacing:0.3px;text-transform:uppercase;vertical-align:middle;">★ Featured</span>` : ''}
          </div>` : ''}
          ${chips.length > 0 ? `<div style="border-top:1px solid #F0F3F1;margin:14px 0;"></div>
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            ${chips.map((c, i) => `<td${i < chips.length - 1 ? ' style="padding-right:6px;"' : ''}>${c}</td>`).join('')}
          </tr></table>` : ''}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;"><tr>
            <td valign="middle">${job.postedText ? `<p style="margin:0;font-family:${SANS};font-size:12px;font-weight:500;color:#9CA3AF;">${escapeHtml(job.postedText)}</p>` : '&nbsp;'}</td>
            <td align="right" valign="middle">
              ${applyButtonHtml(job.jobUrl, applyLabel)}
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>`;
}
