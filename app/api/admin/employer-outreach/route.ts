/**
 * POST /api/admin/employer-outreach
 *
 * Sends a personalized email to every employer explaining the free Growth package.
 * Auth: Authorization: Bearer CRON_SECRET
 * Query: ?dry=true for preview mode (no emails sent)
 */
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE = 'https://pmhnphiring.com';

function buildEmail(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;padding:0;}
  table{border-collapse:collapse;border-spacing:0;}
  td{padding:0;}
  img{border:0;display:block;}
  @media only screen and (max-width:600px){
    .container{width:100%!important;}
    .pad{padding-left:24px!important;padding-right:24px!important;}
    .grid-cell{display:block!important;width:100%!important;padding:0 0 12px 0!important;}
    .cta{display:block!important;width:100%!important;}
    .hero-title{font-size:32px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#ffffff;">
  Your $299 Growth package is active — Featured listings, candidate unlocks, InMails &amp; more included free &#8199;&#65279;&#847;
</div>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
<tr><td align="center">

<table role="presentation" class="container" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;">

  <!-- NAV BAR -->
  <tr>
    <td class="pad" style="padding:24px 48px 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td>
            <img src="${BASE}/logo.png" width="36" height="36" alt="P" style="width:36px;height:36px;border-radius:8px;" />
          </td>
          <td style="text-align:right;">
            <a href="${BASE}" style="font-size:13px;color:#6b7280;text-decoration:none;font-weight:500;">pmhnphiring.com</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- HERO -->
  <tr>
    <td class="pad" style="padding:16px 48px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(145deg,#0f766e 0%,#134e4a 100%);border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:48px 40px 44px;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.6);">Free During Launch</p>
            <h1 class="hero-title" style="margin:0 0 14px;font-size:36px;font-weight:800;color:#ffffff;line-height:1.15;letter-spacing:-0.5px;">
              Your Growth Package<br/>is active.
            </h1>
            <p style="margin:0;font-size:16px;color:rgba(255,255,255,0.75);line-height:1.55;">
              Every job you post includes our $299 Growth tier — at no cost to you. Here's what that means.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- METRICS BAR -->
  <tr>
    <td class="pad" style="padding:20px 48px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr>
          <td width="50%" style="padding:18px 12px;text-align:center;border-right:1px solid #e5e7eb;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#0f766e;">5,000+</p>
            <p style="margin:3px 0 0;font-size:11px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Job Listings</p>
          </td>
          <td width="50%" style="padding:18px 12px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#0f766e;">50</p>
            <p style="margin:3px 0 0;font-size:11px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">States Covered</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- SECTION LABEL -->
  <tr>
    <td class="pad" style="padding:36px 48px 20px;">
      <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;">What's included in every posting</p>
    </td>
  </tr>

  <!-- 2x3 FEATURE GRID -->
  <tr>
    <td class="pad" style="padding:0 42px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td class="grid-cell" width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
            <div style="background:#f0fdfa;border-radius:12px;padding:22px 20px;min-height:110px;">
              <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0d9488;">60 days</p>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;">Extended Listing</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">2× the standard duration for maximum visibility.</p>
            </div>
          </td>
          <td class="grid-cell" width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
            <div style="background:#fffbeb;border-radius:12px;padding:22px 20px;min-height:110px;">
              <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#d97706;">&#9733; Featured</p>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;">Badge + Top Rank</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Stand out in search with a prominent badge.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td class="grid-cell" width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
            <div style="background:#eff6ff;border-radius:12px;padding:22px 20px;min-height:110px;">
              <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#2563eb;">Daily</p>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;">Email Alerts</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Priority spot in daily job alert emails to PMHNPs.</p>
            </div>
          </td>
          <td class="grid-cell" width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
            <div style="background:#faf5ff;border-radius:12px;padding:22px 20px;min-height:110px;">
              <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#7c3aed;">25</p>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;">Candidate Unlocks</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">View full profiles of interested applicants.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td class="grid-cell" width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
            <div style="background:#fdf2f8;border-radius:12px;padding:22px 20px;min-height:110px;">
              <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#db2777;">25</p>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;">InMails per Post</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Message candidates directly on platform.</p>
            </div>
          </td>
          <td class="grid-cell" width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
            <div style="background:#ecfdf5;border-radius:12px;padding:22px 20px;min-height:110px;">
              <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#059669;">Live</p>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;">Advanced Analytics</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Track views, clicks &amp; sources in real time.</p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td class="pad" style="padding:24px 48px 8px;text-align:center;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${BASE}/post-job" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="16%" fillcolor="#0d9488">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Post a Job — Free</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${BASE}/post-job" class="cta" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:15px 48px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:16px;letter-spacing:0.2px;">
        Post a Job — Free
      </a>
      <!--<![endif]-->
    </td>
  </tr>
  <tr>
    <td style="padding:10px 48px 0;text-align:center;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">No credit card required &nbsp;&middot;&nbsp; Takes 5 minutes</p>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 48px 0;text-align:center;">
      <a href="${BASE}/employer/dashboard" style="font-size:13px;font-weight:600;color:#0d9488;text-decoration:none;">View your dashboard &rarr;</a>
    </td>
  </tr>

  <!-- DIVIDER -->
  <tr>
    <td class="pad" style="padding:36px 48px 0;">
      <div style="height:1px;background:#f3f4f6;"></div>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td class="pad" style="padding:24px 48px 40px;text-align:center;">
      <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;line-height:1.6;">
        Questions? Reply to this email or write to <a href="mailto:hello@pmhnphiring.com" style="color:#0d9488;text-decoration:none;">hello@pmhnphiring.com</a>
      </p>
      <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;">
        <a href="https://www.linkedin.com/company/pmhnpjobs" style="color:#9ca3af;text-decoration:none;">LinkedIn</a> &nbsp;&middot;&nbsp;
        <a href="https://x.com/pmhnphiring" style="color:#9ca3af;text-decoration:none;">X</a> &nbsp;&middot;&nbsp;
        <a href="https://www.instagram.com/pmhnphiring" style="color:#9ca3af;text-decoration:none;">Instagram</a> &nbsp;&middot;&nbsp;
        <a href="https://www.facebook.com/pmhnphiring" style="color:#9ca3af;text-decoration:none;">Facebook</a>
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        &copy; 2026 PMHNP Hiring &middot; <a href="${BASE}" style="color:#9ca3af;text-decoration:none;">pmhnphiring.com</a>
      </p>
    </td>
  </tr>

</table>

</td></tr>
</table>
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
    .replace(/&middot;/gi, '·')
    .replace(/&rarr;/gi, '→')
    .replace(/&copy;/gi, '©')
    .replace(/&#\d+;/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const isDry = url.searchParams.get('dry') === 'true';

  try {
    const employerJobs = await prisma.employerJob.findMany({
      select: { contactEmail: true, employerName: true },
      distinct: ['contactEmail'],
    });
    const employerLeads = await prisma.employerLead.findMany({
      where: { contactEmail: { not: null } },
      select: { contactEmail: true, contactName: true, companyName: true },
    });
    const employerProfiles = await prisma.userProfile.findMany({
      where: { role: 'employer' },
      select: { email: true, firstName: true, company: true },
    });

    // Deduplicate by email
    const emailMap = new Map<string, { name: string; company: string }>();
    for (const ej of employerJobs) {
      const email = ej.contactEmail.toLowerCase().trim();
      if (!emailMap.has(email)) emailMap.set(email, { name: '', company: ej.employerName || '' });
    }
    for (const ep of employerProfiles) {
      const email = ep.email.toLowerCase().trim();
      if (!emailMap.has(email)) {
        emailMap.set(email, { name: ep.firstName || '', company: ep.company || '' });
      } else {
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
      email, name: data.name, company: data.company,
    }));

    if (isDry) {
      return NextResponse.json({
        mode: 'DRY RUN — no emails sent',
        totalRecipients: recipients.length,
        recipients: recipients.slice(0, 20),
      });
    }

    // Send in batches of 50
    const BATCH_SIZE = 50;
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const html = buildEmail();
    const text = htmlToPlainText(html);

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const emails = batch.map(r => ({
        from: 'PMHNP Hiring <hello@pmhnphiring.com>',
        to: r.email,
        replyTo: 'hello@pmhnphiring.com',
        subject: 'Your free Growth package is waiting',
        html,
        text,
      }));

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

      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

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
      success: true, sent, failed,
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
