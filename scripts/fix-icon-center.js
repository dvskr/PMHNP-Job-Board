const fs = require('fs');

// Fix all 3 pages: center icons + regenerate will follow
const pages = [
  'app/jobs/behavioral-health/page.tsx',
  'app/jobs/addiction/page.tsx', 
  'app/jobs/1099/page.tsx',
];

for (const page of pages) {
  let c = fs.readFileSync(page, 'utf-8');
  
  // Fix ROW 2 card containers - add flex centering for icons
  // The cards have textAlign: center but Images need flex centering
  c = c.replace(
    /gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center'/g,
    "gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column' as const, alignItems: 'center'"
  );
  
  fs.writeFileSync(page, c);
  console.log(`Fixed centering: ${page}`);
}
