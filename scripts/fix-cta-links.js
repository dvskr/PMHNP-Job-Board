const fs = require('fs');

// Map each category to the best CTA search term
const ctaFixes = {
  'community-health': { old: 'community+health', new: 'community+health+PMHNP' },
  'contract': { old: 'contract', new: 'contract+PMHNP' },
  'crisis': { old: 'crisis', new: 'crisis+PMHNP' },
  'entry-level': { old: 'entry+level', new: 'entry+level+PMHNP' },
  'full-time': { old: 'full+time', new: 'full+time+PMHNP' },
  'geriatric': { old: 'geriatric', new: 'geriatric+PMHNP' },
  'hospital': { old: 'hospital', new: 'hospital+PMHNP' },
  'lgbtq': { old: 'LGBTQ', new: 'LGBTQ+PMHNP' },
  'mid-career': { old: 'mid+career', new: 'senior+PMHNP' },
  'part-time': { old: 'part+time', new: 'part+time+PMHNP' },
  'private-practice': { old: 'private+practice', new: 'private+practice+PMHNP' },
  'senior': { old: 'senior+PMHNP', new: 'senior+PMHNP' },
  'veterans': { old: 'veteran', new: 'VA+PMHNP' },
};

for (const [cat, { old, new: newQ }] of Object.entries(ctaFixes)) {
  const file = `app/jobs/${cat}/page.tsx`;
  let c = fs.readFileSync(file, 'utf-8');
  
  if (old !== newQ) {
    const count = (c.match(new RegExp(`/jobs\\?q=${old.replace(/\+/g, '\\+')}`, 'g')) || []).length;
    c = c.replace(new RegExp(`/jobs\\?q=${old.replace(/\+/g, '\\+')}`, 'g'), `/jobs?q=${newQ}`);
    console.log(`${cat}: updated ${count} CTA links → /jobs?q=${newQ}`);
  } else {
    console.log(`${cat}: CTA already good`);
  }
  
  fs.writeFileSync(file, c);
}

console.log('\nAll CTAs updated!');
