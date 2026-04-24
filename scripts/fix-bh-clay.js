const fs = require('fs');
let c = fs.readFileSync('app/jobs/behavioral-health/page.tsx', 'utf-8');

c = c.replace(
  /\/\/ ISR caching\r?\nexport const revalidate = 3600;/,
  `// ISR caching
const clayCard = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate = 3600;`
);

fs.writeFileSync('app/jobs/behavioral-health/page.tsx', c);
console.log('clayCard added:', c.includes('clayCard ='));
