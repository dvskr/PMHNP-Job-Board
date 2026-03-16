/**
 * POST /api/admin/employer-outreach
 *
 * One-time campaign: sends a personalized email to every employer
 * explaining our free Growth package and how to take advantage.
 *
 * Auth: requires admin secret in Authorization header.
 *
 * Query params:
 *   ?dry=true  — preview mode, returns recipients without sending
 */
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_SECRET = process.env.CRON_SECRET || '';
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildEmail(name: string, company: string) {
  const safeName = escapeHtml(name || 'there');
  const safeCompany = escapeHtml(company);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>You're Getting Our $299 Growth Package — Free</title>
</head>
<body style="margin:0;padding:0;background-color:#060E18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#060E18;">
<tr><td align="center" style="padding:40px 16px;">

<!-- Inner card -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#0F1923;border-radius:16px;overflow:hidden;border:1px solid #1E293B;">

  <!-- Header -->
  <tr>
    <td style="padding:32px 32px 0;text-align:center;">
      <img src="${BASE_URL}/images/pmhnp-logo.png" alt="PMHNP Hiring" width="160" style="display:block;margin:0 auto 8px;" />
      <div style="display:inline-block;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;color:#2DD4BF;background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.2);letter-spacing:0.5px;">
        🚀 FREE LAUNCH — GROWTH PACKAGE INCLUDED
      </div>
    </td>
  </tr>

  <!-- Greeting -->
  <tr>
    <td style="padding:28px 32px 0;">
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#F1F5F9;line-height:1.3;">
        Hi ${safeName},
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#CBD5E1;line-height:1.65;">
        Thank you for choosing <strong style="color:#F1F5F9;">PMHNP Hiring</strong> to post your ${safeCompany ? `<strong style="color:#F1F5F9;">${safeCompany}</strong>` : ''} job listing. We wanted to share some exciting news about what your employer account includes.
      </p>
    </td>
  </tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px;"><div style="height:1px;background:#1E293B;"></div></td></tr>

  <!-- Growth Package Section -->
  <tr>
    <td style="padding:24px 32px 0;">
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#2DD4BF;">
        Your Free Growth Package ($299 value)
      </h2>
      <p style="margin:0 0 20px;font-size:14px;color:#94A3B8;line-height:1.6;">
        During our launch period, every employer gets our <strong style="color:#F1F5F9;">Growth package</strong> completely free. Here's what's included in every job posting:
      </p>
    </td>
  </tr>

  <!-- Features Grid -->
  <tr>
    <td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <!-- Row 1 -->
        <tr>
          <td width="50%" style="padding:8px 8px 8px 0;vertical-align:top;">
            <div style="background:#162231;border-radius:12px;padding:16px;border:1px solid #1E293B;">
              <div style="font-size:20px;margin-bottom:6px;">📋</div>
              <div style="font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px;">60-Day Listing</div>
              <div style="font-size:12px;color:#94A3B8;line-height:1.5;">2× longer than standard. Maximum exposure for your role.</div>
            </div>
          </td>
          <td width="50%" style="padding:8px 0 8px 8px;vertical-align:top;">
            <div style="background:#162231;border-radius:12px;padding:16px;border:1px solid #1E293B;">
              <div style="font-size:20px;margin-bottom:6px;">⭐</div>
              <div style="font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px;">Featured Badge</div>
              <div style="font-size:12px;color:#94A3B8;line-height:1.5;">Your listing stands out with a prominent Featured tag.</div>
            </div>
          </td>
        </tr>
        <!-- Row 2 -->
        <tr>
          <td width="50%" style="padding:8px 8px 8px 0;vertical-align:top;">
            <div style="background:#162231;border-radius:12px;padding:16px;border:1px solid #1E293B;">
              <div style="font-size:20px;margin-bottom:6px;">🔝</div>
              <div style="font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px;">Top Search Placement</div>
              <div style="font-size:12px;color:#94A3B8;line-height:1.5;">Your job appears first in search results.</div>
            </div>
          </td>
          <td width="50%" style="padding:8px 0 8px 8px;vertical-align:top;">
            <div style="background:#162231;border-radius:12px;padding:16px;border:1px solid #1E293B;">
              <div style="font-size:20px;margin-bottom:6px;">📧</div>
              <div style="font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px;">Highlighted in Alerts</div>
              <div style="font-size:12px;color:#94A3B8;line-height:1.5;">Priority placement in daily emails to 6,000+ PMHNPs.</div>
            </div>
          </td>
        </tr>
        <!-- Row 3 -->
        <tr>
          <td width="50%" style="padding:8px 8px 8px 0;vertical-align:top;">
            <div style="background:#162231;border-radius:12px;padding:16px;border:1px solid #1E293B;">
              <div style="font-size:20px;margin-bottom:6px;">👥</div>
              <div style="font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px;">25 Candidate Unlocks</div>
              <div style="font-size:12px;color:#94A3B8;line-height:1.5;">Access profiles of interested candidates per posting.</div>
            </div>
          </td>
          <td width="50%" style="padding:8px 0 8px 8px;vertical-align:top;">
            <div style="background:#162231;border-radius:12px;padding:16px;border:1px solid #1E293B;">
              <div style="font-size:20px;margin-bottom:6px;">💬</div>
              <div style="font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px;">25 InMails/Posting</div>
              <div style="font-size:12px;color:#94A3B8;line-height:1.5;">Message candidates directly on the platform.</div>
            </div>
          </td>
        </tr>
        <!-- Row 4 -->
        <tr>
          <td colspan="2" style="padding:8px 0;vertical-align:top;">
            <div style="background:#162231;border-radius:12px;padding:16px;border:1px solid #1E293B;text-align:center;">
              <div style="font-size:20px;margin-bottom:6px;">📊</div>
              <div style="font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px;">Advanced Analytics</div>
              <div style="font-size:12px;color:#94A3B8;line-height:1.5;">Track views, clicks, and traffic sources from your employer dashboard.</div>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Divider -->
  <tr><td style="padding:20px 32px;"><div style="height:1px;background:#1E293B;"></div></td></tr>

  <!-- How To Section -->
  <tr>
    <td style="padding:0 32px;">
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#F1F5F9;">
        How to Take Advantage
      </h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;vertical-align:top;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:32px;height:32px;border-radius:50%;background:#2DD4BF;text-align:center;vertical-align:middle;font-size:14px;font-weight:800;color:#fff;">1</td>
              <td style="padding-left:12px;">
                <div style="font-size:14px;font-weight:600;color:#F1F5F9;">Post a new job — it's free</div>
                <div style="font-size:13px;color:#94A3B8;margin-top:2px;">Takes under 5 minutes. No credit card required.</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;vertical-align:top;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:32px;height:32px;border-radius:50%;background:#E86C2C;text-align:center;vertical-align:middle;font-size:14px;font-weight:800;color:#fff;">2</td>
              <td style="padding-left:12px;">
                <div style="font-size:14px;font-weight:600;color:#F1F5F9;">Your listing goes live instantly</div>
                <div style="font-size:13px;color:#94A3B8;margin-top:2px;">Featured badge + top placement in search results + daily email alerts.</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;vertical-align:top;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:32px;height:32px;border-radius:50%;background:#A855F7;text-align:center;vertical-align:middle;font-size:14px;font-weight:800;color:#fff;">3</td>
              <td style="padding-left:12px;">
                <div style="font-size:14px;font-weight:600;color:#F1F5F9;">Track performance from your dashboard</div>
                <div style="font-size:13px;color:#94A3B8;margin-top:2px;">Advanced analytics: views, clicks, and traffic sources.</div>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA Button -->
  <tr>
    <td style="padding:28px 32px;text-align:center;">
      <a href="${BASE_URL}/post-job" style="display:inline-block;padding:14px 36px;border-radius:12px;font-size:16px;font-weight:700;color:#ffffff;background:linear-gradient(135deg,#2DD4BF,#0D9488);text-decoration:none;box-shadow:0 4px 20px rgba(45,212,191,0.3);">
        Post a Job — Free →
      </a>
    </td>
  </tr>

  <!-- Why Choose Us -->
  <tr>
    <td style="padding:0 32px 24px;">
      <div style="background:#162231;border-radius:12px;padding:20px;border:1px solid #1E293B;">
        <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#F1F5F9;">Why 450+ Employers Trust PMHNP Hiring</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#CBD5E1;">✅ <strong>6,300+ active PMHNPs</strong> — 100% targeted audience</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#CBD5E1;">✅ <strong>SEO-optimized pages</strong> — your jobs rank on Google</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#CBD5E1;">✅ <strong>Daily job alert emails</strong> — reach thousands of candidates</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#CBD5E1;">✅ <strong>Only PMHNPs apply</strong> — no unqualified applicants</td>
          </tr>
        </table>
      </div>
    </td>
  </tr>

  <!-- Secondary CTA -->
  <tr>
    <td style="padding:0 32px 28px;text-align:center;">
      <p style="margin:0 0 12px;font-size:14px;color:#94A3B8;">Already have active postings? Check your analytics:</p>
      <a href="${BASE_URL}/employer/dashboard" style="display:inline-block;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;color:#F1F5F9;background:#1E293B;border:1px solid #334155;text-decoration:none;">
        View Dashboard →
      </a>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:20px 32px;background:#060E18;border-top:1px solid #1E293B;">
      <p style="margin:0 0 8px;font-size:13px;color:#64748B;text-align:center;line-height:1.5;">
        Questions? Reply to this email or reach us at
        <a href="mailto:hello@pmhnphiring.com" style="color:#2DD4BF;text-decoration:none;">hello@pmhnphiring.com</a>
      </p>
      <p style="margin:0;font-size:11px;color:#475569;text-align:center;">
        © ${new Date().getFullYear()} PMHNP Hiring · <a href="${BASE_URL}" style="color:#475569;text-decoration:none;">pmhnphiring.com</a>
      </p>
    </td>
  </tr>

</table>
<!-- /Inner card -->

</td></tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(request: Request) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  if (!ADMIN_SECRET || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const isDry = url.searchParams.get('dry') === 'true';

  try {
    // Get all unique employer emails from EmployerJob (people who actually posted jobs)
    const employerJobs = await prisma.employerJob.findMany({
      select: { contactEmail: true, employerName: true },
      distinct: ['contactEmail'],
    });

    // Also get employer leads with email
    const employerLeads = await prisma.employerLead.findMany({
      where: { contactEmail: { not: null } },
      select: { contactEmail: true, contactName: true, companyName: true },
    });

    // Also get registered employer profiles
    const employerProfiles = await prisma.userProfile.findMany({
      where: { role: 'employer' },
      select: { email: true, firstName: true, company: true },
    });

    // Deduplicate by email — prioritize EmployerJob data (they're active)
    const emailMap = new Map<string, { name: string; company: string }>();

    for (const ej of employerJobs) {
      const email = ej.contactEmail.toLowerCase().trim();
      if (!emailMap.has(email)) {
        emailMap.set(email, { name: '', company: ej.employerName || '' });
      }
    }

    for (const ep of employerProfiles) {
      const email = ep.email.toLowerCase().trim();
      if (!emailMap.has(email)) {
        emailMap.set(email, { name: ep.firstName || '', company: ep.company || '' });
      } else {
        // Enrich existing entry with name if missing
        const existing = emailMap.get(email)!;
        if (!existing.name && ep.firstName) existing.name = ep.firstName;
        if (!existing.company && ep.company) existing.company = ep.company;
      }
    }

    for (const el of employerLeads) {
      if (!el.contactEmail) continue;
      const email = el.contactEmail.toLowerCase().trim();
      if (!emailMap.has(email)) {
        emailMap.set(email, { name: el.contactName || '', company: el.companyName || '' });
      }
    }

    const recipients = Array.from(emailMap.entries()).map(([email, data]) => ({
      email,
      name: data.name,
      company: data.company,
    }));

    if (isDry) {
      return NextResponse.json({
        mode: 'DRY RUN — no emails sent',
        totalRecipients: recipients.length,
        fromEmployerJobs: employerJobs.length,
        fromEmployerProfiles: employerProfiles.length,
        fromEmployerLeads: employerLeads.filter(e => e.contactEmail).length,
        recipients: recipients.slice(0, 20), // preview first 20
      });
    }

    // Send in batches of 50 (Resend batch limit is 100)
    const BATCH_SIZE = 50;
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const emails = batch.map(r => {
        const html = buildEmail(r.name, r.company);
        return {
          from: 'PMHNP Hiring <hello@pmhnphiring.com>',
          to: r.email,
          replyTo: 'hello@pmhnphiring.com',
          subject: `${r.name ? r.name + ', y' : 'Y'}our free Growth package is waiting 🚀`,
          html,
          text: htmlToPlainText(html),
        };
      });

      try {
        const result = await resend.batch.send(emails);
        if (result.error) {
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${result.error.message}`);
          failed += batch.length;
        } else {
          sent += batch.length;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${msg}`);
        failed += batch.length;
      }

      // Rate limit: 100ms between batches
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Log the campaign
    try {
      await prisma.emailSend.create({
        data: {
          to: 'campaign@employer-outreach',
          emailType: 'employer_outreach_campaign',
          subject: 'Employer outreach — Growth package announcement',
          status: failed === 0 ? 'sent' : 'partial',
          metadata: { sent, failed, totalRecipients: recipients.length, errors } as any,
        },
      });
    } catch { /* logging failure shouldn't break response */ }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      totalRecipients: recipients.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Employer outreach failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
