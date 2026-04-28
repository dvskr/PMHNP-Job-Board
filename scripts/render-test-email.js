// Render "Your Alerts Are Live" email — exact match to production email-templates-v2.ts
const BASE_URL = 'https://pmhnphiring.com';
const IMG = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/email-assets';
const SERIF = "'Lora', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";
const V2 = {
  bgBody:'#F3F2EF', bgCard:'#FFF8EE', bgPeach:'#F0C4A4',
  textHeading:'#2D3748', textPrimary:'#1F2937', textBody:'#4A5568',
  textLabel:'#5A4A3A', textMuted:'#718096',
  tealButton:'#4DB6AC',
};

// ── headerBlockV2 (production-identical — stacked: logo top, text below) ──
function headerBlockV2(title, subtitle) {
  const logoUrl = `${IMG}/logo.png`;
  return `<tr><td class="header-bg" align="center" bgcolor="${V2.bgPeach}" style="background-color:${V2.bgPeach};padding:0;text-align:center;"><img src="${logoUrl}" alt="PMHNP Hiring" width="100" height="100" style="display:block;width:100px;height:100px;margin:0 auto;" /><p class="brand-text" style="margin:-8px 0 0;font-family:${SERIF};font-size:28px;font-weight:700;color:${V2.textPrimary};letter-spacing:-0.02em;line-height:1;text-align:center;">PMHNP Hiring</p><p class="tagline-text" style="margin:2px 0 0;font-family:${SANS};font-size:10px;font-weight:500;color:${V2.textLabel};letter-spacing:0.08em;text-transform:uppercase;line-height:1;text-align:center;">Mental Health Careers</p></td></tr><tr><td class="content-bg" bgcolor="${V2.bgCard}" style="background-color:${V2.bgCard};"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-spacing:0;">
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
      .tagline-text { color: ${V2.textLabel} !important; }
      .footer-text, .footer-text a { color: #A0AEC0 !important; }
      .btn-primary { background-color: ${V2.tealButton} !important; color: #FFFFFF !important; }
    }
    [data-ogsc] h1, [data-ogsc] p, [data-ogsc] span, [data-ogsc] td { color: inherit !important; }
    [data-ogsb] { background-color: inherit !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${V2.bgPeach};" bgcolor="${V2.bgPeach}">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${V2.bgPeach};">${preheader} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${V2.bgPeach}" style="background-color:${V2.bgPeach};border-collapse:collapse;border-spacing:0;">
    <tr>
      <td align="center" bgcolor="${V2.bgPeach}" style="background-color:${V2.bgPeach};">
        <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center" bgcolor="${V2.bgPeach}"><tr><td><![endif]-->
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="${V2.bgPeach}" align="center" style="max-width:600px;width:100%;border-collapse:collapse;border-spacing:0;">
          ${content}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#292524" style="background-color:#292524;">
        <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td style="padding:24px 24px 48px;text-align:center;"><![endif]-->
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" align="center" style="max-width:600px;width:100%;border-collapse:collapse;border-spacing:0;">
          <tr>
            <td style="padding:24px 24px 48px;text-align:center;">
              ${footerContent}
              <p style="margin:8px 0 0;font-family:${SANS};font-size:13px;color:#A0AEC0;">
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
</html>`;
}

// ── Helpers ──
function spacerV2(h) { return `<tr><td style="padding:0;height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</td></tr>`; }
function closeContentV2() { return `</table></td></tr>`; }
function unsubFooter() { return `<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;color:#A0AEC0;"><a href="${BASE_URL}/job-alerts/manage" style="color:#A0AEC0;text-decoration:underline;">Manage preferences</a></p>`; }
function primaryButtonV2(text, url) { return `<a href="${url}" class="btn-full" style="display:inline-block;background-color:${V2.tealButton};color:#FFFFFF;text-decoration:none;padding:14px 40px;border-radius:8px;font-family:${SANS};font-weight:600;font-size:16px;text-align:center;">${text}</a>`; }

// ── Render "Welcome" email ──
const html = emailShellV2(`
    ${headerBlockV2('Your Alerts Are Live', '')}
    ${spacerV2(12)}
    <tr><td class="content-pad" style="padding:0 40px;">
      <p style="margin:0;font-family:${SERIF};font-size:17px;color:${V2.textBody};line-height:1.7;">Your job alerts are now active. We scan thousands of PMHNP positions daily and deliver matches straight to your inbox \u2014 so you never miss the right opportunity.</p>
    </td></tr>
    ${spacerV2(32)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">${primaryButtonV2('Browse Open Positions', `${BASE_URL}/jobs`)}</td></tr>
    ${spacerV2(48)}
    ${closeContentV2()}`, unsubFooter(), 'Your PMHNP job alerts are active.');

require('fs').writeFileSync('test-alert-email.html', html);
console.log('Written to test-alert-email.html (' + html.length + ' bytes)');
