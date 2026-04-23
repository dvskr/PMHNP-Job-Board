import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { v2Templates } from './v2-templates';

// ── Template index page styling ──────────────────────────────────────────────
const F = "Arial, Helvetica, sans-serif";
const BG = '#F3F2EF';
const CARD = '#FFF8EE';
const BORDER = '#EDF2F7';
const TEXT = '#2D3748';
const MUTED = '#718096';

const templates = v2Templates;

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authError = await requireApiAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const template = searchParams.get('template');

  if (!template) {
    const cards = Object.entries(templates).map(([key, t]) =>
      `<a href="?template=${key}" style="display: block; padding: 16px 20px; background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 12px; margin-bottom: 10px; text-decoration: none; transition: border-color 0.2s;">
        <div style="font-family: ${F}; font-size: 15px; font-weight: bold; color: ${TEXT}; margin-bottom: 4px;">${t.label}</div>
        <div style="font-family: ${F}; font-size: 13px; color: ${MUTED};">${t.desc}</div>
      </a>`
    ).join('');

    return new NextResponse(
      `<!DOCTYPE html><html><head><title>Email Previews — PMHNP Hiring</title>
      <style>
        * { box-sizing: border-box; }
        body { background: ${BG}; color: ${TEXT}; font-family: ${F}; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        a:hover { border-color: #CBD5E0 !important; }
      </style>
      </head>
      <body>
        <div class="container">
          <h1 style="font-size: 24px; font-weight: bold; margin: 0 0 4px;">Email Template Previews</h1>
          <p style="color: ${MUTED}; font-size: 14px; margin: 0 0 24px;">${Object.keys(templates).length} templates · Click any to preview</p>
          ${cards}
          <p style="color: ${MUTED}; font-size: 12px; margin-top: 24px; text-align: center;">These previews use sample data</p>
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
