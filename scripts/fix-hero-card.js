/**
 * Add border-radius + soft shadow to all hero watercolor images
 * so they look like intentional illustration cards — no seam possible
 * Also reset bg to a neutral warm tone that works universally.
 */
const fs = require('fs');
const path = require('path');

const PAGES = [
  '1099', 'addiction', 'behavioral-health', 'correctional',
  'inpatient', 'locum-tenens', 'outpatient', 'per-diem',
  'telehealth', 'va',
];

// Neutral warm bg that works with all illustrations as a card frame
const HERO_BG = '#F5EDE8'; // warm cream - works universally

let updated = 0;

PAGES.forEach(folder => {
  const filePath = path.join(__dirname, '..', 'app', 'jobs', folder, 'page.tsx');
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf-8');

  // 1. Add borderRadius + shadow to the Image element
  // Match: style={{ width: '100%', maxWidth: '500px', height: 'auto' }}
  const oldImageStyle = "style={{ width: '100%', maxWidth: '500px', height: 'auto' }}";
  const newImageStyle = "style={{ width: '100%', maxWidth: '500px', height: 'auto', borderRadius: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}";

  if (content.includes(oldImageStyle)) {
    content = content.replace(oldImageStyle, newImageStyle);
  }

  // 2. Replace whatever bg color is currently set with neutral warm cream
  // Match the background hex in the hero section
  const bgMatch = content.match(/background: '#([a-fA-F0-9]{6})'/);
  if (bgMatch) {
    const oldBg = bgMatch[0];
    content = content.replace(oldBg, `background: '${HERO_BG}'`);
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✅ ${folder}: rounded + shadow + bg=${HERO_BG}`);
  updated++;
});

console.log(`\nUpdated: ${updated} pages`);
