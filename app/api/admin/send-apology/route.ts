/**
 * POST /api/admin/send-apology
 * One-time apology email to all employers for the broken outreach.
 * Hardcoded production URL — no env var dependency.
 */
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

const apologyHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #eee;"><div style="font-size:18px;font-weight:700;color:#111827;">PMHNP Hiring</div></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">Hi there,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">You may have received an email from us a few minutes ago with broken links and formatting issues. We sincerely apologize for the inconvenience — that email was sent in error due to a technical issue on our end.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;"><strong>Please disregard the previous email entirely.</strong></p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">We'll follow up soon with the correct information. In the meantime, if you have any questions, feel free to reply to this email.</p>
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">Thank you for your patience,<br /><strong>The PMHNP Hiring Team</strong></p>
  </td></tr>
  <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eee;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">&copy; 2026 PMHNP Hiring &middot; <a href="https://pmhnphiring.com" style="color:#9CA3AF;">pmhnphiring.com</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const employerJobs = await prisma.employerJob.findMany({
    select: { contactEmail: true },
    distinct: ['contactEmail'],
  });
  const employerProfiles = await prisma.userProfile.findMany({
    where: { role: 'employer' },
    select: { email: true },
  });
  const employerLeads = await prisma.employerLead.findMany({
    where: { contactEmail: { not: null } },
    select: { contactEmail: true },
  });

  const emails = new Set<string>();
  employerJobs.forEach(e => emails.add(e.contactEmail.toLowerCase().trim()));
  employerProfiles.forEach(e => emails.add(e.email.toLowerCase().trim()));
  employerLeads.forEach(e => { if (e.contactEmail) emails.add(e.contactEmail.toLowerCase().trim()); });

  const recipients = Array.from(emails);

  const batch = recipients.map(email => ({
    from: 'PMHNP Hiring <hello@pmhnphiring.com>',
    to: email,
    replyTo: 'hello@pmhnphiring.com',
    subject: 'Please disregard our previous email — our apologies',
    html: apologyHtml,
    text: `Hi there,\n\nYou may have received an email from us a few minutes ago with broken links and formatting issues. We sincerely apologize for the inconvenience — that email was sent in error due to a technical issue on our end.\n\nPlease disregard the previous email entirely.\n\nWe will follow up soon with the correct information. In the meantime, if you have any questions, feel free to reply to this email.\n\nThank you for your patience,\nThe PMHNP Hiring Team\n\npmhnphiring.com`,
  }));

  const result = await resend.batch.send(batch);
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, sent: recipients.length, recipients });
}
