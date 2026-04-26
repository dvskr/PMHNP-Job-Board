const fs = require('fs');

const pages = [
  { file: 'app/jobs/outpatient/page.tsx', q: 'outpatient', label: 'Outpatient', filterLabel: 'Outpatient Positions' },
  { file: 'app/jobs/per-diem/page.tsx', q: 'per+diem', label: 'Per Diem', filterLabel: 'Per Diem Positions' },
  { file: 'app/jobs/telehealth/page.tsx', q: 'telehealth', label: 'Telehealth', filterLabel: 'Telehealth Positions' },
  { file: 'app/jobs/va/page.tsx', q: 'VA', label: 'VA', filterLabel: 'VA Positions' },
];

for (const { file, q, label, filterLabel } of pages) {
  let c = fs.readFileSync(file, 'utf-8');
  
  // Check if job listings section already exists
  if (c.includes('JOB LISTINGS') || c.includes('<JobCard')) {
    console.log(`${label}: already has job listings, skipping`);
    continue;
  }

  // Find the hero closing section — insert job listings after it
  const heroEnd = c.indexOf('{/* ═══ BENTO');
  if (heroEnd === -1) {
    console.log(`${label}: ⚠️ Cannot find BENTO marker`);
    continue;
  }

  // Find the </section> before the BENTO marker
  const sectionEnd = c.lastIndexOf('</section>', heroEnd);
  const insertPoint = c.indexOf('\n', sectionEnd);

  const jobListingSection = `

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>${filterLabel} ({stats.totalJobs})</h2>
              <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No ${label.toLowerCase()} positions at this time</h3>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>New ${label.toLowerCase()} openings are added daily.</p>
                <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
                </div>
              </>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?q=${q}" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>
                Browse All ${label} Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="cat-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <div style={{ padding: '24px' }}>
                <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>${label} Alerts</h3>
                <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>New ${label.toLowerCase()} listings delivered daily.</p>
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
`;

  c = c.slice(0, insertPoint) + jobListingSection + c.slice(insertPoint);

  // Ensure TrendingUp is imported
  if (!c.includes('TrendingUp')) {
    c = c.replace(
      /from 'lucide-react';/,
      (match) => {
        const importLine = c.split('\n').find(l => l.includes('lucide-react'));
        return match; // Will handle below
      }
    );
    // Just add TrendingUp to existing import
    c = c.replace("from 'lucide-react';", "TrendingUp, } from 'lucide-react';");
    // Clean up double imports
    c = c.replace(/\{ ([^}]*), TrendingUp, \}/, (m, existing) => {
      if (existing.includes('TrendingUp')) return `{ ${existing} }`;
      return `{ ${existing}, TrendingUp }`;
    });
  }

  fs.writeFileSync(file, c);
  console.log(`${label}: ✅ job listings + sidebar + browseAll CTA injected`);
}

console.log('\nAll job listings injected!');
