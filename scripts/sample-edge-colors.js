/**
 * Sample the actual edge pixel colors from watercolor hero images
 * using sharp (already a Next.js dependency)
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const IMAGES = [
  'hero_wc_1099.png',
  'hero_wc_addiction.png',
  'hero_wc_behavioralhealth.png',
  'hero_wc_correctional.png',
  'hero_wc_inpatient.png',
  'hero_wc_locumtenens.png',
  'hero_wc_outpatient.png',
  'hero_wc_perdiem.png',
  'hero_wc_remote.png',
  'hero_wc_telehealth.png',
  'hero_wc_va.png',
];

async function sampleEdge(imgPath) {
  const img = sharp(imgPath);
  const { width, height } = await img.metadata();
  
  // Sample multiple points along the LEFT edge (where text bg meets image)
  // and TOP edge (where header meets image)
  const samplePoints = [
    // Top-left corner (5x5 area)
    { left: 0, top: 0, width: 10, height: 10 },
    // Top-right corner
    { left: width - 10, top: 0, width: 10, height: 10 },
    // Bottom-left corner
    { left: 0, top: height - 10, width: 10, height: 10 },
    // Bottom-right corner
    { left: width - 10, top: height - 10, width: 10, height: 10 },
    // Left edge middle
    { left: 0, top: Math.floor(height / 2) - 5, width: 10, height: 10 },
    // Top edge middle
    { left: Math.floor(width / 2) - 5, top: 0, width: 10, height: 10 },
    // Right edge middle
    { left: width - 10, top: Math.floor(height / 2) - 5, width: 10, height: 10 },
    // Bottom edge middle
    { left: Math.floor(width / 2) - 5, top: height - 10, width: 10, height: 10 },
  ];

  const colors = [];
  for (const region of samplePoints) {
    const { data, info } = await sharp(imgPath)
      .extract(region)
      .resize(1, 1) // Average the region into 1 pixel
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const r = data[0], g = data[1], b = data[2];
    colors.push({ r, g, b, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}` });
  }

  // Overall average of all edge samples
  const avgR = Math.round(colors.reduce((s, c) => s + c.r, 0) / colors.length);
  const avgG = Math.round(colors.reduce((s, c) => s + c.g, 0) / colors.length);
  const avgB = Math.round(colors.reduce((s, c) => s + c.b, 0) / colors.length);
  const avgHex = `#${avgR.toString(16).padStart(2,'0')}${avgG.toString(16).padStart(2,'0')}${avgB.toString(16).padStart(2,'0')}`;

  return {
    dimensions: `${width}x${height}`,
    topLeft: colors[0].hex,
    topRight: colors[1].hex,
    bottomLeft: colors[2].hex,
    bottomRight: colors[3].hex,
    leftMid: colors[4].hex,
    topMid: colors[5].hex,
    rightMid: colors[6].hex,
    bottomMid: colors[7].hex,
    edgeAverage: avgHex,
  };
}

async function main() {
  const dir = path.join(__dirname, '..', 'public', 'images', 'categories');
  
  console.log('Image Edge Color Sampling Results');
  console.log('='.repeat(120));
  console.log('');
  
  for (const img of IMAGES) {
    const imgPath = path.join(dir, img);
    if (!fs.existsSync(imgPath)) {
      console.log(`MISSING: ${img}`);
      continue;
    }
    
    const result = await sampleEdge(imgPath);
    console.log(`${img} (${result.dimensions})`);
    console.log(`  TL: ${result.topLeft}  TC: ${result.topMid}  TR: ${result.topRight}`);
    console.log(`  ML: ${result.leftMid}                    MR: ${result.rightMid}`);
    console.log(`  BL: ${result.bottomLeft}  BC: ${result.bottomMid}  BR: ${result.bottomRight}`);
    console.log(`  >>> EDGE AVERAGE: ${result.edgeAverage}`);
    console.log('');
  }
}

main().catch(console.error);
