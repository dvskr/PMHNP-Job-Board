/**
 * Apply V2 sampled bg colors to hero sections for all 10 category pages.
 * These V2 images have solid, uniform backgrounds — so the sampled corner
 * color will match perfectly with zero seam.
 */
const fs = require('fs');
const path = require('path');

const COLOR_MAP = {
  '1099':              '#d19b99',   // soft rose
  'addiction':         '#aabe9c',   // sage green
  'behavioral-health': '#bda3cd',  // lavender
  'correctional':     '#95aabd',   // steel blue
  'inpatient':        '#e8b18b',   // warm peach
  'locum-tenens':     '#91c9e7',   // sky blue
  'outpatient':       '#9ed2ba',   // mint
  'per-diem':         '#dcba74',   // warm gold
  'telehealth':       '#ede0c7',   // soft cream
  'va':               '#97b0c9',   // dusty blue
};

let updated = 0;
let failed = 0;

for (const [cat, newColor] of Object.entries(COLOR_MAP)) {
  const file = path.join('app/jobs', cat, 'page.tsx');
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${cat}: page doesn't exist`);
    continue;
  }

  let content = fs.readFileSync(file, 'utf-8');

  // Match any background: '...' in the hero section line (the one with padding: '72px')
  const heroRegex = /background:\s*'[^']*'(,\s*padding:\s*'72px)/;
  const match = content.match(heroRegex);

  if (match) {
    const oldBg = match[0];
    const newBg = `background: '${newColor}'${match[1]}`;
    content = content.replace(oldBg, newBg);
    fs.writeFileSync(file, content);
    console.log(`✅ ${cat}: bg → ${newColor}`);
    updated++;
  } else {
    console.log(`❌ ${cat}: hero bg pattern not found`);
    failed++;
  }
}

console.log(`\nDone: ${updated} updated, ${failed} failed`);
