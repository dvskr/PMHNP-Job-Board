const fs = require('fs');

const pages = [
  'app/jobs/behavioral-health/page.tsx',
  'app/jobs/addiction/page.tsx',
  'app/jobs/1099/page.tsx',
];

for (const page of pages) {
  let c = fs.readFileSync(page, 'utf-8');

  // Fix icon size: 64x64 → 48x48
  c = c.replace(/width=\{64\} height=\{64\}/g, 'width={48} height={48}');

  // Fix icon style: flex centering → margin auto centering
  c = c.replace(
    /width: '64px', height: '64px', borderRadius: '12px', marginBottom: '10px'/g,
    "width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block'"
  );

  // Remove flex centering from ROW 2 cards (not needed with margin auto)
  c = c.replace(
    /display: 'flex', flexDirection: 'column' as const, alignItems: 'center'/g,
    ''
  );

  // Clean up any double commas from removal
  c = c.replace(/, ,/g, ',');
  c = c.replace(/textAlign: 'center', ,/g, "textAlign: 'center',");
  c = c.replace(/textAlign: 'center',  }/g, "textAlign: 'center' }");

  fs.writeFileSync(page, c);
  console.log(`Fixed: ${page}`);
}

console.log('All 3 pages updated to 48x48 + margin auto centering');
