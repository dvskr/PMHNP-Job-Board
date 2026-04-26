const fs = require('fs');
let c = fs.readFileSync('app/jobs/behavioral-health/page.tsx', 'utf-8');

// 1. Add clayCard token after revalidate
if (!c.includes('clayCard')) {
  c = c.replace(
    'export const revalidate = 3600;',
    `/* Design Tokens */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate = 3600;`
  );
}

// 2. Add JobListViewTracker import
if (!c.includes('JobListViewTracker')) {
  c = c.replace(
    "import CategoryFAQ from '@/components/CategoryFAQ';",
    "import CategoryFAQ from '@/components/CategoryFAQ';\nimport { JobListViewTracker } from '@/components/analytics/ViewTrackers';"
  );
}

// 3. Fix imports
c = c.replace(
  "Heart, DollarSign, TrendingUp, Building2, Bell, Wifi, Video, Plane, GraduationCap, Calendar, Brain , ArrowRight",
  "Heart, DollarSign, TrendingUp, Building2, Bell, Briefcase, Brain, ArrowRight"
);

// 4. Add job listings between hero and bento
const heroClose = '</section>\r\n\r\n            {/* ═══ BENTO — Why Choose Behavioral Health';
const jobListings = `</section>

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>Behavioral Health Positions ({stats.totalJobs})</h2>
              <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View All Jobs \u2192</Link>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <Brain className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No behavioral health positions at this time</h3>
                <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
              </div>
            )}
          </div>
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="cat-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <div style={{ padding: '24px' }}>
                <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>BH Job Alerts</h3>
                <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>New behavioral health listings delivered daily.</p>
                <Link href="/job-alerts" className="cat-cta-primary" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none', boxShadow: '3px 3px 8px rgba(13,148,136,0.15)' }}>Create Alert</Link>
              </div>
            </div>
            {stats.topEmployers.length > 0 && (
              <div className="cat-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Building2 size={20} style={{ color: '#0D9488' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Top Employers</h3>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px', whiteSpace: 'nowrap' }}>{employer.count} {employer.count === 1 ? 'job' : 'jobs'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stats.avgSalary > 0 && (
              <div className="cat-bento-card" style={{ ...clayCard, padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <TrendingUp size={20} style={{ color: '#34D399' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Salary Insights</h3>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>\${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
              </div>
            )}
          </div>
        </div>
      </div>

            {/* ═══ BENTO — Why Choose Behavioral Health`;

c = c.replace(heroClose, jobListings);

// 5. Replace flat bento with 12-column hero layout
const flatBentoStart = c.indexOf('<div className="cat-bento-grid"');
const flatBentoEnd = c.indexOf('{/* ═══ BEFORE YOU APPLY');

if (flatBentoStart > 0 && flatBentoEnd > 0) {
  const beforeBento = c.substring(0, flatBentoStart);
  const afterBento = c.substring(flatBentoEnd);

  const newBento = `<div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1: Integrated Care (8) + Population Health (4) */}
            <div className="cat-bento-hero-1 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Integrated Care</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Work alongside PCPs, therapists, and social workers in collaborative care models across diverse healthcare settings.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                <Image src="/images/categories/bento_bh_integrated.png" alt="Integrated behavioral health clinic" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="cat-bento-hero-2 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px 22px', textAlign: 'center' }}>
              <span style={{ fontSize: '42px', display: 'block', marginBottom: '14px' }}>📊</span>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Population Health</h3>
              <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                Address behavioral health needs across diverse communities and age groups in primary care settings.
              </p>
            </div>

            {/* ROW 2: 4 compact cards */}
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>🧩</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Team-Based</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Collaborate in interdisciplinary teams with therapists and case managers.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>🏢</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Diverse Settings</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>CMHCs, FQHCs, schools, corporate wellness, and primary care clinics.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>📈</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>High Demand</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>BH integration driving massive growth in PMHNP positions nationwide.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>🌱</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Preventive Focus</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Early intervention and prevention programs to improve community wellness.</p>
            </div>

            {/* ROW 3: Salary (8) + CTA (4) */}
            <div className="cat-bento-hero-3 cat-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Career Growth</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  BH PMHNPs earn \${stats.avgSalary > 0 ? '$' + stats.avgSalary + 'k' : '$130K\u2013$170K'} annually with strong benefits and loan repayment in underserved areas.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                <Image src="/images/categories/bento_bh_community.png" alt="Community mental health center" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
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
                New BH listings delivered to your inbox daily.
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

  c = beforeBento + newBento + afterBento;
}

// 6. Add FAQ before responsive CSS
const cssMarker = '{/* ═══ Responsive + Hover CSS ═══ */}';
const faqSection = `{/* ═══ FAQ ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>Behavioral Health PMHNP Questions</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {[
              { q: "What is behavioral health vs mental health?", a: "Behavioral health is a broader term encompassing mental health, substance use, and health behaviors. BH PMHNPs work in integrated settings alongside primary care, addressing the whole person rather than just psychiatric diagnoses in isolation." },
              { q: "What settings do BH PMHNPs work in?", a: "Behavioral health PMHNPs work in community mental health centers (CMHCs), federally qualified health centers (FQHCs), school-based clinics, primary care offices with integrated BH, corporate wellness, residential facilities, and telehealth platforms." },
              { q: "How much do behavioral health PMHNPs earn?", a: "BH PMHNPs typically earn $130K\u2013$170K annually. FQHC and CMHC positions often include loan repayment programs (NHSC up to $50K), sign-on bonuses, and excellent benefits packages." },
              { q: "What skills are important for BH PMHNPs?", a: "Key skills include collaborative care model experience, proficiency with screening tools (PHQ-9, GAD-7, AUDIT), cultural competency, EHR documentation, brief intervention techniques, and trauma-informed care approaches." },
            ].map((faq, idx) => (
              <div key={idx} className="cat-bento-card" style={{ ...clayCard, padding: '28px 28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.q}</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      ` + cssMarker;

c = c.replace(cssMarker, faqSection);

// 7. Fix responsive CSS
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

fs.writeFileSync('app/jobs/behavioral-health/page.tsx', c);
console.log('Behavioral health fully migrated');
