const fs = require('fs');
const path = require('path');

const baseDir = 'app/jobs';
const skipDirs = ['[slug]', 'city', 'state', 'locations', 'edit', 'metro'];

const categories = fs.readdirSync(baseDir)
  .filter(f => {
    const full = path.join(baseDir, f);
    return fs.statSync(full).isDirectory() && !skipDirs.includes(f);
  });

console.log(`Total category pages: ${categories.length}\n`);

const results = [];

for (const cat of categories) {
  const file = path.join(baseDir, cat, 'page.tsx');
  if (!fs.existsSync(file)) {
    results.push({ cat, status: '❌ NO PAGE FILE' });
    continue;
  }
  
  const c = fs.readFileSync(file, 'utf-8');
  const checks = {
    clayCard: c.includes('const clayCard'),
    jobListings: c.includes('JobCard') || c.includes('job.id'),
    bento12col: c.includes("repeat(12, 1fr)"),
    clayIcons: c.includes("objectFit: 'contain', margin: '0 auto") || c.includes('icon_'),
    noEmojiBento: !(c.includes("fontSize: '36px'") && c.includes('span')),
    heroCTA: c.includes('/jobs?q='),
    browseAllCTA: c.includes("padding: '14px 32px'"),
    faqSection: c.includes('FAQ') && (c.includes('faq.question') || c.includes('CategoryFAQ')),
    tabletCSS: c.includes('min-width: 769px'),
    beforeApply: c.includes('Before You Apply') || c.includes('BEFORE YOU APPLY') || c.includes('before you apply'),
    exploreMore: c.includes('Keep Exploring') || c.includes('EXPLORE MORE'),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const missing = Object.entries(checks).filter(([,v]) => !v).map(([k]) => k);
  
  let status;
  if (passed === total) status = '✅ COMPLETE';
  else if (passed >= 8) status = '🔧 MINOR';
  else if (passed >= 5) status = '⚠️ PARTIAL';
  else status = '❌ NEEDS FULL MIGRATION';
  
  results.push({ cat, status, passed, total, missing: missing.join(', ') });
}

// Print table
console.log('Page'.padEnd(22) + 'Status'.padEnd(25) + 'Score'.padEnd(8) + 'Missing');
console.log('-'.repeat(100));
for (const r of results) {
  if (r.passed !== undefined) {
    console.log(
      r.cat.padEnd(22) +
      r.status.padEnd(25) +
      `${r.passed}/${r.total}`.padEnd(8) +
      (r.missing || '')
    );
  } else {
    console.log(r.cat.padEnd(22) + r.status);
  }
}

const complete = results.filter(r => r.status === '✅ COMPLETE').length;
const minor = results.filter(r => r.status === '🔧 MINOR').length;
const partial = results.filter(r => r.status === '⚠️ PARTIAL').length;
const needsFull = results.filter(r => r.status && r.status.includes('NEEDS')).length;
console.log(`\n═══ SUMMARY ═══`);
console.log(`✅ Complete: ${complete}`);
console.log(`🔧 Minor fixes: ${minor}`);
console.log(`⚠️ Partial: ${partial}`);
console.log(`❌ Needs full migration: ${needsFull}`);
console.log(`Total: ${categories.length}`);
