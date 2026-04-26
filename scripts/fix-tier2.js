const fs = require('fs');

const tabletCSS = `@media (min-width: 769px) and (max-width: 1024px) {
          .cat-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .cat-bento-hero-1, .cat-bento-hero-3 { grid-column: span 6 !important; }
          .cat-bento-hero-2, .cat-bento-cta { grid-column: span 6 !important; }
          .cat-bento-grid > div:not(.cat-bento-hero-1):not(.cat-bento-hero-2):not(.cat-bento-hero-3):not(.cat-bento-cta) { grid-column: span 3 !important; }
        }`;

// Icon replacements per category
const iconReplacements = {
  'outpatient': [
    { emoji: null, idx: 0, icon: 'icon_outpatient_clinic' },
    { emoji: null, idx: 1, icon: 'icon_outpatient_clock' },
    { emoji: null, idx: 2, icon: 'icon_outpatient_therapy' },
    { emoji: null, idx: 3, icon: 'icon_outpatient_growth' },
  ],
  'per-diem': [
    { emoji: null, idx: 0, icon: 'icon_perdiem_shift' },
    { emoji: null, idx: 1, icon: 'icon_perdiem_wallet' },
    { emoji: null, idx: 2, icon: 'icon_perdiem_nosign' },
    { emoji: null, idx: 3, icon: 'icon_perdiem_variety' },
  ],
  'telehealth': [
    { emoji: null, idx: 0, icon: 'icon_telehealth_laptop' },
    { emoji: null, idx: 1, icon: 'icon_telehealth_home' },
    { emoji: null, idx: 2, icon: 'icon_telehealth_reach' },
    { emoji: null, idx: 3, icon: 'icon_telehealth_flex' },
  ],
  'va': [
    { emoji: null, idx: 0, icon: 'icon_va_flag' },
    { emoji: null, idx: 1, icon: 'icon_va_pension' },
    { emoji: null, idx: 2, icon: 'icon_va_education' },
    { emoji: null, idx: 3, icon: 'icon_va_veteran' },
  ],
};

const ctaMap = {
  'outpatient': 'outpatient',
  'per-diem': 'per+diem',
  'telehealth': 'telehealth',
  'va': 'VA',
};

const categories = ['outpatient', 'per-diem', 'telehealth', 'va'];

for (const cat of categories) {
  const file = `app/jobs/${cat}/page.tsx`;
  let c = fs.readFileSync(file, 'utf-8');
  const q = ctaMap[cat];

  // 1. Replace emoji spans with clay icon Images
  // Find all emoji spans: <span style={{ fontSize: '36px', ...}}>EMOJI</span>
  const emojiPattern = /<span style=\{\{ fontSize: '36px',([^}]*)\}\}>[^<]+<\/span>/g;
  let emojiIdx = 0;
  const icons = iconReplacements[cat];
  c = c.replace(emojiPattern, (match) => {
    if (emojiIdx < icons.length) {
      const icon = icons[emojiIdx].icon;
      emojiIdx++;
      return `<Image src="/images/categories/${icon}.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />`;
    }
    return match;
  });
  if (emojiIdx > 0) console.log(`  ${cat}: replaced ${emojiIdx} emojis with clay icons`);

  // 2. Fix hero CTA to /jobs?q=
  const heroSelfLinks = [
    new RegExp(`href="/jobs/${cat}" className="clay-btn cat-cta-primary"`, 'g'),
    new RegExp(`href="/jobs/${cat}" className="cat-cta-primary"`, 'g'),
  ];
  for (const re of heroSelfLinks) {
    if (re.test(c)) {
      c = c.replace(re, `href="/jobs?q=${q}" className="cat-cta-primary"`);
      console.log(`  ${cat}: fixed hero CTA`);
    }
  }

  // 3. Add Browse All CTA below job listings if missing
  if (!c.includes("padding: '14px 32px'")) {
    // Find closing of job cards grid and add CTA after
    const jobGridClose = '</div>\n              </>\n            )}\n';
    if (c.includes(jobGridClose)) {
      c = c.replace(jobGridClose, jobGridClose + `            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?q=${q}" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>
                Browse All ${cat.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} Jobs <ArrowRight size={16} />
              </Link>
            </div>\n`);
      console.log(`  ${cat}: added Browse All CTA`);
    } else {
      // Try alternate pattern
      const alt = `)}\n          </div>\n          {/* Sidebar */}`;
      if (c.includes(alt)) {
        c = c.replace(alt, `)}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?q=${q}" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>
                Browse All ${cat.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          {/* Sidebar */}`);
        console.log(`  ${cat}: added Browse All CTA (alt pattern)`);
      }
    }
  }

  // 4. Add tablet CSS if missing
  if (!c.includes('min-width: 769px')) {
    c = c.replace('`}</style>', tabletCSS + '\n      `}</style>');
    console.log(`  ${cat}: added tablet CSS`);
  }

  // 5. Add clayCard if missing (va)
  if (!c.includes('const clayCard')) {
    c = c.replace(
      'export const revalidate',
      `const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate`
    );
    console.log(`  ${cat}: added clayCard token`);
  }

  fs.writeFileSync(file, c);
  console.log(`  ${cat}: ✅ saved`);
}

console.log('\nTier 2 complete!');
