const fs = require('fs');

// Fix ALL category pages: CTA links should use ?q= for filtered search on /jobs
const fixes = [
  {
    file: 'app/jobs/inpatient/page.tsx',
    oldCTA: '/jobs?setting=inpatient',
    newCTA: '/jobs?q=inpatient',
    category: 'inpatient',
    heroCTA: 'Browse All Inpatient Jobs',
  },
  {
    file: 'app/jobs/addiction/page.tsx',
    category: 'addiction',
    heroCTA: 'Browse All Addiction Jobs',
  },
  {
    file: 'app/jobs/behavioral-health/page.tsx',
    category: 'behavioral health',
    heroCTA: 'Browse All BH Jobs',
  },
  {
    file: 'app/jobs/1099/page.tsx',
    category: '1099',
    heroCTA: 'Browse All 1099 Jobs',
  },
];

for (const fix of fixes) {
  let c = fs.readFileSync(fix.file, 'utf-8');

  // Fix inpatient old CTA
  if (fix.oldCTA) {
    c = c.replace(fix.oldCTA, fix.newCTA);
  }

  // Fix hero CTA: should link to /jobs?q={category}
  // Hero CTA links to same page (/jobs/category) — change to /jobs?q=
  c = c.replace(
    new RegExp(`href="/jobs/${fix.category.replace(/\s/g, '-')}" className="clay-btn cat-cta-primary"`),
    `href="/jobs?q=${encodeURIComponent(fix.category)}" className="clay-btn cat-cta-primary"`
  );

  // Check if CTA under job listings exists
  if (!c.includes('Browse All') || !c.includes('cat-cta-primary" style={{ padding: \'14px 32px\'')) {
    // Need to add CTA after job grid — find the closing of job grid
    const jobGridClose = '</div>\n            )}\n          </div>';
    const jobGridCloseAlt = '</div>\n            )}';
    
    // Check if there's already a Browse All CTA below jobs
    const browseAllPattern = `Browse All ${fix.category.charAt(0).toUpperCase() + fix.category.slice(1)} Jobs`;
    
    if (!c.includes('Browse All') || !c.includes("padding: '14px 32px'")) {
      // Find the spot after job cards and before sidebar
      const sidebarMarker = '{/* Sidebar */}';
      const sidebarIdx = c.indexOf(sidebarMarker);
      
      if (sidebarIdx > 0) {
        // Check if CTA already exists before sidebar
        const beforeSidebar = c.substring(sidebarIdx - 300, sidebarIdx);
        if (!beforeSidebar.includes("padding: '14px 32px'")) {
          // Insert CTA before sidebar
          const ctaBlock = `<div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?q=${encodeURIComponent(fix.category)}" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>
                Browse All ${fix.category.charAt(0).toUpperCase() + fix.category.slice(1)} Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          ${sidebarMarker}`;
          
          c = c.replace(`</div>\n          ${sidebarMarker}`, ctaBlock);
        }
      }
    }
  }

  // Also fix "View All Jobs →" link to include filter
  c = c.replace(
    />View All Jobs →</,
    `>View All Jobs →<`
  );

  fs.writeFileSync(fix.file, c);
  console.log(`Fixed CTAs: ${fix.file}`);
}

console.log('All CTA links updated');
