const fs = require('fs');

// These pages use \r\n endings and different indent styles
// Strategy: find ViewTracker or last script, inject V2 sections, replace everything after

const configs = [
  {
    cat: 'child-adolescent', q: 'child+adolescent', label: 'Child & Adolescent',
    heroTitle: 'Child & Adolescent', heroSub: 'PMHNP Jobs',
    heroDesc: 'Specialized roles treating children, teens, and families with developmental and psychiatric conditions.',
    heroBg: '#b8d4e3',
    icons: ['icon_child_teddy', 'icon_child_school', 'icon_child_family', 'icon_child_play'],
    iconLabels: ['Youth-Focused', 'School Settings', 'Family Therapy', 'Play Therapy'],
    iconDescs: ['Treat ADHD, anxiety, autism, and behavioral disorders in young patients.', 'Work in school-based clinics providing early intervention.', 'Engage families and caregivers in holistic treatment.', 'Use developmental and play-based therapeutic approaches.'],
    bentoTitle: 'Built for Pediatric Psych',
    faqVar: 'childFaqs', faqTitle: 'Child & Adolescent Questions',
    beforeApply: [
      { t: 'Pediatric Training', d: 'Ensure your program included child/adolescent psychiatric rotations.' },
      { t: 'DEA Registration', d: 'Obtain DEA registration and state prescriptive authority.' },
      { t: 'Family Dynamics', d: 'Prepare for family-centered care and school collaboration.' },
      { t: 'Specialty Cert', d: 'Consider child/adolescent specialty certification.' },
    ],
  },
  {
    cat: 'new-grad', q: 'new+grad', label: 'New Grad',
    heroTitle: 'New Grad', heroSub: 'PMHNP Jobs',
    heroDesc: 'Entry-level positions with mentorship, structured onboarding, and clinical supervision.',
    heroBg: '#c8d6e5',
    icons: ['icon_newgrad_diploma', 'icon_newgrad_bulb', 'icon_newgrad_stairs', 'icon_newgrad_cert'],
    iconLabels: ['New Grad Welcome', 'Mentorship', 'Career Growth', 'Get Certified'],
    iconDescs: ['Employers actively seeking newly certified PMHNPs.', 'Structured mentorship with experienced providers.', 'Clear advancement paths from entry to senior roles.', 'Support for specialty certifications and CE credits.'],
    bentoTitle: 'Built for New Graduates',
    faqVar: 'newGradFaqs', faqTitle: 'New Grad PMHNP Questions',
    beforeApply: [
      { t: 'ANCC Certification', d: 'Complete your PMHNP-BC certification before applying.' },
      { t: 'State Licensure', d: 'Obtain APRN licensure and prescriptive authority.' },
      { t: 'Clinical Hours', d: 'Document your rotation hours and specialty experience.' },
      { t: 'References', d: 'Secure references from clinical preceptors and advisors.' },
    ],
  },
  {
    cat: 'substance-abuse', q: 'substance+abuse', label: 'Substance Abuse',
    heroTitle: 'Substance Abuse', heroSub: 'PMHNP Jobs',
    heroDesc: 'Addiction treatment roles including MAT programs, detox centers, and dual-diagnosis facilities.',
    heroBg: '#a8c5b8',
    icons: ['icon_sa_recovery', 'icon_sa_medicine', 'icon_sa_group', 'icon_sa_impact'],
    iconLabels: ['Recovery Focus', 'MAT Programs', 'Group Therapy', 'Life Impact'],
    iconDescs: ['Help patients achieve lasting recovery from SUD.', 'Prescribe and manage medication-assisted treatment.', 'Lead group therapy and peer support programs.', 'Transform lives through evidence-based addiction care.'],
    bentoTitle: 'Built for Addiction Care',
    faqVar: 'substanceFaqs', faqTitle: 'Substance Abuse PMHNP Questions',
    beforeApply: [
      { t: 'DEA Requirements', d: 'Understand buprenorphine prescribing and current DEA regulations.' },
      { t: 'SUD Experience', d: 'Highlight substance use disorder rotation or volunteer experience.' },
      { t: 'Crisis Skills', d: 'Demonstrate competency in overdose response and de-escalation.' },
      { t: 'Dual Diagnosis', d: 'Prepare for co-occurring mental health and SUD treatment.' },
    ],
  },
  {
    cat: 'travel', q: 'travel+PMHNP', label: 'Travel',
    heroTitle: 'Travel', heroSub: 'PMHNP Jobs',
    heroDesc: 'Travel assignments with premium pay, furnished housing, and the freedom to explore new locations.',
    heroBg: '#91c9e7',
    icons: ['icon_travel_case', 'icon_travel_plane', 'icon_travel_housing', 'icon_travel_dollar'],
    iconLabels: ['Travel Ready', 'Nationwide', 'Housing Included', 'Premium Pay'],
    iconDescs: ['Pack your bags for assignments across the country.', 'Work in all 50 states with agency-supported licensure.', 'Furnished housing or generous stipends provided.', 'Earn 20-50% more than permanent positions.'],
    bentoTitle: 'Built for Adventure',
    faqVar: 'travelFaqs', faqTitle: 'Travel PMHNP Questions',
    beforeApply: [
      { t: 'Multi-State License', d: 'Obtain licenses in target states or join the NLC compact.' },
      { t: 'Travel Docs', d: 'Keep CV, certs, and references ready for quick credentialing.' },
      { t: 'Tax Home', d: 'Establish a tax home for maximum tax-free stipend benefits.' },
      { t: 'Agency Research', d: 'Compare staffing agencies for pay packages and support.' },
    ],
  },
];

function buildV2Sections(cfg) {
  const ba = cfg.beforeApply.map((item, i) =>
    `            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>0${i+1}</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>${item.t}</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>${item.d}</p>
            </div>`
  ).join('\n');

  const iconCards = cfg.icons.map((icon, i) =>
    `            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/${icon}.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>${cfg.iconLabels[i]}</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>${cfg.iconDescs[i]}</p>
            </div>`
  ).join('\n');

  return `
      {/* ═══ HERO ═══ */}
      <section style={{ background: '${cfg.heroBg}', padding: '72px 0 56px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px' }}>
          <div className="cat-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#134E4A', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>{stats.totalJobs}+ Open Positions</p>
              <h1 className="font-lora" style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, lineHeight: 1.08, color: '#1A2E35', margin: '0 0 20px' }}>${cfg.heroTitle}<br /><span style={{ color: '#0D9488' }}>${cfg.heroSub}</span></h1>
              <p style={{ fontSize: '16px', color: '#3D2E26', lineHeight: 1.7, margin: '0 0 36px', maxWidth: '440px' }}>${cfg.heroDesc}</p>
              <Link href="/jobs?q=${cfg.q}" className="cat-cta-primary" style={{ padding: '16px 40px', borderRadius: '16px', fontWeight: 700, fontSize: '15px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '4px 4px 14px rgba(13,148,136,0.25)' }}>Browse ${cfg.label} Jobs <ArrowRight size={17} /></Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image src="/images/categories/hero_v2_${cfg.cat.replace(/-/g,'')}.png" alt="${cfg.label} PMHNP" width={520} height={520} style={{ width: '100%', maxWidth: '500px', height: 'auto' }} priority />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <h2 className="font-lora mb-6" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>${cfg.label} Positions ({stats.totalJobs})</h2>
            {jobs.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
              </div>
            ) : (
              <div className="text-center py-12"><p>No positions at this time. Check back soon.</p></div>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?q=${cfg.q}" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>Browse All ${cfg.label} Jobs <ArrowRight size={16} /></Link>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div style={{ ...clayCard, padding: '24px', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
              <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>${cfg.label} Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px' }}>New listings delivered daily.</p>
              <Link href="/job-alerts" className="cat-cta-primary" style={{ display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none' }}>Create Alert</Link>
            </div>
            {stats.topEmployers.length > 0 && (
              <div style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <Building2 size={20} style={{ color: '#0D9488', marginBottom: '8px' }} />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: '0 0 12px' }}>Top Employers</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                    <li key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px' }}>{employer.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stats.avgSalary > 0 && (
              <div style={{ ...clayCard, padding: '24px' }}>
                <TrendingUp size={20} style={{ color: '#34D399', marginBottom: '8px' }} />
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35' }}>\${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62' }}>Average salary</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BENTO ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Why Choose ${cfg.label}</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '48px' }}>${cfg.bentoTitle}</h2>
          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
${iconCards}
          </div>
        </section>
      </div>

      {/* ═══ BEFORE YOU APPLY ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Before You Apply</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>What You Need to Know</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
${ba}
          </div>
        </section>
      </div>

      {/* ═══ EXPLORE MORE ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Keep Exploring</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>More Ways to Find Your Next Role</h2>
          <div className="cat-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[
              { href: '/jobs/remote', label: 'Remote', sub: 'Work from home', emoji: '🏠' },
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual care', emoji: '💻' },
              { href: '/jobs/inpatient', label: 'Inpatient', sub: 'Hospital roles', emoji: '🏥' },
              { href: '/jobs/outpatient', label: 'Outpatient', sub: 'Clinic-based', emoji: '🏢' },
              { href: '/salary-guide', label: 'Salary Guide', sub: '2026 comp data', emoji: '💰' },
              { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', emoji: '📍' },
            ].map(c => (
              <Link key={c.href} href={c.href} className="cat-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>{c.emoji}</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ FAQ ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>${cfg.faqTitle}</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {${cfg.faqVar}.map((faq, idx) => (
              <div key={idx} className="cat-bento-card" style={{ ...clayCard, padding: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.question}</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{\`
        .cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .cat-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .cat-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        @media (max-width: 768px) {
          .cat-hero-grid { grid-template-columns: 1fr !important; }
          .cat-bento-grid { grid-template-columns: 1fr !important; }
          .cat-bento-grid > div { grid-column: span 1 !important; }
          .cat-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .cat-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .cat-bento-grid > div { grid-column: span 3 !important; }
        }
      \`}</style>`;
}

for (const cfg of configs) {
  const file = `app/jobs/${cfg.cat}/page.tsx`;
  let c = fs.readFileSync(file, 'utf-8');
  
  const v2 = buildV2Sections(cfg);
  
  // Find the return statement
  const returnIdx = c.indexOf('return (');
  if (returnIdx === -1) { console.log(`${cfg.cat}: no return found`); continue; }
  
  // Find opening <div after return
  const divIdx = c.indexOf('<div', returnIdx);
  const divClose = c.indexOf('>', divIdx);
  
  // Find the matching closing - last occurrence of closing pattern
  // Try various patterns
  const endPatterns = [
    '</div>\r\n    );\r\n}\r\n',
    '</div>\r\n    );\r\n}',
    '</div>\n    );\n}\n',
    '</div>\n    );\n}',
    '    </div>\r\n  );\r\n}\r\n',
    '        </div>\r\n    );\r\n}\r\n',
  ];
  
  let endIdx = -1;
  let endLen = 0;
  for (const pat of endPatterns) {
    const idx = c.lastIndexOf(pat);
    if (idx > returnIdx && idx > endIdx) {
      endIdx = idx;
      endLen = pat.length;
    }
  }
  
  if (endIdx === -1) {
    console.log(`${cfg.cat}: ⚠️ Could not find end pattern`);
    // Try more aggressive approach - find last }
    const lastBrace = c.lastIndexOf('}');
    const lastReturn = c.lastIndexOf(');', lastBrace);
    const lastDiv = c.lastIndexOf('</div>', lastReturn);
    if (lastDiv > returnIdx) {
      endIdx = lastDiv;
      endLen = c.length - lastDiv;
    }
  }

  // Keep everything before return + opening div, replace content, keep closing
  const before = c.slice(0, divClose + 1);
  c = before + v2 + '\n    </div>\n  );\n}\n';
  
  fs.writeFileSync(file, c);
  console.log(`${cfg.cat}: ✅ V2 migration complete (${c.split('\n').length} lines)`);
}

console.log('\nAll Tier 3 pages migrated!');
