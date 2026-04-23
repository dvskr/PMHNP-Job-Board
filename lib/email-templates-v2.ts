// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES V2 — "Warm Diorama" Design System
// ═══════════════════════════════════════════════════════════════════════════════
//
// Light-mode, warm-tone email design system for pmhnphiring.com
// Typography: Lora (headings + body) + Inter (UI/buttons/labels)
// Palette: warm off-white → soft cream → peach accents
//
// Matches the hand-crafted V2 templates from the original design iterations.
// Key structural decisions:
//   - 600px container, 8px border-radius
//   - Peach header bar with 100×100 logo SIDE-BY-SIDE with brand text
//   - Explicit <tr> spacer rows (not padding hacks) for email-client compatibility
//   - Lora serif for headings (36px) and body (19px)
//   - Inter sans-serif for buttons, labels, and muted text
//   - Security/info cards: #F3F2EF bg with #EDF2F7 border, 12px radius
//   - CTA button: #4DB6AC, 14px/40px padding, 8px radius, 16px font

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');

// ── Font stacks ──────────────────────────────────────────────────────────────
export const SERIF = "'Lora', Georgia, 'Times New Roman', serif";
export const SANS = "'Inter', system-ui, sans-serif";

// ── V2 Color tokens ─────────────────────────────────────────────────────────
export const V2 = {
  // Backgrounds
  bgBody: '#F3F2EF',         // warm off-white body
  bgCard: '#FFF8EE',         // soft cream card
  bgCardAlt: '#F3F2EF',      // muted card / info box
  bgElevated: '#FFFFFF',     // pure white for elevated elements
  bgPeach: '#F0C4A4',        // peach header bar
  bgPeachLight: '#FBE8D8',   // light peach tint
  bgAmberWarn: '#FFFBEB',    // amber warning card bg
  bgGreenSuccess: '#ECFDF5', // green success card bg

  // Text (Tailwind Gray scale, warm-shifted)
  textHeading: '#2D3748',    // gray-800 — headings
  textPrimary: '#1F2937',    // gray-800 — brand text in header
  textBody: '#4A5568',       // gray-600 — body paragraphs
  textSecondary: '#4A5568',  // gray-600 — alias
  textMuted: '#718096',      // gray-500 — fallback links, security notes
  textLabel: '#5A4A3A',      // warm brown — header tagline
  textDimmed: '#718096',     // gray-500 — footer
  textFaded: '#A0AEC0',      // gray-400 — very light accents

  // Brand
  teal: '#0D9488',           // teal-600 — link color
  tealButton: '#4DB6AC',     // teal-400 — button bg
  emerald: '#059669',        // emerald-600 — success accent
  amber: '#D97706',          // amber-600 — warning accent
  amberDark: '#92400E',      // amber-900 — warning text
  red: '#DC2626',            // red-600 — error
  blue: '#2563EB',           // blue-600 — info

  // Borders
  borderLight: '#EDF2F7',    // gray-100 — card/info box borders
  borderMed: '#E2E8F0',      // gray-200
  borderAmber: '#FDE68A',    // amber-200 — warning borders
  borderGreen: '#A7F3D0',    // green-200 — success borders
  borderPeach: '#F0C4A4',    // peach
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHELL V2 — Light-theme email wrapper
// ═══════════════════════════════════════════════════════════════════════════════
//
// Structure matches the hand-crafted Supabase auth templates:
// - 600px card, 8px radius, #FFF8EE bg
// - Padding: 24px top, 48px bottom
// - Footer: simple ©, pmhnphiring.com, hello@

export function emailShellV2(content: string, footerContent: string = '', preheaderText: string = ''): string {
  const preheader = preheaderText || 'PMHNP Hiring — The #1 job board for Psychiatric Mental Health Nurse Practitioners';
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;0,700;1,400&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    table { border-collapse: collapse; border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; display: block; max-width: 100%; }
    h1, h2, h3, p { margin: 0; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .header-pad { padding: 16px 24px !important; }
      .btn-full { display: block !important; width: 100% !important; text-align: center !important; }
      .stack td { display: block !important; width: 100% !important; padding-right: 0 !important; padding-bottom: 10px !important; }
      .stat-cell { display: block !important; width: 100% !important; margin-bottom: 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${V2.bgBody};font-family:${SERIF};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${V2.bgBody};">
    <tr>
      <td align="center" style="padding:24px 0 48px;">

        <!-- Preheader -->
        <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${V2.bgBody};">
          ${preheader} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
        </div>

        <!-- Main Card -->
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:${V2.bgCard};border-radius:8px;overflow:hidden;">
          ${content}
        </table>

        <!-- Footer -->
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:24px 24px 8px;text-align:center;">
              ${footerContent}
              <p style="margin:8px 0 0;font-family:${SANS};font-size:13px;color:${V2.textMuted};">
                &copy; ${new Date().getFullYear()} PMHNP Hiring &nbsp;&middot;&nbsp;
                <a href="${BASE_URL}" style="color:${V2.textMuted};text-decoration:underline;">pmhnphiring.com</a> &nbsp;&middot;&nbsp;
                <a href="mailto:support@pmhnphiring.com" style="color:${V2.textMuted};text-decoration:underline;">support@pmhnphiring.com</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER V2 — Peach banner bar with logo + brand text side-by-side
// ═══════════════════════════════════════════════════════════════════════════════
//
// Layout: [100×100 logo] [PMHNP Hiring / Mental Health Careers]
// The logo and text sit side-by-side with the text bottom-aligned.

export function headerBlockV2(title: string, subtitle: string = ''): string {
  return `
          <!-- Peach Header Bar -->
          <tr>
            <td align="center" style="background-color:${V2.bgPeach};padding:14px 0 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td valign="middle">
                    <img src="${BASE_URL}/logo.png" alt="" width="100" height="100" style="display:block;width:100px;height:100px;object-fit:contain;" />
                  </td>
                  <td valign="bottom" style="padding-bottom:24px;">
                    <span style="font-family:${SERIF};font-size:28px;font-weight:700;color:${V2.textPrimary};letter-spacing:-0.02em;display:block;line-height:1;margin-left:-24px;">PMHNP Hiring</span>
                    <span style="font-family:${SANS};font-size:10px;font-weight:500;color:${V2.textLabel};letter-spacing:0.08em;text-transform:uppercase;display:block;line-height:1;margin-left:-24px;margin-top:4px;">Mental Health Careers</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Area -->
          <tr>
            <td style="background-color:${V2.bgCard};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">

                <!-- Heading -->
                <tr>
                  <td class="content-pad" style="padding:48px 40px 0;text-align:center;">
                    <h1 style="margin:0;font-family:${SERIF};font-size:36px;font-weight:normal;color:${V2.textHeading};line-height:1.2;letter-spacing:-0.5px;">
                      ${title}
                    </h1>
                    ${subtitle ? `<p style="margin:16px 0 0;font-family:${SERIF};font-size:19px;color:${V2.textBody};line-height:1.6;">${subtitle}</p>` : ''}
                  </td>
                </tr>

                <!-- Spacer -->
                <tr><td style="padding:0;height:40px;line-height:40px;font-size:1px;">&nbsp;</td></tr>`;
}

// Amber variant for warnings (expiry, etc.)
export function amberHeaderV2(title: string, subtitle: string = ''): string {
  return `
          <!-- Amber Warning Header Bar -->
          <tr>
            <td align="center" style="background-color:${V2.bgAmberWarn};padding:14px 0 12px;border-bottom:2px solid ${V2.amber};">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td valign="middle">
                    <img src="${BASE_URL}/logo.png" alt="" width="100" height="100" style="display:block;width:100px;height:100px;object-fit:contain;" />
                  </td>
                  <td valign="bottom" style="padding-bottom:24px;">
                    <span style="font-family:${SERIF};font-size:28px;font-weight:700;color:${V2.textPrimary};letter-spacing:-0.02em;display:block;line-height:1;margin-left:-24px;">PMHNP Hiring</span>
                    <span style="font-family:${SANS};font-size:10px;font-weight:500;color:${V2.textLabel};letter-spacing:0.08em;text-transform:uppercase;display:block;line-height:1;margin-left:-24px;margin-top:4px;">Mental Health Careers</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Area -->
          <tr>
            <td style="background-color:${V2.bgCard};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">

                <!-- Heading -->
                <tr>
                  <td class="content-pad" style="padding:48px 40px 0;text-align:center;">
                    <h1 style="margin:0;font-family:${SERIF};font-size:36px;font-weight:normal;color:${V2.textHeading};line-height:1.2;letter-spacing:-0.5px;">
                      ${title}
                    </h1>
                    ${subtitle ? `<p style="margin:16px 0 0;font-family:${SANS};font-size:15px;color:${V2.amber};font-weight:600;">${subtitle}</p>` : ''}
                  </td>
                </tr>

                <!-- Spacer -->
                <tr><td style="padding:0;height:40px;line-height:40px;font-size:1px;">&nbsp;</td></tr>`;
}

// ── Spacer: explicit <tr> row for email-client-safe spacing ─────────────────

export function spacerV2(height: number = 32): string {
  return `<tr><td style="padding:0;height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</td></tr>`;
}

// ── Close the content table opened by headerBlockV2 ─────────────────────────

export function closeContentV2(): string {
  return `
              </table>
            </td>
          </tr>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUTTONS V2
// ═══════════════════════════════════════════════════════════════════════════════
// Matches: 14px/40px padding, 8px radius, 16px font, Inter semi-bold

export function primaryButtonV2(text: string, url: string): string {
  return `<a href="${url}" class="btn-full" style="display:inline-block;background-color:${V2.tealButton};color:#FFFFFF;text-decoration:none;padding:14px 40px;border-radius:8px;font-family:${SANS};font-weight:600;font-size:16px;text-align:center;">${text}</a>`;
}

export function secondaryButtonV2(text: string, url: string): string {
  return `<a href="${url}" class="btn-full" style="display:inline-block;background:transparent;color:${V2.teal};text-decoration:none;padding:12px 32px;border-radius:8px;font-family:${SANS};font-weight:600;font-size:15px;border:2px solid ${V2.borderMed};text-align:center;">${text}</a>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARDS & INFO BOXES V2
// ═══════════════════════════════════════════════════════════════════════════════
// Matches: #F3F2EF bg, #EDF2F7 border, 12px radius, 16px/20px padding

export function infoCardV2(content: string, accentColor: string = V2.teal): string {
  return `
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${V2.bgCardAlt};border-radius:12px;border:1px solid ${V2.borderLight};border-left:3px solid ${accentColor};">
                      <tr>
                        <td style="padding:16px 20px;">
                          ${content}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

// Security/note card (no accent border)
export function noteCardV2(content: string): string {
  return `
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${V2.bgCardAlt};border-radius:12px;border:1px solid ${V2.borderLight};">
                      <tr>
                        <td style="padding:16px 20px;">
                          ${content}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

// Warning card (amber bg)
export function warningCardV2(content: string): string {
  return `
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${V2.bgAmberWarn};border-radius:12px;border:1px solid ${V2.borderAmber};">
                      <tr>
                        <td style="padding:16px 20px;">
                          ${content}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY HELPERS V2
// ═══════════════════════════════════════════════════════════════════════════════

export function sectionLabelV2(text: string, color: string = V2.textMuted): string {
  return `<p style="margin:0 0 6px;font-family:${SANS};font-size:12px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1px;">${text}</p>`;
}

export function bodyTextV2(text: string): string {
  return `<p style="margin:0;font-family:${SERIF};font-size:19px;color:${V2.textBody};line-height:1.6;">${text}</p>`;
}

export function mutedTextV2(text: string): string {
  return `<p style="margin:0;font-family:${SANS};font-size:13px;color:${V2.textMuted};line-height:1.6;">${text}</p>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BADGES V2
// ═══════════════════════════════════════════════════════════════════════════════

export function salaryBadgeV2(text: string): string {
  return `<span style="display:inline-block;background-color:${V2.bgGreenSuccess};color:${V2.emerald};padding:3px 10px;border-radius:6px;font-family:${SANS};font-size:11px;font-weight:600;border:1px solid ${V2.borderGreen};line-height:1.4;">${text}</span>`;
}

export function badgeV2(text: string, bgColor: string, textColor: string, borderColor: string): string {
  return `<span style="display:inline-block;background-color:${bgColor};color:${textColor};padding:3px 10px;border-radius:6px;font-family:${SANS};font-size:11px;font-weight:600;border:1px solid ${borderColor};line-height:1.4;">${text}</span>`;
}

export function featuredBadgeV2(): string {
  return `<span style="display:inline-block;background-color:${V2.bgPeachLight};color:${V2.amberDark};padding:2px 8px;border-radius:4px;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.5px;">&#11088; FEATURED</span>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE ROWS V2
// ═══════════════════════════════════════════════════════════════════════════════
// Icon + title + description in a table row

export function featureRowV2(icon: string, title: string, desc: string): string {
  return `<tr>
    <td style="padding:10px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td width="44" valign="top" style="padding-right:12px;">
            <div style="width:40px;height:40px;background-color:${V2.bgPeachLight};border-radius:10px;text-align:center;line-height:40px;font-size:18px;border:1px solid ${V2.borderPeach};">${icon}</div>
          </td>
          <td valign="top">
            <p style="margin:0;font-family:${SANS};font-size:15px;font-weight:600;color:${V2.textHeading};">${title}</p>
            <p style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${V2.textMuted};line-height:1.5;">${desc}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAT CARDS V2
// ═══════════════════════════════════════════════════════════════════════════════

export function statCardV2(value: string, label: string): string {
  return `<td class="stat-cell" width="50%" style="padding:20px;background-color:${V2.bgElevated};text-align:center;border:1px solid ${V2.borderLight};border-radius:12px;">
    <div style="font-family:${SERIF};font-size:28px;font-weight:700;color:${V2.teal};">${value}</div>
    <div style="font-family:${SANS};font-size:11px;font-weight:600;color:${V2.textMuted};text-transform:uppercase;letter-spacing:1px;margin-top:4px;">${label}</div>
  </td>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIVIDER V2
// ═══════════════════════════════════════════════════════════════════════════════

export function dividerV2(): string {
  return `
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <div style="border-top:1px solid ${V2.borderLight};margin:0;"></div>
                  </td>
                </tr>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTER HELPERS V2
// ═══════════════════════════════════════════════════════════════════════════════

export function unsubscribeFooterV2(unsubscribeToken: string): string {
  return `<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;color:${V2.textMuted};">
                <a href="${BASE_URL}/dashboard/settings" style="color:${V2.textMuted};text-decoration:underline;">Manage preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color:${V2.textMuted};text-decoration:underline;">Unsubscribe</a>
              </p>`;
}

export function contactFooterV2(): string {
  return `<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;color:${V2.textMuted};">
        Questions? Reply to this email or contact <a href="mailto:support@pmhnphiring.com" style="color:${V2.textMuted};text-decoration:underline;">support@pmhnphiring.com</a>
      </p>`;
}
