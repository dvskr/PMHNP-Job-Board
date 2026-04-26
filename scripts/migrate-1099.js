const fs = require('fs');
let c = fs.readFileSync('app/jobs/1099/page.tsx', 'utf-8');

// 1. Add CategoryFAQ import
c = c.replace(
  "import { JobListViewTracker } from '@/components/analytics/ViewTrackers';",
  "import CategoryFAQ from '@/components/CategoryFAQ';\nimport { JobListViewTracker } from '@/components/analytics/ViewTrackers';"
);

// 2. Replace revalidate line with clayCard token + revalidate
c = c.replace(
  /\/\/ force-dynamic.*\r?\nexport const revalidate = 3600;.*$/m,
  `/* Design Tokens */
const clayCard = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate = 3600;`
);

// 3. Fix page wrapper - use FDFBF7 bg instead of var
c = c.replace(
  `<div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>`,
  `<div style={{ backgroundColor: '#FDFBF7' }}>`
);

// 4. Add stat pills after hero closing div (same as inpatient)
const heroClose = `</div>\n      </section>`;
const statPills = `{/* Stat Pills */}
          <div className="cat-stats-grid" style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '40px' }}>
            {[
              { value: \`\${stats.totalJobs}\`, label: '1099 Positions', bg: '#D4F5E9', iconBg: '#34D399', color: '#065F46', Icon: Briefcase },
              ...(stats.avgSalary > 0 ? [{ value: \`$\${stats.avgSalary}k\`, label: 'Avg. Salary', bg: '#FFE0D3', iconBg: '#F97316', color: '#7C2D12', Icon: DollarSign }] : []),
              { value: \`\${stats.topEmployers.length}+\`, label: 'Hiring Companies', bg: '#E8DAFE', iconBg: '#A855F7', color: '#4C1D95', Icon: Building2 },
            ].map(s => {
              const SIcon = s.Icon;
              return (
              <div key={s.label} className="cat-stat-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 20px 10px 14px', borderRadius: '40px', background: s.bg, boxShadow: '4px 4px 12px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.5)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 6px rgba(0,0,0,0.1), inset 1px 1px 2px rgba(255,255,255,0.3)' }}>
                  <SIcon size={16} color="#fff" />
                </div>
                <div>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</span>
                  <span style={{ fontSize: '12px', color: s.color, opacity: 0.7, marginLeft: '6px', fontWeight: 500 }}>{s.label}</span>
                </div>
              </div>);
            })}
          </div>
        </div>
      </section>`;
c = c.replace(heroClose, statPills);

// 5. Replace old V1 benefits + comparison + listings + sidebar + FAQ + explore (lines 199-413)
// with master template sections
const oldBody = c.indexOf(`<div className="container mx-auto px-4 py-8 md:py-12">`);
const oldEnd = c.indexOf(`{/* ═══ Responsive + Hover CSS ═══ */}`);

if (oldBody > 0 && oldEnd > 0) {
  const before = c.substring(0, oldBody);
  const after = c.substring(oldEnd);
  
  const newBody = `{/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>1099 Positions ({stats.totalJobs})</h2>
              <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <FileText className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No 1099 positions at this time</h3>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>New 1099 PMHNP openings are added daily.</p>
                <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {jobs.map((job) => (<JobCard key={job.id} job={job} />))}
                </div>
              </>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?type=1099" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>
                Browse All 1099 Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="cat-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <div style={{ padding: '24px' }}>
                <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>1099 Alerts</h3>
                <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>New 1099 listings delivered to your inbox daily.</p>
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
                  {stats.topEmployers.map((employer, index) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px', whiteSpace: 'nowrap' }}>{employer.count} {employer.count === 1 ? 'job' : 'jobs'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stats.avgSalary > 0 && (
              <div className="cat-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <TrendingUp size={20} style={{ color: '#34D399' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Salary Insights</h3>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
                <p style={{ fontSize: '11px', color: '#A09080', marginTop: '12px' }}>1099 gross rates before self-employment tax and expenses.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BENTO GRID — Why Choose 1099 ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Why Choose 1099</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>Built for Independence</h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>1099 roles offer higher gross pay, full schedule control, and significant tax deduction opportunities.</p>
          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[
              { emoji: '💰', title: 'Higher Gross Pay', text: 'Earn $75-$150+/hour — 20-40% higher than W2 rates with significant tax deduction opportunities.' },
              { emoji: '📅', title: 'Schedule Control', text: 'Set your own hours, work with multiple clients, and control your patient volume and clinical focus.' },
              { emoji: '🧾', title: 'Tax Advantages', text: 'Deduct business expenses, contribute up to $66K/year to SEP-IRA, and write off home office and mileage.' },
              { emoji: '⚖️', title: 'Clinical Autonomy', text: 'Choose your clinical focus, treatment approach, and patient population without employer restrictions.' },
            ].map(c => (
              <div key={c.title} className="cat-bento-card" style={{ ...clayCard, padding: '28px 20px', textAlign: 'center' }}>
                <span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>{c.emoji}</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>{c.title}</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>{c.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ BEFORE YOU APPLY ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Before You Apply</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>Setting Up as a 1099 PMHNP</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {[
              { step: '01', title: 'Form an LLC', text: 'Create an LLC or PLLC for liability protection and tax flexibility before signing your first contract.' },
              { step: '02', title: 'Get Insurance', text: 'Secure individual malpractice insurance ($1.5-3K/year) and health coverage through the marketplace.' },
              { step: '03', title: 'Tax Setup', text: 'Get an EIN, open a business bank account, and register for quarterly estimated tax payments with the IRS.' },
              { step: '04', title: 'Retirement Plan', text: 'Open a SEP-IRA (up to $66K/year) or Solo 401k to maximize your tax-advantaged retirement savings.' },
            ].map(r => (
              <div key={r.step} className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>{r.step}</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>{r.title}</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{r.text}</p>
              </div>
            ))}
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
              { href: '/jobs/locum-tenens', label: 'Locum Tenens', sub: 'Travel assignments', emoji: '✈️' },
              { href: '/jobs/per-diem', label: 'Per Diem', sub: 'Flexible shifts', emoji: '📅' },
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

      <CategoryFAQ category="1099" totalJobs={stats.totalJobs} />

      `;
  
  c = before + newBody + after;
}

// 6. Fix responsive CSS to match master template
c = c.replace(
  /<style>{`[\s\S]*?`}<\/style>/,
  `<style>{\`
        .cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .cat-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .cat-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .cat-stat-pill { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .cat-stat-pill:hover { transform: translateY(-2px) scale(1.02); box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important; }
        @media (max-width: 768px) {
          .cat-hero-grid { grid-template-columns: 1fr !important; }
          .cat-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .cat-bento-grid { grid-template-columns: 1fr !important; }
          .cat-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      \`}</style>`
);

// 7. Fix closing divs
c = c.replace(/<\/div>\s*<\/div>\s*\n\s*{\/\* ═══ Responsive/, `\n      {/* ═══ Responsive`);

fs.writeFileSync('app/jobs/1099/page.tsx', c);
console.log('1099 page migrated to master template');
