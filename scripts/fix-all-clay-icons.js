const fs = require('fs');

// ═══ FIX ADDICTION PAGE ═══
let addiction = fs.readFileSync('app/jobs/addiction/page.tsx', 'utf-8');

const addictionReplacements = [
  ['💊', 'Dual Diagnosis', 'icon_addiction_dual.png', 'Dual diagnosis treatment'],
  ['🏥', 'Growing Demand', 'icon_addiction_demand.png', 'Growing demand'],
  ['❤️', 'Life-Changing Impact', 'icon_addiction_heart.png', 'Patient recovery'],
  ['🛡️', 'Harm Reduction', 'icon_addiction_harm.png', 'Harm reduction'],
];

for (const [emoji, title, file, alt] of addictionReplacements) {
  addiction = addiction.replace(
    `<span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>${emoji}</span>\n              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>${title}</h3>`,
    `<Image src="/images/categories/${file}" alt="${alt}" width={64} height={64} style={{ width: '64px', height: '64px', borderRadius: '12px', marginBottom: '10px' }} />\n              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>${title}</h3>`
  );
}

fs.writeFileSync('app/jobs/addiction/page.tsx', addiction);
console.log('Addiction: clay icons applied');

// ═══ FIX 1099 PAGE ═══
let ic = fs.readFileSync('app/jobs/1099/page.tsx', 'utf-8');

const icReplacements = [
  ['📅', 'Schedule Control', 'icon_1099_schedule.png', 'Schedule flexibility'],
  ['⚖️', 'Clinical Autonomy', 'icon_1099_autonomy.png', 'Clinical autonomy'],
  ['🏦', 'Multi-Client', 'icon_1099_multi.png', 'Multiple clients'],
  ['🛡️', 'LLC Protection', 'icon_1099_llc.png', 'LLC protection'],
];

for (const [emoji, title, file, alt] of icReplacements) {
  ic = ic.replace(
    `<span style={{ fontSize: '36px', display: 'block', marginBottom: '14px' }}>${emoji}</span>\n              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>${title}</h3>`,
    `<Image src="/images/categories/${file}" alt="${alt}" width={64} height={64} style={{ width: '64px', height: '64px', borderRadius: '12px', marginBottom: '10px' }} />\n              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>${title}</h3>`
  );
}

fs.writeFileSync('app/jobs/1099/page.tsx', ic);
console.log('1099: clay icons applied');
