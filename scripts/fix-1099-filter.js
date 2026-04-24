const fs = require('fs');
let c = fs.readFileSync('app/jobs/1099/page.tsx', 'utf-8');

// Remove the 3 broad filters and replace with tighter ones
c = c.replace(
  /\{ title: \{ contains: 'contract', mode: 'insensitive' as const \} \},[\s\r\n]*\{ title: \{ contains: 'contractor', mode: 'insensitive' as const \} \},[\s\r\n]*\{ title: \{ contains: 'PRN', mode: 'insensitive' as const \} \},/,
  "{ title: { contains: 'independent practice', mode: 'insensitive' as const } },\n    { description: { contains: '1099', mode: 'insensitive' as const } },"
);

fs.writeFileSync('app/jobs/1099/page.tsx', c);
console.log('Filter tightened');
