import { NextRequest, NextResponse } from 'next/server';
import {
  emailShell,
  headerBlock,
  primaryButton,
  secondaryButton,
  infoCard,
  buildContactConfirmationHtml,
  buildContactNotificationHtml,
  buildSalaryGuideHtml,
} from '@/lib/email-service';

const BASE_URL = 'https://pmhnphiring.com';
const F = "Arial, Helvetica, sans-serif";

// Color tokens (mirror email-service.ts)
const C = {
  bgBody: '#060E18',
  bgCard: '#0F1923',
  bgCardAlt: '#162231',
  bgElevated: '#1E293B',
  textPrimary: '#F1F5F9',
  textSecondary: '#E2E8F0',
  textMuted: '#94A3B8',
  textFaded: '#64748B',
  textDimmed: '#475569',
  teal: '#2DD4BF',
  tealDark: '#14B8A6',
  tealDarker: '#0D9488',
  tealDeep: '#0F766E',
  emerald: '#34D399',
  emeraldDark: '#059669',
  green: '#10B981',
  amber: '#F59E0B',
  amberDark: '#D97706',
  amberDeep: '#92400E',
  blue: '#3B82F6',
  borderLight: '#1E293B',
  borderMed: '#334155',
};

// ─── Helper functions ─────────────────────────────────────────────────────────

function amberHeader(title: string, subtitle: string = ''): string {
  return `
          <tr>
            <td style="padding: 28px 40px 24px; text-align: center; border-bottom: 1px solid ${C.borderLight};">
              <img src="${BASE_URL}/logo.png" width="60" height="60" alt="PMHNP Hiring" style="display: block; width: 60px; height: 60px; margin: 0 auto 14px;" />
              <h1 style="margin: 0; font-family: ${F}; font-size: 22px; font-weight: bold; color: ${C.textPrimary}; line-height: 1.3;">
                ${title}
              </h1>
              ${subtitle ? `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 14px; color: ${C.amber};">${subtitle}</p>` : ''}
            </td>
          </tr>`;
}

function featureRow(icon: string, title: string, desc: string): string {
  return `<tr>
    <td style="padding: 10px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td width="40" valign="top" style="padding-right: 12px;">
            <div style="width: 36px; height: 36px; background-color: ${C.bgCardAlt}; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px; border: 1px solid ${C.borderLight};">${icon}</div>
          </td>
          <td valign="top">
            <p style="margin: 0; font-family: ${F}; font-size: 14px; font-weight: bold; color: ${C.textPrimary};">${title}</p>
            <p style="margin: 2px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted}; line-height: 1.5;">${desc}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function sectionLabel(text: string, color: string = C.textMuted): string {
  return `<p style="margin: 0 0 6px; font-family: ${F}; font-size: 11px; font-weight: bold; color: ${color}; text-transform: uppercase; letter-spacing: 1px;">${text}</p>`;
}

function salaryBadge(text: string): string {
  return `<span style="display: inline-block; background-color: #064E3B; color: ${C.emerald}; padding: 3px 10px; border-radius: 6px; font-family: ${F}; font-size: 11px; font-weight: bold; border: 1px solid #065F46; line-height: 1.4;">${text}</span>`;
}

function statCard(value: string, label: string): string {
  return `<td class="stat-cell" width="50%" style="padding: 20px; background-color: ${C.bgCardAlt}; text-align: center; border: 1px solid ${C.borderLight}; border-radius: 12px;">
    <div style="font-family: ${F}; font-size: 28px; font-weight: bold; color: ${C.teal};">${value}</div>
    <div style="font-family: ${F}; font-size: 11px; font-weight: bold; color: ${C.textMuted}; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">${label}</div>
  </td>`;
}

// ─── Template definitions ─────────────────────────────────────────────────────

interface TemplateEntry {
  label: string;
  desc: string;
  fn: () => string;
}

const templates: Record<string, TemplateEntry> = {

  // 1. Welcome (Job Alert Subscription)
  welcome: {
    label: 'Welcome (Alert Subscription)',
    desc: 'Sent when a user subscribes to job alerts',
    fn: () => emailShell(`
          ${headerBlock('Welcome to PMHNP Hiring!', 'Your job alerts are now active')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                You're all set! We'll send you personalized job matches so you never miss a great opportunity.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                ${featureRow('🔍', 'Smart Matching', 'Jobs curated to your location, specialty, and salary preferences')}
                ${featureRow('💰', 'Salary Intel', 'Real compensation data from 10,000+ listings nationwide')}
                ${featureRow('⚡', 'First to Know', 'Alerts delivered daily — before positions get filled')}
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs →', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Manage Alerts', `${BASE_URL}/job-alerts`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        <a href="${BASE_URL}/email-preferences?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Manage preferences</a>
        &nbsp;·&nbsp;
        <a href="${BASE_URL}/unsubscribe?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Unsubscribe</a>
      </p>`,
      'Your PMHNP job alerts are active — personalized matches coming your way!'
    ),
  },

  // 2a. Signup - Job Seeker
  'signup-seeker': {
    label: 'Signup Welcome (Job Seeker)',
    desc: 'Sent when a new job seeker creates an account',
    fn: () => emailShell(`
          ${headerBlock('Welcome, Sarah!', 'Your PMHNP career starts here')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Welcome to the #1 job board built exclusively for Psychiatric Mental Health Nurse Practitioners.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                ${featureRow('🔍', 'Browse 10,000+ Jobs', 'Remote, travel, full-time, per diem — all PMHNP specialties')}
                ${featureRow('🔔', 'Smart Alerts', 'Get notified instantly when matching jobs are posted')}
                ${featureRow('📄', 'One-Click Apply', 'Save jobs, track applications, and apply fast')}
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs →', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Set Up Alerts', `${BASE_URL}/job-alerts`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      'Welcome Sarah — browse 10,000+ PMHNP jobs now!'
    ),
  },

  // 2b. Signup - Employer
  'signup-employer': {
    label: 'Signup Welcome (Employer)',
    desc: 'Sent when a new employer creates an account',
    fn: () => emailShell(`
          ${headerBlock('Welcome!', 'Your employer account is ready')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Your employer account is ready. Start posting jobs and connect with qualified PMHNPs nationwide.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                ${featureRow('📋', 'Post in Minutes', 'Create and publish job listings with our guided form')}
                ${featureRow('👥', 'Reach PMHNPs', 'Your listing is seen by 10,000+ qualified candidates')}
                ${featureRow('📊', 'Track Everything', 'View counts, apply clicks, and applicant analytics')}
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Post a Job →', `${BASE_URL}/post-job`)}
                  </td>
                  <td>
                    ${secondaryButton('Dashboard', `${BASE_URL}/employer/dashboard`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      'Your employer account is ready — start posting jobs today!'
    ),
  },

  // 3. Job Alert
  'job-alert': {
    label: 'Job Alert (Matching Jobs)',
    desc: 'Sent when new jobs match a user\'s alert criteria',
    fn: () => {
      const sampleJobs = [
        { title: 'Remote PMHNP — Telehealth', employer: 'MindPath Health', location: 'Remote', salary: '$145k – $175k' },
        { title: 'Psychiatric NP — Outpatient Clinic', employer: 'Valley Behavioral', location: 'Austin, TX', salary: '$135k – $160k' },
        { title: 'PMHNP — Pediatric & Adolescent', employer: 'Children\'s Mercy Hospital', location: 'Kansas City, MO', salary: '$150k – $185k' },
      ];

      const jobListHtml = sampleJobs.map((job, i) => {
        const isLast = i === sampleJobs.length - 1;
        return `<tr>
        <td style="padding: 16px 20px;${!isLast ? ` border-bottom: 1px solid ${C.borderLight};` : ''}">
          <a href="${BASE_URL}/jobs" style="color: ${C.teal}; text-decoration: none; font-family: ${F}; font-size: 15px; font-weight: bold; line-height: 1.4;">
            ${job.title}
          </a>
          <p style="margin: 4px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">
            ${job.employer} · ${job.location}
          </p>
          <p style="margin: 8px 0 0;">${salaryBadge(job.salary)}</p>
        </td>
      </tr>`;
      }).join('');

      return emailShell(`
          ${headerBlock('3 New PMHNP Jobs Match Your Alert')}
          <tr>
            <td class="content-pad" style="padding: 24px 40px 8px;">
              <p style="margin: 0; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.6;">
                New positions matching your criteria:
              </p>
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding: 12px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${C.bgCardAlt}; border: 1px solid ${C.borderLight}; border-radius: 12px; overflow: hidden;">
                ${jobListHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding: 24px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td>
                    ${primaryButton('View All Matching Jobs →', `${BASE_URL}/jobs`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
        `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
          <a href="${BASE_URL}/job-alerts/manage?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Manage alert</a>
          &nbsp;·&nbsp;
          <a href="${BASE_URL}/job-alerts/unsubscribe?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Delete alert</a>
        </p>`,
        '3 new PMHNP jobs matching your alert — view them before they\'re filled!'
      );
    },
  },

  // 4. Job Confirmation
  'job-confirmation': {
    label: 'Job Post Confirmation',
    desc: 'Sent to employers after a job is published',
    fn: () => emailShell(`
          ${headerBlock('Your Job Post is Live!', 'Now visible to thousands of PMHNPs')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              ${infoCard(`
                    ${sectionLabel('Published')}
                    <p style="margin: 0; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">Remote PMHNP — Telehealth Platform</p>
              `, C.green)}

              <!-- Status Timeline -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="33%" style="text-align: center; padding: 12px 4px;">
                    <div style="width: 32px; height: 32px; background: ${C.tealDarker}; border-radius: 50%; margin: 0 auto 8px; line-height: 32px; font-size: 14px; color: #fff;">&#10003;</div>
                    <div style="font-family: ${F}; font-size: 11px; font-weight: bold; color: ${C.teal};">Posted</div>
                  </td>
                  <td width="33%" style="text-align: center; padding: 12px 4px;">
                    <div style="width: 32px; height: 32px; background: ${C.tealDarker}; border-radius: 50%; margin: 0 auto 8px; line-height: 32px; font-size: 14px; color: #fff;">&#10003;</div>
                    <div style="font-family: ${F}; font-size: 11px; font-weight: bold; color: ${C.teal};">Live</div>
                  </td>
                  <td width="33%" style="text-align: center; padding: 12px 4px;">
                    <div style="width: 32px; height: 32px; background: ${C.bgElevated}; border-radius: 50%; margin: 0 auto 8px; line-height: 32px; font-size: 14px; color: ${C.textMuted}; border: 2px dashed ${C.borderMed};">&#8987;</div>
                    <div style="font-family: ${F}; font-size: 11px; color: ${C.textMuted};">Receiving Views</div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 14px; color: ${C.textMuted}; line-height: 1.6;">
                Your listing is active for <strong style="color: ${C.textPrimary};">30 days</strong>. We'll notify you when it's time to renew.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('View Job →', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Edit Job', `${BASE_URL}/jobs/edit/sample`)}
                  </td>
                </tr>
              </table>

              ${infoCard(`
                    <p style="margin: 0 0 8px; font-family: ${F}; font-size: 14px; font-weight: bold; color: ${C.textPrimary};">📊 Your Employer Dashboard</p>
                    <p style="margin: 0 0 16px; font-family: ${F}; font-size: 13px; color: ${C.textMuted}; line-height: 1.5;">Track views, clicks, and manage all your job postings in one place.</p>
                    ${primaryButton('Open Dashboard', `${BASE_URL}/employer/dashboard`)}
              `, C.blue)}
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      'Your job "Remote PMHNP — Telehealth Platform" is now live on PMHNP Hiring!'
    ),
  },

  // 5. Expiry Warning
  'expiry-warning': {
    label: 'Expiry Warning',
    desc: 'Sent to employers 3 days before their job posting expires',
    fn: () => emailShell(`
          ${amberHeader('Job Expiring in 3 Days', 'Renew now to keep receiving applicants')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              ${infoCard(`
                    ${sectionLabel('Expires Wednesday, March 18, 2026', '#FBBF24')}
                    <p style="margin: 0; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">Senior PMHNP — Private Practice</p>
              `, C.amber)}

              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Renew now to keep it active — <strong style="color: ${C.emerald};">FREE during our launch period!</strong>
              </p>

              <!-- Performance Stats -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  ${statCard('2,847', 'Views')}
                  <td width="8"></td>
                  ${statCard('186', 'Apply Clicks')}
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Renew Now →', `${BASE_URL}/employer/dashboard`)}
                  </td>
                  <td>
                    ${secondaryButton('Edit Job', `${BASE_URL}/jobs/edit/sample`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        <a href="${BASE_URL}/email-preferences?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Manage preferences</a>
        &nbsp;·&nbsp;
        <a href="${BASE_URL}/unsubscribe?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Unsubscribe</a>
      </p>
      <p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      'Your job "Senior PMHNP — Private Practice" expires in 3 days — renew now!'
    ),
  },

  // 6. Draft Saved
  'draft-saved': {
    label: 'Draft Saved',
    desc: 'Sent when an employer saves a job posting draft',
    fn: () => {
      const resumeUrl = `${BASE_URL}/post-job?resume=abc123`;
      return emailShell(`
          ${headerBlock('Your Draft is Saved', 'Continue where you left off')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Your job posting draft has been saved. Pick up right where you left off — your progress won't be lost.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
                <tr>
                  <td>
                    ${primaryButton('Continue Posting →', resumeUrl)}
                  </td>
                </tr>
              </table>

              ${infoCard(`
                    <p style="margin: 0 0 6px; font-family: ${F}; font-size: 12px; color: ${C.textMuted};">Or copy this link:</p>
                    <p style="margin: 0; font-family: ${F}; font-size: 12px; word-break: break-all;">
                      <a href="${resumeUrl}" style="color: ${C.teal}; text-decoration: none;">${resumeUrl}</a>
                    </p>
              `, C.textFaded)}

              <p style="margin: 0; font-family: ${F}; font-size: 12px; color: ${C.textMuted}; font-style: italic;">
                This link expires in 30 days.
              </p>
            </td>
          </tr>`,
        `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
          Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
        </p>`,
        'Your job posting draft has been saved — continue anytime!'
      );
    },
  },

  // 7. Renewal Confirmation
  'renewal': {
    label: 'Renewal Confirmation',
    desc: 'Sent after an employer renews their job posting',
    fn: () => emailShell(`
          ${headerBlock('Job Renewed Successfully!', 'Your listing is back at the top')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              ${infoCard(`
                    ${sectionLabel('Renewed')}
                    <p style="margin: 0 0 10px; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">Remote PMHNP — Telehealth Platform</p>
                    <p style="margin: 0; font-family: ${F}; font-size: 13px; color: ${C.emerald};">
                      <strong>Active until:</strong> Wednesday, April 15, 2026
                    </p>
              `, C.green)}
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 14px; color: ${C.textMuted}; line-height: 1.6;">
                Your listing has been boosted back to the top of search results and will continue receiving views and applicants.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${primaryButton('View Dashboard →', `${BASE_URL}/employer/dashboard`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        <a href="${BASE_URL}/email-preferences?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Manage preferences</a>
        &nbsp;·&nbsp;
        <a href="${BASE_URL}/unsubscribe?token=sample" style="color: ${C.textFaded}; text-decoration: none;">Unsubscribe</a>
      </p>`,
      'Your job "Remote PMHNP" has been renewed and is live again!'
    ),
  },

  // 8. Contact Form Confirmation
  'contact-confirmation': {
    label: 'Contact Form Confirmation',
    desc: 'Sent to users after they submit the contact form',
    fn: () => buildContactConfirmationHtml('Sarah Johnson', 'Question about job posting rates'),
  },

  // 9. Contact Form Notification (Internal)
  'contact-notification': {
    label: 'Contact Notification (Internal)',
    desc: 'Sent to support@pmhnphiring.com when contact form is submitted',
    fn: () => buildContactNotificationHtml(
      'Sarah Johnson',
      'sarah@example.com',
      'Question about job posting rates',
      'Hi! I\'m interested in posting several PMHNP positions for our practice. Could you tell me more about pricing for multiple listings? We have 3 positions to fill. Thanks!'
    ),
  },

  // 10. Salary Guide Delivery
  'salary-guide': {
    label: 'Salary Guide Delivery',
    desc: 'Sent when a user requests the PMHNP salary guide',
    fn: () => buildSalaryGuideHtml(
      'https://zdmpmncrcpgpmwdqvekg.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf',
      'sample-token'
    ),
  },

  // 11. Email Job to Self
  'email-job': {
    label: 'Email Job to Self',
    desc: 'Sent when a user emails a job listing to themselves',
    fn: () => emailShell(`
          ${headerBlock('Job Saved for You', 'View it anytime from this email')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                You saved this job to review later. Click below to view the full listing and apply.
              </p>
              ${infoCard(`
                    ${sectionLabel('Job Title')}
                    <p style="margin: 0; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">Remote PMHNP — Telehealth Platform</p>
              `, C.green)}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('View & Apply →', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Browse Jobs', `${BASE_URL}/jobs`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
            <a href="${BASE_URL}/job-alerts" style="color: ${C.textFaded}; text-decoration: none;">Set up job alerts</a>
            &nbsp;·&nbsp;
            <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">Contact us</a>
          </p>`,
      'You saved "Remote PMHNP — Telehealth Platform" — view the full listing and apply!'
    ),
  },
};

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const template = searchParams.get('template');

  if (!template) {
    // Index page listing all templates
    const cards = Object.entries(templates).map(([key, t]) =>
      `<a href="?template=${key}" style="display: block; padding: 16px 20px; background: ${C.bgCard}; border: 1px solid ${C.borderLight}; border-radius: 12px; margin-bottom: 10px; text-decoration: none; transition: border-color 0.2s;">
        <div style="font-family: ${F}; font-size: 15px; font-weight: bold; color: ${C.textPrimary}; margin-bottom: 4px;">${t.label}</div>
        <div style="font-family: ${F}; font-size: 13px; color: ${C.textMuted};">${t.desc}</div>
      </a>`
    ).join('');

    return new NextResponse(
      `<!DOCTYPE html><html><head><title>Email Previews — PMHNP Hiring</title>
      <style>
        * { box-sizing: border-box; }
        body { background: ${C.bgBody}; color: ${C.textPrimary}; font-family: ${F}; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        a:hover { border-color: ${C.borderMed} !important; }
      </style>
      </head>
      <body>
        <div class="container">
          <h1 style="font-size: 24px; font-weight: bold; margin: 0 0 4px;">Email Template Previews</h1>
          <p style="color: ${C.textMuted}; font-size: 14px; margin: 0 0 24px;">${Object.keys(templates).length} templates · Click any to preview</p>
          ${cards}
          <p style="color: ${C.textDimmed}; font-size: 12px; margin-top: 24px; text-align: center;">These previews use sample data</p>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const entry = templates[template];
  if (!entry) {
    return new NextResponse('Template not found. Available: ' + Object.keys(templates).join(', '), { status: 404 });
  }

  return new NextResponse(entry.fn(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
