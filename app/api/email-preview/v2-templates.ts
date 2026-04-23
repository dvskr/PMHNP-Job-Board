import {
  emailShellV2, headerBlockV2,
  primaryButtonV2, spacerV2, closeContentV2,
  unsubscribeFooterV2,
  V2, SANS, SERIF,
} from '@/lib/email-templates-v2';

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const IMG = `${BASE_URL}/images/email`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hero(file: string): string {
  return `<tr><td style="padding:0 40px;"><img src="${IMG}/${file}" alt="" width="520" style="width:100%;max-width:520px;height:auto;display:block;border-radius:12px;margin:0 auto;" /></td></tr>`;
}

function bodyText(text: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF};font-size:17px;color:${V2.textBody};line-height:1.7;">${text}</p></td></tr>`;
}

function centeredCta(label: string, url: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;text-align:center;">${primaryButtonV2(label, url)}</td></tr>`;
}

function sectionHead(text: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF};font-size:26px;font-weight:700;color:${V2.textHeading};text-align:center;">${text}</p></td></tr>`;
}

function step(file: string, title: string, desc: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="80" height="80" valign="middle" style="padding-right:16px;width:80px;min-width:80px;height:80px;overflow:hidden;"><img src="${IMG}/${file}" alt="${title}" width="80" height="80" style="width:80px;min-width:80px;height:80px;min-height:80px;max-height:80px;border-radius:12px;display:block;" /></td><td valign="middle"><p style="margin:0 0 4px;font-family:${SANS};font-size:15px;font-weight:700;color:${V2.textHeading};">${title}</p><p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textMuted};line-height:1.5;">${desc}</p></td></tr></table></td></tr>`;
}

function stat(value: string, label: string): string {
  return `<td width="33%" style="padding:12px;background:${V2.bgCardAlt};text-align:center;border-radius:12px;"><div style="font-family:${SANS};font-size:28px;font-weight:bold;color:${V2.teal};">${value}</div><div style="font-family:${SANS};font-size:11px;font-weight:bold;color:${V2.textMuted};text-transform:uppercase;letter-spacing:1px;margin-top:4px;">${label}</div></td>`;
}

function secondary(text: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textMuted};line-height:1.6;">${text}</p></td></tr>`;
}

function simple(iconFile: string, heading: string, body: string, cta: string, ctaUrl: string, preheader: string, extra?: string): string {
  return emailShellV2(`
    ${headerBlockV2(heading, '')}
    ${spacerV2(12)}
    <tr><td class="content-pad" style="padding:0 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td width="30%" valign="top" style="padding-right:20px;">
          <img src="${IMG}/${iconFile}" alt="" style="width:100%;height:auto;display:block;border-radius:12px;" />
        </td>
        <td width="70%" valign="top">
          <p style="margin:0;font-family:${SERIF};font-size:17px;color:${V2.textBody};line-height:1.7;">${body}</p>
        </td>
      </tr></table>
    </td></tr>
    ${spacerV2(32)}
    ${centeredCta(cta, ctaUrl)}
    ${extra || ''}
    ${spacerV2(48)}
    ${closeContentV2()}`, unsubscribeFooterV2('sample'), preheader);
}

function card(content: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${V2.bgCardAlt};border:1px solid ${V2.borderLight};border-radius:12px;overflow:hidden;">${content}</table></td></tr>`;
}

function cardRow(label: string, value: string, isLast?: boolean): string {
  const bb = isLast ? '' : `border-bottom:1px solid ${V2.borderLight};`;
  return `<tr><td style="padding:16px 20px;${bb}"><p style="margin:0 0 2px;font-family:${SANS};font-size:12px;color:${V2.textMuted};text-transform:uppercase;">${label}</p><p style="margin:0;font-family:${SANS};font-size:15px;color:${V2.textHeading};">${value}</p></td></tr>`;
}

// ── Template entries ─────────────────────────────────────────────────────────

export interface V2TemplateEntry {
  label: string;
  desc: string;
  fn: () => string;
}

export const v2Templates: Record<string, V2TemplateEntry> = {

  // 1. Welcome (Alert Subscription)
  welcome: {
    label: 'Welcome (Alert Subscription)',
    desc: 'Sent when a user subscribes to job alerts',
    fn: () => simple('hero-alert-subscription.png', 'Your Alerts Are Live',
      'Your job alerts are now active. We scan thousands of PMHNP positions daily and deliver matches straight to your inbox \u2014 so you never miss the right opportunity.',
      'Browse Open Positions', `${BASE_URL}/jobs`,
      'Your PMHNP job alerts are active.'),
  },

  // 2a. Signup - Job Seeker
  'signup-seeker': {
    label: 'Signup Welcome (Job Seeker)',
    desc: 'Sent when a new job seeker creates an account',
    fn: () => emailShellV2(`
      ${headerBlockV2('Welcome to PMHNP Hiring', '')}
      ${hero('welcome-email-hero.png')}
      ${spacerV2(28)}
      ${bodyText('You have unlocked a new way to find your perfect role. Search curated positions, get matched by AI, and connect directly with hiring managers \u2014 no recruiters, no middlemen.')}
      ${spacerV2(36)}
      ${sectionHead('Here is how to get started')}
      ${spacerV2(20)}
      ${step('step-build-profile.png', 'Build your profile', 'Take 60 seconds to add your credentials, specialties, and location preferences.')}
      ${spacerV2(16)}
      ${step('step-ai-alerts.png', 'Turn on AI alerts', 'Get notified the exact minute a perfectly matched role lands on the board.')}
      ${spacerV2(16)}
      ${step('step-connect.png', 'Connect directly', 'Connect to hiring managers directly, no recruiters involved.')}
      ${spacerV2(32)}
      ${centeredCta('Explore Your Dashboard', `${BASE_URL}/dashboard`)}
      ${spacerV2(16)}
      ${secondary(`Want the data first? <a href="${BASE_URL}/salary-guide" style="color:${V2.teal};text-decoration:underline;">Download the 2026 Salary Guide</a>.`)}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'Welcome to PMHNP Hiring \u2014 find your perfect PMHNP role.'),
  },

  // 2b. Signup - Employer
  'signup-employer': {
    label: 'Signup Welcome (Employer)',
    desc: 'Sent when a new employer creates an account',
    fn: () => emailShellV2(`
      ${headerBlockV2('Your Employer Account Is Ready', '')}
      ${spacerV2(12)}
      ${bodyText('Post positions, track engagement, and connect with qualified Psychiatric Mental Health Nurse Practitioners \u2014 all from one dashboard.')}
      ${spacerV2(36)}
      ${sectionHead('Three steps to your first hire')}
      ${spacerV2(20)}
      ${step('icon-emp-megaphone.png', 'Publish your listing', 'Our guided form takes under five minutes. Add role details, compensation, and requirements.')}
      ${spacerV2(16)}
      ${step('icon-emp-analytics.png', 'Track engagement', 'Monitor views, apply clicks, and applicant quality in real time.')}
      ${spacerV2(16)}
      ${step('icon-emp-handshake.png', 'Connect with candidates', 'Message qualified PMHNPs directly through the platform.')}
      ${spacerV2(32)}
      ${centeredCta('Post Your First Job', `${BASE_URL}/post-job`)}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'Your employer account is ready \u2014 start hiring PMHNPs today.'),
  },

  // 3. Job Alert
  'job-alert': {
    label: 'Job Alert (Matching Jobs)',
    desc: 'Sent when new jobs match alert criteria',
    fn: () => {
      const jobs = [
        { t: 'Remote PMHNP \u2014 Telehealth', o: 'MindPath Health', l: 'Remote', s: '$145k\u2013$175k' },
        { t: 'Psychiatric NP \u2014 Outpatient Clinic', o: 'Valley Behavioral', l: 'Austin, TX', s: '$135k\u2013$160k' },
        { t: 'PMHNP \u2014 Pediatric and Adolescent', o: "Children's Mercy Hospital", l: 'Kansas City, MO', s: '$150k\u2013$185k' },
      ];
      const rows = jobs.map(j => `<tr><td style="padding:16px 20px;border-bottom:1px solid ${V2.borderLight};"><a href="${BASE_URL}/jobs" style="color:${V2.teal};text-decoration:none;font-family:${SANS};font-size:15px;font-weight:bold;">${j.t}</a><p style="margin:4px 0 0;font-family:${SANS};font-size:13px;color:${V2.textMuted};">${j.o} &middot; ${j.l}</p><p style="margin:6px 0 0;"><span style="display:inline-block;background:${V2.teal};color:#fff;padding:3px 10px;border-radius:6px;font-family:${SANS};font-size:11px;font-weight:bold;">${j.s}</span></p></td></tr>`).join('');
      return emailShellV2(`
        ${headerBlockV2('3 New Jobs Match Your Alert', '')}
        ${spacerV2(12)}
        <tr><td class="content-pad" style="padding:0 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td width="30%" valign="top" style="padding-right:20px;">
              <img src="${IMG}/hero-job-alert.png" alt="" style="width:100%;height:auto;display:block;border-radius:12px;" />
            </td>
            <td width="70%" valign="top">
              <p style="margin:0;font-family:${SERIF};font-size:17px;color:${V2.textBody};line-height:1.7;">We found <strong>3 new positions</strong> matching your preferences, posted within the last 24 hours. Review the details below and apply early for the best response rates.</p>
            </td>
          </tr></table>
        </td></tr>
        ${spacerV2(20)}
        ${card(rows)}
        ${spacerV2(28)}
        ${centeredCta('View All Matching Jobs', `${BASE_URL}/jobs`)}
        ${spacerV2(48)}
        ${closeContentV2()}`, unsubscribeFooterV2('sample'),
        '3 new PMHNP jobs matching your alert.');
    },
  },

  // 4. Job Post Confirmation
  'job-confirmation': {
    label: 'Job Post Confirmation',
    desc: 'Sent to employers after a job is published',
    fn: () => simple('hero-job-post.png', 'Your Listing Is Live',
      'Your posting is now visible to over 10,000 PMHNPs actively searching for their next role. The listing will remain active for 30 days.',
      'View Your Listing', `${BASE_URL}/jobs`, 'Your job posting is now live.',
      `${spacerV2(16)}${secondary(`Need to edit? <a href="${BASE_URL}/employer/dashboard" style="color:${V2.teal};text-decoration:underline;">Open your dashboard</a>.`)}`),
  },

  // 5. Expiry Warning
  'expiry-warning': {
    label: 'Expiry Warning',
    desc: 'Sent 3 days before a job posting expires',
    fn: () => emailShellV2(`
      ${headerBlockV2('Your Listing Expires in 3 Days', '')}
      ${hero('hero-expiry-warning.png')}
      ${spacerV2(28)}
      ${bodyText('Your posting for <strong>Senior PMHNP \u2014 Private Practice</strong> will expire on Wednesday, March 18, 2026. Renew now to maintain visibility and continue receiving applications.')}
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${stat('2,847', 'Views')}<td width="8"></td>${stat('186', 'Applies')}<td width="8"></td>${stat('24', 'Saved')}</tr></table></td></tr>
      ${spacerV2(28)}
      ${centeredCta('Renew Your Listing', `${BASE_URL}/employer/dashboard`)}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'Your listing expires in 3 days \u2014 renew now.'),
  },

  // 6. Draft Saved
  'draft-saved': {
    label: 'Draft Saved',
    desc: 'Sent when an employer saves a job posting draft',
    fn: () => simple('hero-draft-saved.png', 'Your Draft Is Saved',
      'We saved your progress. Your draft is ready whenever you are \u2014 pick up right where you left off. This link expires in 30 days.',
      'Continue Your Posting', `${BASE_URL}/post-job?resume=abc123`,
      'Your job posting draft has been saved.'),
  },

  // 7. Renewal Confirmation
  renewal: {
    label: 'Renewal Confirmation',
    desc: 'Sent after an employer renews their job posting',
    fn: () => simple('hero-renewal.png', 'Listing Renewed Successfully',
      'Your posting for <strong>Remote PMHNP \u2014 Telehealth Platform</strong> has been renewed and will remain active until Wednesday, April 15, 2026.',
      'View Your Dashboard', `${BASE_URL}/employer/dashboard`,
      'Your job listing has been renewed.'),
  },

  // 8. Contact Form Confirmation
  'contact-confirmation': {
    label: 'Contact Form Confirmation',
    desc: 'Sent after contact form submission',
    fn: () => emailShellV2(`
      ${headerBlockV2('We Received Your Message', '')}
      ${spacerV2(12)}
      ${bodyText('Thank you for reaching out, Sarah. Our team will review your inquiry and respond within one business day.')}
      ${spacerV2(24)}
      ${card(cardRow('Your Subject', 'Question about job posting rates', true))}
      ${spacerV2(28)}
      ${centeredCta('Browse Jobs While You Wait', `${BASE_URL}/jobs`)}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'We received your message.'),
  },

  // 9. Contact Notification (Internal)
  'contact-notification': {
    label: 'Contact Notification (Internal)',
    desc: 'Sent to support when contact form is submitted',
    fn: () => emailShellV2(`
      ${headerBlockV2('New Contact Form Submission', '')}
      ${spacerV2(12)}
      ${card(cardRow('Name', 'Sarah Johnson') + cardRow('Email', `<span style="color:${V2.teal}">sarah@example.com</span>`) + cardRow('Subject', 'Question about job posting rates') + `<tr><td style="padding:16px 20px;"><p style="margin:0 0 2px;font-family:${SANS};font-size:12px;color:${V2.textMuted};text-transform:uppercase;">Message</p><p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textBody};line-height:1.6;">I am interested in posting several PMHNP positions. Could you tell me more about pricing?</p></td></tr>`)}
      ${spacerV2(28)}
      ${centeredCta('Reply to Sender', 'mailto:sarah@example.com')}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'New contact form submission from Sarah Johnson.'),
  },

  // 10. Salary Guide
  'salary-guide': {
    label: 'Salary Guide Delivery',
    desc: 'Sent when a user requests the salary guide',
    fn: () => simple('hero-salary-guide.png', 'Your 2026 Salary Guide',
      'Your comprehensive PMHNP compensation report is ready. It includes salary ranges across all 50 states, remote versus in-person pay differentials, and negotiation strategies.',
      'Download Salary Guide (PDF)', 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf',
      'Your 2026 PMHNP Salary Guide is ready.',
      `${spacerV2(16)}${secondary(`Looking for opportunities? <a href="${BASE_URL}/jobs" style="color:${V2.teal};text-decoration:underline;">Browse open positions</a>.`)}`),
  },

  // 11. Email Job to Self
  'email-job': {
    label: 'Email Job to Self',
    desc: 'Sent when a user emails a job to themselves',
    fn: () => emailShellV2(`
      ${headerBlockV2('Job Saved for Review', '')}
      ${spacerV2(12)}
      ${bodyText('You saved this position to review later. Here are the details:')}
      ${spacerV2(20)}
      ${card(`<tr><td style="padding:20px;"><p style="margin:0 0 6px;font-family:${SANS};font-size:18px;font-weight:bold;color:${V2.textHeading};">Remote PMHNP \u2014 Telehealth Platform</p><p style="margin:0 0 10px;font-family:${SANS};font-size:14px;color:${V2.textMuted};">MindPath Health &middot; Remote &middot; Full-time</p><p style="margin:0;"><span style="display:inline-block;background:${V2.teal};color:#fff;padding:3px 10px;border-radius:6px;font-family:${SANS};font-size:12px;font-weight:bold;">$145k\u2013$175k</span></p></td></tr>`)}
      ${spacerV2(28)}
      ${centeredCta('View Full Listing', `${BASE_URL}/jobs`)}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'You saved a job for later review.'),
  },

  // 12. Employer Message
  'employer-message': {
    label: 'Employer Message Notification',
    desc: 'Sent when a candidate messages an employer',
    fn: () => simple('hero-message.png', 'New Message Received',
      'A candidate has sent you a message regarding your posting for <strong>Remote PMHNP \u2014 Telehealth Platform</strong>. Responding within 24 hours significantly increases your chances of securing top talent.',
      'View Message', `${BASE_URL}/employer/messages`,
      'You have a new message from a candidate.'),
  },

  // 13. Candidate Inquiry
  'candidate-inquiry': {
    label: 'Candidate Inquiry Notification',
    desc: 'Sent when an employer contacts a candidate',
    fn: () => simple('hero-envelope.png', 'You Have a New Inquiry',
      '<strong>Valley Behavioral Health</strong> has a question about your application for <strong>Psychiatric NP \u2014 Outpatient Clinic</strong>. Review their message and respond at your earliest convenience.',
      'View and Reply', `${BASE_URL}/messages`,
      'An employer has a question about your application.'),
  },

  // 14. New Application
  'new-application': {
    label: 'New Application Received',
    desc: 'Sent to employers when a candidate applies',
    fn: () => simple('hero-new-application.png', 'New Application Received',
      'A new application has been submitted for <strong>Remote PMHNP \u2014 Telehealth Platform</strong>. The candidate holds a DNP with board certification in psychiatric mental health nursing.',
      'Review Application', `${BASE_URL}/employer/applications`,
      'New application received for your job posting.'),
  },

  // 15. Application Confirmation
  'application-confirmation': {
    label: 'Application Confirmation',
    desc: 'Sent to candidates after they apply',
    fn: () => simple('hero-app-confirm.png', 'Application Submitted',
      'Your application for <strong>Remote PMHNP \u2014 Telehealth Platform</strong> at MindPath Health has been submitted successfully. The employer will review your profile and respond if there is a match.',
      'Track Your Applications', `${BASE_URL}/applications`,
      'Your application has been submitted successfully.'),
  },

  // 16. Status Update
  'status-update': {
    label: 'Application Status Update',
    desc: 'Sent when an application status changes',
    fn: () => simple('hero-status-update.png', 'Application Status Update',
      'There is an update on your application for <strong>Remote PMHNP \u2014 Telehealth Platform</strong>. Your application has moved to the <strong>interview stage</strong>. The hiring manager will reach out to schedule a conversation.',
      'View Application Details', `${BASE_URL}/applications`,
      'Update on your application \u2014 moved to interview stage.'),
  },

  // 17. New Candidate Alert
  'new-candidate': {
    label: 'New Candidate Alert',
    desc: 'Sent when a matching candidate joins',
    fn: () => simple('hero-new-candidate.png', 'New Candidate Match',
      'A new candidate matching your hiring criteria has joined the platform. They specialize in adult and geriatric psychiatry with 5 years of experience and are open to remote positions.',
      'View Candidate Profile', `${BASE_URL}/employer/candidates`,
      'A new candidate matching your criteria just joined.'),
  },

  // 18. Saved Job Reminder
  'saved-job-reminder': {
    label: 'Saved Job Reminder',
    desc: 'Sent to remind candidates about saved jobs',
    fn: () => simple('hero-saved-job.png', 'Your Saved Job Is Still Open',
      'You saved <strong>Remote PMHNP \u2014 Telehealth Platform</strong> at MindPath Health 5 days ago. This position is still accepting applications \u2014 do not miss your window.',
      'View and Apply', `${BASE_URL}/jobs`,
      'The job you saved is still open.'),
  },

  // 19. Performance Report
  'performance-report': {
    label: 'Monthly Performance Report',
    desc: 'Sent to employers with monthly metrics',
    fn: () => emailShellV2(`
      ${headerBlockV2('Your Monthly Hiring Report', '')}
      ${hero('hero-performance.png')}
      ${spacerV2(28)}
      ${bodyText('Here is how your listings performed this month. Use these insights to optimize your postings and attract stronger candidates.')}
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${stat('8,431', 'Views')}<td width="8"></td>${stat('342', 'Applies')}<td width="8"></td>${stat('28', 'Messages')}</tr></table></td></tr>
      ${spacerV2(28)}
      ${centeredCta('View Full Report', `${BASE_URL}/employer/dashboard`)}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'Your monthly hiring performance report is ready.'),
  },

  // 20. Profile Incomplete
  'profile-incomplete': {
    label: 'Profile Incomplete Reminder',
    desc: 'Sent to candidates with incomplete profiles',
    fn: () => emailShellV2(`
      ${headerBlockV2('Your Profile Is Almost There', '')}
      ${hero('hero-profile-incomplete.png')}
      ${spacerV2(28)}
      ${bodyText('Your profile is 60 percent complete. Candidates with finished profiles receive 3 times more visibility from employers. Take a moment to fill in the remaining details.')}
      ${spacerV2(36)}
      ${sectionHead('What to add next')}
      ${spacerV2(20)}
      ${step('icon-profile-credential.png', 'Add your credentials', 'List your certifications, licenses, and education to stand out.')}
      ${spacerV2(16)}
      ${step('icon-profile-location.png', 'Set location preferences', 'Tell us where you want to work so we can match you accurately.')}
      ${spacerV2(16)}
      ${step('icon-profile-specialty.png', 'Choose your specialties', 'Select your areas of focus to receive the most relevant opportunities.')}
      ${spacerV2(32)}
      ${centeredCta('Complete Your Profile', `${BASE_URL}/profile`)}
      ${spacerV2(48)}
      ${closeContentV2()}`, unsubscribeFooterV2('sample'),
      'Your profile is 60% complete \u2014 finish it to boost visibility.'),
  },
};
