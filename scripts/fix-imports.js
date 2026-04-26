const fs = require('fs');

const files = [
  'app/jobs/child-adolescent/page.tsx',
  'app/jobs/new-grad/page.tsx',
  'app/jobs/substance-abuse/page.tsx',
  'app/jobs/travel/page.tsx',
];

for (const file of files) {
  let c = fs.readFileSync(file, 'utf-8');
  
  // Ensure Image import
  if (!c.includes("import Image from 'next/image'") && !c.includes('import Image from "next/image"')) {
    c = c.replace("import Link from 'next/link';", "import Link from 'next/link';\nimport Image from 'next/image';");
    console.log(`  ${file}: added Image import`);
  }
  
  // Ensure ArrowRight in lucide imports
  if (!c.includes('ArrowRight')) {
    c = c.replace("from 'lucide-react';", ", ArrowRight } from 'lucide-react';");
    c = c.replace('{ ,', '{ ');
    console.log(`  ${file}: added ArrowRight`);
  }
  
  // Ensure Building2 in lucide imports
  if (!c.includes('Building2')) {
    c = c.replace("from 'lucide-react';", ", Building2 } from 'lucide-react';");
    console.log(`  ${file}: added Building2`);
  }
  
  // Ensure Bell in lucide imports
  if (!c.includes('Bell')) {
    c = c.replace("from 'lucide-react';", ", Bell } from 'lucide-react';");
    console.log(`  ${file}: added Bell`);
  }
  
  // Ensure TrendingUp in lucide imports
  if (!c.includes('TrendingUp')) {
    c = c.replace("from 'lucide-react';", ", TrendingUp } from 'lucide-react';");
    console.log(`  ${file}: added TrendingUp`);
  }
  
  // Fix double commas in imports
  c = c.replace(/,\s*,/g, ',');
  
  fs.writeFileSync(file, c);
}

console.log('Import fixes done');
