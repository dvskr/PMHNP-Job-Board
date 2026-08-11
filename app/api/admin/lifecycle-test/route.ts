import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { sendAndLog, getOrCreateUnsubToken } from '@/lib/email-service';
import { LIFECYCLE_EMAILS, getLifecycleEmail } from '@/lib/lifecycle-emails';

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Lifecycle Email Console
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET  /api/admin/lifecycle-test                 → registry index (HTML)
// GET  /api/admin/lifecycle-test?emailId=xxx     → rendered preview (HTML)
// GET  /api/admin/lifecycle-test?emailId=xxx&raw=1 → raw HTML source (text/plain)
// POST /api/admin/lifecycle-test  { emailId }    → test-send to the
//      authenticated admin's OWN email. The recipient is always taken from
//      the session; a `to` field in the body is ignored by design so this
//      endpoint can never mail anyone but the admin doing the testing.
//
// Test sends work while ENABLE_LIFECYCLE_EMAILS is off — that is the point:
// the operator verifies rendering and deliverability BEFORE enabling the cron.
// Test sends never write LifecycleEmailSend rows, and their '[TEST]' subject
// prefix excludes them from the shared 7-day marketing cap.
//
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');

const SANS = "'Inter', system-ui, sans-serif";
const BG = '#F3F2EF';
const CARD = '#FFF8EE';
const BORDER = '#EDF2F7';
const TEXT = '#2D3748';
const MUTED = '#718096';
const TEAL = '#0D9488';

export async function GET(request: NextRequest) {
  const authError = await requireApiAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const emailId = searchParams.get('emailId');
  const raw = searchParams.get('raw') === '1';

  if (!emailId) {
    const cards = LIFECYCLE_EMAILS.map(
      (def) =>
        `<div style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;padding:18px 22px;margin-bottom:10px;">
          <div style="font-family:${SANS};font-size:11px;font-weight:700;color:${def.audience === 'employer' ? '#92400E' : '#065F46'};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${def.audience}</div>
          <div style="font-family:${SANS};font-size:15px;font-weight:700;color:${TEXT};margin-bottom:3px;">${def.label}</div>
          <div style="font-family:${SANS};font-size:13px;color:${MUTED};">Subject: ${def.subject(def.sampleContext)}</div>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <a href="?emailId=${def.id}" style="display:inline-block;padding:7px 16px;border-radius:8px;font-family:${SANS};font-size:12px;font-weight:600;color:#fff;background:${TEAL};text-decoration:none;">Preview</a>
            <a href="?emailId=${def.id}&raw=1" style="display:inline-block;padding:7px 16px;border-radius:8px;font-family:${SANS};font-size:12px;font-weight:600;color:${TEXT};background:#F3F6F4;border:1px solid #E0E5E1;text-decoration:none;">Raw HTML</a>
          </div>
        </div>`,
    ).join('');

    return new NextResponse(
      `<!DOCTYPE html><html><head>
        <title>Lifecycle Email Console</title>
        <style>
          * { box-sizing: border-box; }
          body { background: ${BG}; color: ${TEXT}; font-family: ${SANS}; margin: 0; padding: 40px 20px; }
          .container { max-width: 680px; margin: 0 auto; }
          pre { background: #1a1a2e; color: #e0e0e0; padding: 16px; border-radius: 10px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
          .section { margin: 32px 0 16px; font-size: 13px; font-weight: 700; color: ${MUTED}; text-transform: uppercase; letter-spacing: 1.5px; }
        </style>
      </head><body>
        <div class="container">
          <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;">Lifecycle Email Console</h1>
          <p style="color:${MUTED};font-size:14px;margin:0 0 24px;">${LIFECYCLE_EMAILS.length} registry emails. Test sends go ONLY to your own admin email. Real sends stay off until ENABLE_LIFECYCLE_EMAILS=1.</p>
          <div class="section">Registry</div>
          ${cards}
          <div class="section">API Usage</div>
          <pre>
# Preview in browser
GET /api/admin/lifecycle-test?emailId=candidate_day2_alert

# Raw HTML for cross-client testing
GET /api/admin/lifecycle-test?emailId=candidate_day2_alert&raw=1

# Test-send to YOUR OWN admin email (recipient comes from your session)
POST /api/admin/lifecycle-test
{ "emailId": "candidate_day2_alert" }

# Dry-run the cron (no sends, no claims)
GET /api/cron/lifecycle-emails?dryRun=1
          </pre>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const def = getLifecycleEmail(emailId);
  if (!def) {
    return NextResponse.json(
      { error: 'Unknown emailId', available: LIFECYCLE_EMAILS.map((d) => d.id) },
      { status: 404 },
    );
  }

  const html = def.buildHtml(def.sampleContext);

  if (raw) {
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `inline; filename="${def.id}.html"`,
      },
    });
  }

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  const authError = await requireApiAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const emailId = typeof body?.emailId === 'string' ? body.emailId : null;
    if (!emailId) {
      return NextResponse.json(
        { error: 'Missing required field: emailId', available: LIFECYCLE_EMAILS.map((d) => d.id) },
        { status: 400 },
      );
    }

    const def = getLifecycleEmail(emailId);
    if (!def) {
      return NextResponse.json(
        { error: 'Unknown emailId', available: LIFECYCLE_EMAILS.map((d) => d.id) },
        { status: 404 },
      );
    }

    // Recipient is ALWAYS the authenticated admin's own address. requireApiAdmin
    // already verified the session belongs to an admin; re-read it for the email.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Admin session has no email address' },
        { status: 400 },
      );
    }

    // '[TEST]' prefix keeps this send out of the shared 7-day marketing cap
    // (the cron excludes subjects starting with [TEST] from EmailSend counts).
    // No LifecycleEmailSend row is written: a test never burns the one-shot
    // per-user emailId slot.
    // Marketing-class mail needs List-Unsubscribe headers even when the only
    // recipient is the admin doing the testing: the point of a test send is to
    // see exactly what real recipients will get, headers included.
    const unsubToken = await getOrCreateUnsubToken(user.email);
    const sendResult = await sendAndLog(
      {
        from: '', // overridden by sendAndLog ('lifecycle' is in MARKETING_EMAIL_TYPES)
        to: user.email,
        subject: `[TEST] ${def.subject(def.sampleContext)}`,
        html: def.buildHtml(def.sampleContext),
      },
      'lifecycle',
      { lifecycleEmailId: def.id, lifecycleTest: true },
      `${BASE_URL}/unsubscribe?token=${unsubToken}`,
    );
    // sendAndLog only throws on a transport fault; an API-level rejection comes
    // back in `error` with nothing sent. Reporting success there would leave the
    // operator waiting on mail that was never accepted, which is the one thing
    // this endpoint exists to rule out before enabling the flag.
    if (sendResult?.error) {
      logger.error('Lifecycle test send rejected', sendResult.error, { emailId: def.id });
      return NextResponse.json(
        { error: `Send rejected: ${sendResult.error.message}` },
        { status: 502 },
      );
    }

    logger.info('Lifecycle test email sent', { emailId: def.id, to: user.email });
    return NextResponse.json({ success: true, emailId: def.id, to: user.email });
  } catch (error) {
    logger.error('Lifecycle test send failed', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
