/**
 * Fix hero bg colors using the REAL sampled edge averages from sharp
 */
const fs = require('fs');
const path = require('path');

const COLOR_MAP = {
  '1099':              { old: '#f5dbd4', new: '#da9899' },
  'addiction':         { old: '#f3e8d9', new: '#dac0a5' },
  'behavioral-health': { old: '#fefffe', new: '#eee0e3' },
  'correctional':      { old: '#fcfcfc', new: '#ffffff' },  // already white, fine
  'inpatient':         { old: '#f2d0ba', new: '#ecb595' },
  'locum-tenens':      { old: '#fefefe', new: '#ffffff' },  // already white, fine
  'outpatient':        { old: '#f6faf7', new: '#e4f4e8' },
  'per-diem':          { old: '#fafcf4', new: '#faf1dc' },
  'telehealth':        { old: '#f8f6ee', new: '#faf8f0' },
  'va':                { old: '#d7dde0', new: '#adb1bc' },
};

let updated = 0;

Object.entries(COLOR_MAP).forEach(([folder, colors]) => {
  const filePath = path.join(__dirname, '..', 'app', 'jobs', folder, 'page.tsx');
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (no file): ${folder}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  
  if (content.includes(colors.old)) {
    content = content.replace(colors.old, colors.new);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ ${folder}: ${colors.old} → ${colors.new}`);
    updated++;
  } else if (content.includes(colors.new)) {
    console.log(`OK (already correct): ${folder} = ${colors.new}`);
  } else {
    console.log(`WARN (color not found): ${folder} — looking for ${colors.old}`);
  }
});

console.log(`\nUpdated: ${updated} pages`);
