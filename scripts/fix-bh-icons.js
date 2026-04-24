const fs = require('fs');
let c = fs.readFileSync('app/jobs/behavioral-health/page.tsx', 'utf-8');

// 1. Fix double $$ in salary line
c = c.replace(
  /\$\{stats\.avgSalary > 0 \? '\$' \+ stats\.avgSalary \+ 'k'/,
  "${stats.avgSalary > 0 ? `$${stats.avgSalary}k`"
);

// 2. Fix ROW 1 right card - replace emoji with image
c = c.replace(
  `<div className="cat-bento-hero-2 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px 22px', textAlign: 'center' }}>
              <span style={{ fontSize: '42px', display: 'block', marginBottom: '14px' }}>\u{1F4CA}</span>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Population Health</h3>
              <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                Address behavioral health needs across diverse communities and age groups in primary care settings.
              </p>
            </div>`,
  `<div className="cat-bento-hero-2 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/images/categories/bento_bh_community.png" alt="Community behavioral health" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Population Health</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                  Address behavioral health needs across diverse communities and age groups.
                </p>
              </div>
            </div>`
);

// 3. Replace random emojis in ROW 2 with Lucide icons
// Team-Based: Users icon
c = c.replace(
  `<span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>\u{1F9E9}</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Team-Based</h3>`,
  `<Heart size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Team-Based</h3>`
);

// Diverse Settings: Building2 icon
c = c.replace(
  `<span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>\u{1F3E2}</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Diverse Settings</h3>`,
  `<Building2 size={32} style={{ color: '#8B5CF6', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Diverse Settings</h3>`
);

// High Demand: TrendingUp icon
c = c.replace(
  `<span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>\u{1F4C8}</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>High Demand</h3>`,
  `<TrendingUp size={32} style={{ color: '#F97316', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>High Demand</h3>`
);

// Preventive Focus: Brain icon  
c = c.replace(
  `<span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>\u{1F331}</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Preventive Focus</h3>`,
  `<Brain size={32} style={{ color: '#34D399', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Preventive Focus</h3>`
);

// 4. Move community image from ROW 3 to use integrated for Career Growth
c = c.replace(
  'bento_bh_community.png" alt="Community mental health center"',
  'bento_bh_integrated.png" alt="Behavioral health career growth"'
);

fs.writeFileSync('app/jobs/behavioral-health/page.tsx', c);
console.log('Fixed: $$, emojis->icons, image context');
