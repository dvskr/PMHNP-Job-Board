/**
 * Remove borderRadius and boxShadow from hero watercolor images
 * so they blend edge-to-edge with the matched bg color.
 */
const fs = require('fs');
const path = require('path');

const pages = ['1099','addiction','behavioral-health','correctional','inpatient',
               'locum-tenens','outpatient','per-diem','telehealth','va'];

let updated = 0;

for (const cat of pages) {
  const file = path.join('app/jobs', cat, 'page.tsx');
  if (!fs.existsSync(file)) continue;

  let content = fs.readFileSync(file, 'utf-8');
  const old = "borderRadius: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)'";

  if (content.includes(old)) {
    content = content.replace(old, "borderRadius: '0px'");
    fs.writeFileSync(file, content);
    console.log(`✅ ${cat}: removed card styling`);
    updated++;
  } else {
    console.log(`⏭️  ${cat}: pattern not found`);
  }
}

console.log(`\nDone: ${updated} updated`);
