// Render "Your Alerts Are Live" email — exact match to production email-templates-v2.ts
const BASE_URL = 'https://pmhnphiring.com';
const IMG = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/email-assets';
const SERIF = "'Lora', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";
const V2 = {
  bgBody:'#F3F2EF', bgCard:'#FFF8EE', bgPeach:'#F0C4A4',
  textHeading:'#2D3748', textPrimary:'#1F2937', textBody:'#4A5568',
  textLabel:'#5A4A3A', textMuted:'#718096',
  tealButton:'#4DB6AC', teal:'#0d9488',
};

// ── headerBlockV2 (production-identical — stacked: logo top, text below) ──
function headerBlockV2(title, subtitle) {
  return `<tr><td class="header-bg" align="center" bgcolor="${V2.bgPeach}" style="background-color:${V2.bgPeach};padding:24px 0 16px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
      <tr>
        <td valign="middle" style="padding-right:12px;"><img src="${IMG}/logo-email.png" alt="PMHNP Hiring" width="56" height="64" style="display:block;width:56px;height:64px;" /></td>
        <td valign="middle">
          <p class="brand-text" style="margin:0;font-family:${SERIF};font-size:26px;font-weight:700;color:${V2.textPrimary};letter-spacing:-0.02em;line-height:1;text-align:left;">PMHNP Hiring</p>
          <p class="tagline-text" style="margin:3px 0 0;font-family:${SANS};font-size:9px;font-weight:500;color:${V2.teal};letter-spacing:0.08em;text-transform:uppercase;line-height:1;text-align:center;">Mental Health Careers</p>
        </td>
      </tr>
    </table>
  </td></tr><tr><td class="content-bg" bgcolor="${V2.bgCard}" style="background-color:${V2.bgCard};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-spacing:0;">
                <tr>
                  <td class="content-pad" style="padding:24px 40px 0;text-align:center;">
                    <h1 style="margin:0;font-family:${SERIF};font-size:36px;font-weight:normal;color:${V2.textHeading};line-height:1.2;letter-spacing:-0.5px;">
                      ${title}
                    </h1>
                    ${subtitle ? `<p style="margin:16px 0 0;font-family:${SERIF};font-size:19px;color:${V2.textBody};line-height:1.6;">${subtitle}</p>` : ''}
                  </td>
                </tr>
                <tr><td style="padding:0;height:20px;line-height:20px;font-size:1px;">&nbsp;</td></tr>`;
}

// ── emailShellV2 (production-identical) ──
function emailShellV2(content, footerContent, preheader) {
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
    }
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      body, .body-bg { background-color: ${V2.bgPeach} !important; }
      .header-bg { background-color: ${V2.bgPeach} !important; }
      .content-bg { background-color: ${V2.bgCard} !important; }
      .footer-bg { background-color: #292524 !important; }
      h1, .heading-text { color: ${V2.textHeading} !important; }
      p, .body-text { color: ${V2.textBody} !important; }
      .brand-text { color: ${V2.textPrimary} !important; }
      .tagline-text { color: ${V2.teal} !important; }
      .footer-text, .footer-text a { color: #A0AEC0 !important; }
      .btn-primary { background-color: ${V2.tealButton} !important; color: #FFFFFF !important; }
    }
    /* Outlook dark mode — explicit overrides */
    [data-ogsc] .brand-text { color: #1F2937 !important; }
    [data-ogsc] .tagline-text { color: #0d9488 !important; }
    [data-ogsc] h1 { color: #2D3748 !important; }
    [data-ogsc] .body-text, [data-ogsc] p { color: #4A5568 !important; }
    [data-ogsc] .footer-text, [data-ogsc] .footer-text a { color: #A0AEC0 !important; }
    [data-ogsb] .header-bg { background-color: #F0C4A4 !important; }
    [data-ogsb] .content-bg { background-color: #FFF8EE !important; }
    [data-ogsb] .footer-bg { background-color: #292524 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${V2.bgBody};" bgcolor="${V2.bgBody}">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${V2.bgBody};">${preheader} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${V2.bgBody}" style="background-color:${V2.bgBody};border-collapse:collapse;border-spacing:0;">
    <tr>
      <td align="center" style="padding:0;">
        <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td><![endif]-->
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" align="center" style="max-width:600px;width:100%;border-collapse:collapse;border-spacing:0;">
          ${content}
          <tr>
            <td class="footer-bg" bgcolor="#292524" style="background-color:#292524;padding:24px 24px 48px;text-align:center;">
              ${footerContent}
              <p class="footer-text" style="margin:8px 0 0;font-family:${SANS};font-size:13px;color:#A0AEC0;">
                &copy; 2026 PMHNP Hiring &nbsp;&middot;&nbsp;
                <a href="${BASE_URL}" style="color:#A0AEC0;text-decoration:underline;">pmhnphiring.com</a> &nbsp;&middot;&nbsp;
                <a href="mailto:support@pmhnphiring.com" style="color:#A0AEC0;text-decoration:underline;">support@pmhnphiring.com</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;}

// ── Helpers ──
function spacerV2(h) { return `<tr><td style="padding:0;height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</td></tr>`; }
function closeContentV2() { return `</table></td></tr>`; }
function unsubFooter() { return `<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;color:#A0AEC0;"><a href="${BASE_URL}/job-alerts/manage" style="color:#A0AEC0;text-decoration:underline;">Manage preferences</a></p>`; }
function primaryButtonV2(text, url) { return `<a href="${url}" class="btn-full" style="display:inline-block;background-color:${V2.tealButton};color:#FFFFFF;text-decoration:none;padding:14px 40px;border-radius:8px;font-family:${SANS};font-weight:600;font-size:16px;text-align:center;">${text}</a>`; }

// ── Render "Candidate Welcome" email ──
function bodyTextV2(text) { return `<tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF};font-size:17px;color:${V2.textBody};line-height:1.7;">${text}</p></td></tr>`; }
function stepBlock(iconFile, title, desc) { return `<tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="80" height="80" valign="middle" style="padding-right:16px;width:80px;min-width:80px;height:80px;overflow:hidden;"><img src="${IMG}/${iconFile}" alt="${title}" width="80" height="80" style="width:80px;min-width:80px;height:80px;min-height:80px;max-height:80px;border-radius:12px;display:block;" /></td><td valign="middle"><p style="margin:0 0 4px;font-family:${SANS};font-size:15px;font-weight:700;color:${V2.textHeading};">${title}</p><p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textMuted};line-height:1.5;">${desc}</p></td></tr></table></td></tr>`; }

const html = emailShellV2(`
    ${headerBlockV2('Welcome to PMHNP Hiring', '')}
    <tr><td style="padding:0 40px;"><img src="${IMG}/welcome-email-hero.png" alt="" width="520" style="width:100%;max-width:520px;height:auto;display:block;border-radius:12px;margin:0 auto;" /></td></tr>
    ${spacerV2(28)}
    <tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF};font-size:17px;color:${V2.textBody};line-height:1.7;">You have unlocked a new way to find your perfect role. Search curated positions, get matched by AI, and connect directly with hiring managers \u2014 no recruiters, no middlemen.</p></td></tr>
    ${spacerV2(36)}
    <tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF};font-size:26px;font-weight:700;color:${V2.textHeading};text-align:center;">Here is how to get started</p></td></tr>
    ${spacerV2(20)}
    ${stepBlock('step-build-profile.png', 'Build your profile', 'Take 60 seconds to add your credentials, specialties, and location preferences.')}
    ${spacerV2(16)}
    ${stepBlock('step-ai-alerts.png', 'Turn on AI alerts', 'Get notified the exact minute a perfectly matched role lands on the board.')}
    ${spacerV2(16)}
    ${stepBlock('step-connect.png', 'Connect directly', 'Connect to hiring managers directly, no recruiters involved.')}
    ${spacerV2(32)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">${primaryButtonV2('Explore Your Dashboard', `${BASE_URL}/dashboard`)}</td></tr>
    ${spacerV2(16)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textMuted};line-height:1.6;">Want the data first? <a href="${BASE_URL}/salary-guide" style="color:${V2.tealButton};text-decoration:underline;">Download the 2026 Salary Guide</a>.</p></td></tr>
    ${spacerV2(48)}
    ${closeContentV2()}`, unsubFooter(), 'Welcome \u2014 find your perfect PMHNP role.');

require('fs').writeFileSync('test-candidate-welcome.html', html);
console.log(`Written to test-candidate-welcome.html (${html.length} bytes)`);
