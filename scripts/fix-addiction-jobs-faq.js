const fs = require('fs');
let c = fs.readFileSync('app/jobs/addiction/page.tsx', 'utf-8');

// 1. Add JobListViewTracker import if missing
if (!c.includes('JobListViewTracker')) {
  c = c.replace(
    "import CategoryFAQ from '@/components/CategoryFAQ';",
    "import CategoryFAQ from '@/components/CategoryFAQ';\nimport { JobListViewTracker } from '@/components/analytics/ViewTrackers';"
  );
}

// 2. Add Briefcase import
if (!c.includes('Briefcase')) {
  c = c.replace(
    "Heart, DollarSign, TrendingUp, Building2, Bell, Wifi, Video, Plane, GraduationCap, Calendar, Shield , ArrowRight",
    "Heart, DollarSign, TrendingUp, Building2, Bell, Briefcase, ArrowRight"
  );
}

// 3. Add job listings section after hero close
const heroClose = '</section>\r\n\r\n            {/* ═══ BENTO';
const jobListings = `</section>

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>Addiction Positions ({stats.totalJobs})</h2>
              <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <Heart className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No addiction positions at this time</h3>
                <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?type=addiction" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>
                Browse All Addiction Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="cat-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <div style={{ padding: '24px' }}>
                <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>Addiction Alerts</h3>
                <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>New addiction & SUD listings delivered daily.</p>
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

            {/* ═══ BENTO`;

c = c.replace(heroClose, jobListings);

// 4. Add FAQ section before responsive CSS
const cssStart = '{/* ═══ Responsive + Hover CSS ═══ */}';
const faqSection = `{/* ═══ FAQ ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>Addiction PMHNP Questions</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {[
              { q: "What does an addiction PMHNP do?", a: "An addiction PMHNP specializes in treating substance use disorders (SUD) and co-occurring mental health conditions. They prescribe medications like buprenorphine and naltrexone for medication-assisted treatment (MAT), manage detox protocols, provide therapy, and coordinate comprehensive recovery plans." },
              { q: "Do I need special certification for addiction PMHNP work?", a: "While not always required, the DEA X-waiver (now integrated into standard DEA registration) is essential for prescribing buprenorphine. ASAM certification or CARN (Certified Addictions Registered Nurse) credentials significantly strengthen your candidacy and are preferred by many employers." },
              { q: "How much do addiction PMHNPs earn?", a: "Addiction PMHNPs typically earn $130K–$180K annually, with some positions in high-demand areas exceeding $200K. Many roles include loan repayment programs, sign-on bonuses, and relocation assistance due to the critical shortage of addiction medicine providers." },
              { q: "Is addiction psychiatry a good PMHNP specialty?", a: "Yes — addiction psychiatry is one of the fastest-growing PMHNP specialties. The opioid crisis has driven 40%+ growth in positions, and there's a severe shortage of qualified providers. The work is deeply meaningful, with high job security and competitive compensation." },
            ].map((faq, idx) => (
              <div key={idx} className="cat-bento-card" style={{ ...clayCard, padding: '28px 28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.q}</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      ` + cssStart;

c = c.replace(cssStart, faqSection);

fs.writeFileSync('app/jobs/addiction/page.tsx', c);
console.log('Added job listings + FAQ to addiction page');
