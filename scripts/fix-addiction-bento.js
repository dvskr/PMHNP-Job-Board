const fs = require('fs');
let c = fs.readFileSync('app/jobs/addiction/page.tsx', 'utf-8');

// Find the flat bento grid and replace with 12-column hero layout
const oldBento = c.match(/(<div className="cat-bento-grid"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>[\s\S]*?{\/\* ═══ BEFORE YOU APPLY)/);

if (!oldBento) {
  // Try alternate approach - find from grid to BEFORE YOU APPLY
  const gridStart = c.indexOf('<div className="cat-bento-grid"');
  const beforeApply = c.indexOf('{/* ═══ BEFORE YOU APPLY');
  
  if (gridStart === -1 || beforeApply === -1) {
    console.log('Markers not found');
    process.exit(1);
  }
  
  const before = c.substring(0, gridStart);
  const after = c.substring(beforeApply);
  
  const newBento = `<div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1: Recovery Centers (8) + MAT Expertise (4) */}
            <div className="cat-bento-hero-1 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Recovery Centers</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Work in dedicated treatment facilities helping patients through detox, stabilization, and long-term recovery programs.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                <Image src="/images/categories/bento_addiction_recovery.png" alt="Addiction recovery center" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="cat-bento-hero-2 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/images/categories/bento_addiction_mat.png" alt="Medication-assisted treatment" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>MAT Expertise</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                  Prescribe buprenorphine, naltrexone, and manage complex detox protocols.
                </p>
              </div>
            </div>

            {/* ROW 2: 4 compact cards (3 cols each) */}
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>💊</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Dual Diagnosis</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Treat co-occurring mental health and substance use disorders simultaneously.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>🏥</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Growing Demand</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Opioid crisis driving 40%+ growth in addiction psychiatry positions nationwide.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>❤️</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Life-Changing Impact</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Help patients achieve lasting recovery and rebuild their lives.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>🛡️</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Harm Reduction</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Implement evidence-based harm reduction and relapse prevention strategies.</p>
            </div>

            {/* ROW 3: Salary (8) + Alert CTA (4) */}
            <div className="cat-bento-hero-3 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Salary + Benefits</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Addiction PMHNPs earn $\{stats.avgSalary > 0 ? \`$\${stats.avgSalary}k\` : '$130K\\u2013$180K'} annually with loan repayment programs and sign-on bonuses at many facilities.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                <Image src="/images/categories/bento_addiction_impact.png" alt="Addiction PMHNP career impact" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="cat-bento-cta cat-bento-card" style={{
              ...clayCard, gridColumn: 'span 4', padding: '28px 22px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)',
            }}>
              <Bell size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>Job Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                New addiction listings delivered to your inbox — be first to apply.
              </p>
              <Link href="/job-alerts" className="cat-cta-primary" style={{
                padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                background: '#0D9488', color: '#fff', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
              }}>
                Create Alert <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </div>

      `;
  
  c = before + newBento + after;
}

// Add bento hero responsive rules
c = c.replace(
  ".cat-bento-grid { grid-template-columns: repeat(2, 1fr) !important; }",
  ".cat-bento-grid { grid-template-columns: 1fr !important; }"
);
c = c.replace(
  ".cat-bento-grid > div { grid-column: span 1 !important; }",
  `.cat-bento-hero-1, .cat-bento-hero-2, .cat-bento-hero-3, .cat-bento-cta { grid-column: span 1 !important; }
          .cat-bento-hero-1, .cat-bento-hero-3 { grid-template-columns: 1fr !important; }
          .cat-bento-grid > div { grid-column: span 1 !important; }`
);

fs.writeFileSync('app/jobs/addiction/page.tsx', c);
console.log('Addiction bento upgraded to 12-column');
