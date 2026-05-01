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
  const showAll = searchParams.get('all') === '1';

  if (showAll) {
    const sections = Object.entries(templates).map(([key, t]) => {
      const emailHtml = t.fn().replace(/"/g, '&quot;');
      return `
        <section id="${key}" class="preview-section">
          <header class="preview-label">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;">
              <div>
                <div style="font-family:${F};font-size:15px;font-weight:700;color:${TEXT};">${t.label}</div>
                <div style="font-family:${F};font-size:12px;color:${MUTED};margin-top:2px;">${t.desc}</div>
              </div>
              <div style="font-family:'SF Mono',Consolas,monospace;font-size:11px;color:${MUTED};background:#fff;border:1px solid ${BORDER};padding:3px 8px;border-radius:6px;">${key}</div>
            </div>
          </header>
          <iframe class="preview-frame" srcdoc="${emailHtml}" scrolling="no" onload="window.__fitFrame&&window.__fitFrame(this)"></iframe>
        </section>`;
    }).join('');

    const toc = Object.entries(templates).map(([key, t]) =>
      `<a href="#${key}" style="display:inline-block;margin:0 8px 8px 0;padding:6px 12px;background:#fff;border:1px solid ${BORDER};border-radius:999px;font-family:${F};font-size:12px;color:${TEXT};text-decoration:none;">${t.label}</a>`
    ).join('');

    // Mobile width = iPhone 13/14/15 standard (390px). Desktop = typical email max-width (640px).
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>All Email Previews — PMHNP Hiring</title>
      <style>
        * { box-sizing: border-box; }
        body { background: ${BG}; color: ${TEXT}; font-family: ${F}; margin: 0; padding: 0 16px 80px; }
        .header-bar { max-width: 1100px; margin: 0 auto; padding: 0 8px; }
        .toolbar { position: sticky; top: 0; z-index: 10; background: ${BG}; padding: 16px 0 12px; margin: 0 -16px; padding-left: 24px; padding-right: 24px; border-bottom: 1px solid ${BORDER}; }
        .toolbar-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .mode-toggle { display: inline-flex; background: #fff; border: 1px solid ${BORDER}; border-radius: 999px; padding: 4px; gap: 2px; }
        .mode-toggle button { background: transparent; border: 0; padding: 6px 16px; border-radius: 999px; font-family: ${F}; font-size: 13px; font-weight: 600; color: ${MUTED}; cursor: pointer; transition: all 0.15s; }
        .mode-toggle button.active { background: ${TEXT}; color: #fff; }
        .preview-section { margin: 0 auto 56px; transition: max-width 0.2s ease; }
        .preview-label { padding: 0 4px 14px; background: transparent; }
        .preview-frame { width: 100%; border: 1px solid ${BORDER}; border-radius: 12px; background: #fff; display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        body[data-mode="mobile"] .preview-section { max-width: 390px; }
        body[data-mode="desktop"] .preview-section { max-width: 640px; }
        a:hover { background: ${CARD} !important; }
      </style>
      </head>
      <body data-mode="mobile">
        <div class="toolbar">
          <div class="toolbar-inner">
            <div>
              <div style="font-size:18px;font-weight:bold;">Email Previews</div>
              <div style="color:${MUTED};font-size:12px;margin-top:2px;">${Object.keys(templates).length} templates · <a href="/api/email-preview" style="color:${TEXT};">index</a></div>
            </div>
            <div class="mode-toggle" role="tablist" aria-label="Viewport">
              <button type="button" data-mode="mobile" class="active" aria-pressed="true">📱 Mobile · 390px</button>
              <button type="button" data-mode="desktop" aria-pressed="false">🖥 Desktop · 640px</button>
            </div>
          </div>
        </div>
        <div class="header-bar" style="padding-top:24px;">
          <div style="margin-bottom:24px;">${toc}</div>
        </div>
        ${sections}
        <script>
          (function(){
            function fitFrame(f){
              try {
                var doc = f.contentWindow && f.contentWindow.document;
                if (!doc || !doc.body) return;
                // body.scrollHeight is the natural content height. Add buffer for any rounding.
                var h = doc.body.scrollHeight;
                if (h > 0) f.style.height = (h + 24) + 'px';
              } catch(e){}
            }
            window.__fitFrame = fitFrame;

            // Brute-force polling: aggressively re-measure the first 3 seconds (covers
            // font loads, image loads, layout reflows), then once more at 5s to catch
            // any late CDN images.
            function pollFrame(f){
              for (var i = 1; i <= 30; i++) setTimeout(fitFrame.bind(null, f), i * 100);
              setTimeout(fitFrame.bind(null, f), 5000);
            }

            function pollAll(){
              document.querySelectorAll('iframe.preview-frame').forEach(pollFrame);
            }

            function setMode(mode){
              document.body.dataset.mode = mode;
              sessionStorage.setItem('email-preview-mode', mode);
              document.querySelectorAll('.mode-toggle button').forEach(function(b){
                var active = b.dataset.mode === mode;
                b.classList.toggle('active', active);
                b.setAttribute('aria-pressed', active ? 'true' : 'false');
              });
              // Width changed → email media query may flip → reflow → re-measure
              pollAll();
            }

            var stored = sessionStorage.getItem('email-preview-mode');
            if (stored === 'desktop') setMode('desktop');

            document.querySelectorAll('.mode-toggle button').forEach(function(btn){
              btn.addEventListener('click', function(){ setMode(btn.dataset.mode); });
            });

            // First pass on every iframe
            pollAll();
          })();
        </script>
      </body></html>`,
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          // Admin-only debug preview UI. Override the strict nonce CSP from middleware
          // so the inline polling script and iframe srcdocs can run.
          'Content-Security-Policy': "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline'; script-src-elem 'self' 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' data:; connect-src 'self'",
        },
      }
    );
  }

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
          <p style="color: ${MUTED}; font-size: 14px; margin: 0 0 24px;">${Object.keys(templates).length} templates · Click any to preview · <a href="?all=1" style="color: ${TEXT}; font-weight: 600;">View all on one page →</a></p>
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
