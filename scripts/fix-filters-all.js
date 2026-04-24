const fs = require('fs');

// Better WHERE_CLAUSE filters for each category
const filterFixes = {
  'community-health': {
    filter: `  OR: [
    { title: { contains: 'community', mode: 'insensitive' as const } },
    { title: { contains: 'FQHC', mode: 'insensitive' as const } },
    { title: { contains: 'public health', mode: 'insensitive' as const } },
  ],`,
  },
  'contract': {
    filter: `  OR: [
    { title: { contains: 'contract', mode: 'insensitive' as const } },
    { title: { contains: 'temp-to-perm', mode: 'insensitive' as const } },
    { title: { contains: 'temporary', mode: 'insensitive' as const } },
  ],`,
  },
  'crisis': {
    filter: `  OR: [
    { title: { contains: 'crisis', mode: 'insensitive' as const } },
    { title: { contains: 'emergency psych', mode: 'insensitive' as const } },
    { title: { contains: 'acute stabilization', mode: 'insensitive' as const } },
    { title: { contains: 'urgent', mode: 'insensitive' as const } },
  ],`,
  },
  'entry-level': {
    filter: `  OR: [
    { title: { contains: 'entry level', mode: 'insensitive' as const } },
    { title: { contains: 'entry-level', mode: 'insensitive' as const } },
    { title: { contains: 'new grad', mode: 'insensitive' as const } },
    { title: { contains: 'new graduate', mode: 'insensitive' as const } },
  ],`,
  },
  'full-time': {
    filter: `  OR: [
    { title: { contains: 'full-time', mode: 'insensitive' as const } },
    { title: { contains: 'full time', mode: 'insensitive' as const } },
    { title: { contains: 'FT ', mode: 'insensitive' as const } },
    { title: { contains: 'permanent', mode: 'insensitive' as const } },
  ],`,
  },
  'geriatric': {
    filter: `  OR: [
    { title: { contains: 'geriatric', mode: 'insensitive' as const } },
    { title: { contains: 'geropsych', mode: 'insensitive' as const } },
    { title: { contains: 'elderly', mode: 'insensitive' as const } },
    { title: { contains: 'senior living', mode: 'insensitive' as const } },
    { title: { contains: 'nursing home', mode: 'insensitive' as const } },
  ],`,
  },
  'hospital': {
    filter: `  OR: [
    { title: { contains: 'hospital', mode: 'insensitive' as const } },
    { title: { contains: 'inpatient', mode: 'insensitive' as const } },
    { title: { contains: 'acute care', mode: 'insensitive' as const } },
  ],`,
  },
  'lgbtq': {
    filter: `  OR: [
    { title: { contains: 'LGBTQ', mode: 'insensitive' as const } },
    { title: { contains: 'gender', mode: 'insensitive' as const } },
    { title: { contains: 'transgender', mode: 'insensitive' as const } },
    { title: { contains: 'affirming', mode: 'insensitive' as const } },
  ],`,
  },
  'mid-career': {
    filter: `  OR: [
    { title: { contains: 'senior', mode: 'insensitive' as const } },
    { title: { contains: 'experienced', mode: 'insensitive' as const } },
    { title: { contains: 'lead', mode: 'insensitive' as const } },
    { title: { contains: 'supervisor', mode: 'insensitive' as const } },
  ],`,
  },
  'part-time': {
    filter: `  OR: [
    { title: { contains: 'part-time', mode: 'insensitive' as const } },
    { title: { contains: 'part time', mode: 'insensitive' as const } },
    { title: { contains: 'PT ', mode: 'insensitive' as const } },
    { title: { contains: 'PRN', mode: 'insensitive' as const } },
  ],`,
  },
  'private-practice': {
    filter: `  OR: [
    { title: { contains: 'private practice', mode: 'insensitive' as const } },
    { title: { contains: 'group practice', mode: 'insensitive' as const } },
    { title: { contains: 'solo practice', mode: 'insensitive' as const } },
    { title: { contains: 'independent practice', mode: 'insensitive' as const } },
  ],`,
  },
  'senior': {
    filter: `  OR: [
    { title: { contains: 'senior', mode: 'insensitive' as const } },
    { title: { contains: 'director', mode: 'insensitive' as const } },
    { title: { contains: 'chief', mode: 'insensitive' as const } },
    { title: { contains: 'manager', mode: 'insensitive' as const } },
    { title: { contains: 'supervisor', mode: 'insensitive' as const } },
  ],`,
  },
  'veterans': {
    filter: `  OR: [
    { title: { contains: 'veteran', mode: 'insensitive' as const } },
    { title: { contains: 'VA ', mode: 'insensitive' as const } },
    { title: { contains: 'military', mode: 'insensitive' as const } },
    { title: { contains: 'VHA', mode: 'insensitive' as const } },
  ],`,
  },
};

for (const [cat, { filter }] of Object.entries(filterFixes)) {
  const file = `app/jobs/${cat}/page.tsx`;
  let c = fs.readFileSync(file, 'utf-8');
  
  // Replace the single-keyword OR clause
  const oldFilterRegex = /  OR: \[\n    \{ title: \{ contains: '[^']+', mode: 'insensitive' as const \} \},\n  \],/;
  if (oldFilterRegex.test(c)) {
    c = c.replace(oldFilterRegex, filter);
    console.log(`${cat}: ✅ filter tightened`);
  } else {
    console.log(`${cat}: ⚠️ pattern not found`);
  }
  
  fs.writeFileSync(file, c);
}

console.log('\nAll filters tightened!');
