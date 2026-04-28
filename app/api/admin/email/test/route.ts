import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { v2Templates } from '@/app/api/email-preview/v2-templates';

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Email Test Endpoint
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET  /api/admin/email/test                → Template index (HTML)
// GET  /api/admin/email/test?template=xxx   → Rendered preview (HTML)
// GET  /api/admin/email/test?template=xxx&raw=1  → Raw HTML source (text/plain)
//
// The `raw=1` flag returns the actual production HTML as plain text,
// ready to paste into Email on Acid, Litmus, or any cross-client tester.
//
// POST /api/admin/email/test               → Send a real test email
//      Body: { template: string, to: string }
//
// ═══════════════════════════════════════════════════════════════════════════════

const SANS = "'Inter', system-ui, sans-serif";
const BG = '#F3F2EF';
const CARD = '#FFF8EE';
const BORDER = '#EDF2F7';
const TEXT = '#2D3748';
const MUTED = '#718096';
const TEAL = '#0D9488';

// ─── GET: Preview templates ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authError = await requireApiAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const template = searchParams.get('template');
  const raw = searchParams.get('raw') === '1';

  // ── No template? Show index page ──────────────────────────────────────────
  if (!template) {
    const cards = Object.entries(v2Templates)
      .map(
        ([key, t]) =>
          `<div style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;padding:18px 22px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <div style="font-family:${SANS};font-size:15px;font-weight:700;color:${TEXT};margin-bottom:3px;">${t.label}</div>
                <div style="font-family:${SANS};font-size:13px;color:${MUTED};">${t.desc}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <a href="?template=${key}" style="display:inline-block;padding:7px 16px;border-radius:8px;font-family:${SANS};font-size:12px;font-weight:600;color:#fff;background:${TEAL};text-decoration:none;">Preview</a>
              <a href="?template=${key}&raw=1" style="display:inline-block;padding:7px 16px;border-radius:8px;font-family:${SANS};font-size:12px;font-weight:600;color:${TEXT};background:#F3F6F4;border:1px solid #E0E5E1;text-decoration:none;">Raw HTML</a>
            </div>
          </div>`
      )
      .join('');

    return new NextResponse(
      `<!DOCTYPE html><html><head>
        <title>Email Test Console — PMHNP Hiring</title>
        <style>
          * { box-sizing: border-box; }
          body { background: ${BG}; color: ${TEXT}; font-family: ${SANS}; margin: 0; padding: 40px 20px; }
          .container { max-width: 680px; margin: 0 auto; }
          .header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
          pre { background: #1a1a2e; color: #e0e0e0; padding: 16px; border-radius: 10px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
          .section { margin: 32px 0 16px; font-size: 13px; font-weight: 700; color: ${MUTED}; text-transform: uppercase; letter-spacing: 1.5px; }
        </style>
      </head><body>
        <div class="container">
          <div class="header">
            <h1 style="font-size: 24px; font-weight: 700; margin: 0;">Email Test Console</h1>
            <span class="badge">V2 Warm Diorama</span>
          </div>
          <p style="color: ${MUTED}; font-size: 14px; margin: 0 0 24px;">${Object.keys(v2Templates).length} templates · Click Preview or Raw HTML for Email on Acid testing</p>
          
          <div class="section">Email Templates</div>
          ${cards}
          
          <div class="section" style="margin-top: 40px;">API Usage</div>
          <pre>
# Preview in browser
GET /api/admin/email/test?template=welcome

# Get raw HTML for Email on Acid
GET /api/admin/email/test?template=welcome&raw=1

# Send a real test email
POST /api/admin/email/test
{ "template": "welcome", "to": "your@email.com" }
          </pre>
          
          <p style="color: ${MUTED}; font-size: 12px; margin-top: 24px; text-align: center;">
            These templates use the <strong>exact same</strong> V2 rendering code as production emails
          </p>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // ── Template selected ─────────────────────────────────────────────────────
  const entry = v2Templates[template];
  if (!entry) {
    return NextResponse.json(
      {
        error: 'Template not found',
        available: Object.keys(v2Templates),
      },
      { status: 404 }
    );
  }

  const html = entry.fn();

  // ── Raw mode: return plain text for Email on Acid ─────────────────────────
  if (raw) {
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `inline; filename="${template}.html"`,
      },
    });
  }

  // ── Preview mode: render in browser with toolbar ──────────────────────────
  const toolbar = `
    <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1a1a2e;color:#e0e0e0;font-family:${SANS};padding:10px 20px;display:flex;align-items:center;gap:16px;box-shadow:0 2px 12px rgba(0,0,0,0.3);">
      <a href="/api/admin/email/test" style="color:#4DB6AC;text-decoration:none;font-weight:600;font-size:14px;">← All Templates</a>
      <span style="color:#718096;">|</span>
      <span style="font-size:14px;font-weight:600;">${entry.label}</span>
      <span style="flex:1;"></span>
      <a href="?template=${template}&raw=1" style="display:inline-block;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;color:#fff;background:#0D9488;text-decoration:none;" target="_blank">📋 Copy Raw HTML</a>
      <button onclick="navigator.clipboard.writeText(document.getElementById('email-frame').srcdoc || '')" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;color:#fff;background:#7C8CF5;border:none;cursor:pointer;">📎 Copy to Clipboard</button>
    </div>
    <div style="height:46px;"></div>`;

  const wrappedHtml = `<!DOCTYPE html><html><head>
    <title>Preview: ${entry.label}</title>
    <script>
      // Store raw HTML for clipboard copy
      const rawHtml = ${JSON.stringify(html)};
      function copyRawHtml() {
        navigator.clipboard.writeText(rawHtml).then(() => {
          const btn = document.getElementById('copy-btn');
          btn.textContent = '✓ Copied!';
          setTimeout(() => btn.textContent = '📎 Copy to Clipboard', 2000);
        });
      }
    </script>
  </head><body style="margin:0;padding:0;background:#F3F2EF;">
    <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1a1a2e;color:#e0e0e0;font-family:${SANS};padding:10px 20px;display:flex;align-items:center;gap:16px;box-shadow:0 2px 12px rgba(0,0,0,0.3);">
      <a href="/api/admin/email/test" style="color:#4DB6AC;text-decoration:none;font-weight:600;font-size:14px;">← All Templates</a>
      <span style="color:#718096;">|</span>
      <span style="font-size:14px;font-weight:600;">${entry.label}</span>
      <span style="flex:1;"></span>
      <a href="?template=${template}&raw=1" style="display:inline-block;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;color:#fff;background:#0D9488;text-decoration:none;" target="_blank">📄 Raw HTML</a>
      <button id="copy-btn" onclick="copyRawHtml()" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;color:#fff;background:#7C8CF5;border:none;cursor:pointer;">📎 Copy to Clipboard</button>
    </div>
    <div style="height:46px;"></div>
    ${html}
  </body></html>`;

  return new NextResponse(wrappedHtml, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ─── POST: Send a real test email ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authError = await requireApiAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { template, to } = body;

    if (!template || !to) {
      return NextResponse.json(
        { error: 'Missing required fields: template, to' },
        { status: 400 }
      );
    }

    const entry = v2Templates[template];
    if (!entry) {
      return NextResponse.json(
        { error: 'Template not found', available: Object.keys(v2Templates) },
        { status: 404 }
      );
    }

    // Import Resend to send the test email directly
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const html = entry.fn();

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>',
      to,
      subject: `[TEST] ${entry.label}`,
      html,
      text: 'This is a test email from PMHNP Hiring admin console.',
    });

    return NextResponse.json({
      success: true,
      template,
      to,
      label: entry.label,
      resendId: result?.data?.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
