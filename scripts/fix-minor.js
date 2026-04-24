const fs = require('fs');

// Fix browseAllCTA for outpatient, per-diem, telehealth, va
// These pages have job listings but the CTA pattern didn't match the Tier 2 script

const pages = [
  { file: 'app/jobs/outpatient/page.tsx', q: 'outpatient', label: 'Outpatient' },
  { file: 'app/jobs/per-diem/page.tsx', q: 'per+diem', label: 'Per Diem' },
  { file: 'app/jobs/telehealth/page.tsx', q: 'telehealth', label: 'Telehealth' },
  { file: 'app/jobs/va/page.tsx', q: 'VA', label: 'VA' },
  { file: 'app/jobs/remote/page.tsx', q: 'remote', label: 'Remote' },
];

for (const { file, q, label } of pages) {
  let c = fs.readFileSync(file, 'utf-8');
  
  // Fix hero CTA for remote
  if (file.includes('remote') && !c.includes('/jobs?q=remote')) {
    // Check various patterns
    c = c.replace(/href="\/jobs\/remote"([^>]*className="[^"]*cat-cta-primary[^"]*")/g, `href="/jobs?q=remote"$1`);
    console.log(`  ${label}: fixed hero CTA`);
  }

  // Add Browse All CTA if missing
  if (!c.includes("padding: '14px 32px'")) {
    // Find the end of the job cards section - various patterns
    // Pattern: after job cards grid, before sidebar or next section
    const patterns = [
      // After pagination
      { find: '{totalPages > 1 && (', insertBefore: true },
      // After job cards
      { find: '{/* Sidebar', insertBefore: true },
    ];
    
    const ctaBlock = `\n            <div style={{ textAlign: 'center', marginTop: '32px' }}>\n              <Link href="/jobs?q=${q}" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>\n                Browse All ${label} Jobs <ArrowRight size={16} />\n              </Link>\n            </div>\n`;

    // Try inserting before sidebar
    if (c.includes('{/* Sidebar')) {
      const sidebarIdx = c.indexOf('{/* Sidebar');
      // Find the </div> right before sidebar
      const beforeSidebar = c.lastIndexOf('</div>', sidebarIdx);
      if (beforeSidebar > 0) {
        c = c.slice(0, beforeSidebar) + '</div>' + ctaBlock + c.slice(beforeSidebar + 6);
        console.log(`  ${label}: added Browse All CTA before sidebar`);
      }
    } else if (c.includes('totalPages > 1')) {
      // Insert before pagination
      const pagIdx = c.indexOf('totalPages > 1');
      const braceIdx = c.lastIndexOf('{', pagIdx);
      if (braceIdx > 0) {
        c = c.slice(0, braceIdx) + ctaBlock + c.slice(braceIdx);
        console.log(`  ${label}: added Browse All CTA before pagination`);
      }
    }
  } else {
    console.log(`  ${label}: browseAllCTA already present`);
  }

  fs.writeFileSync(file, c);
}

console.log('\nMinor fixes complete!');
