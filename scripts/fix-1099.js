const fs = require('fs');
let c = fs.readFileSync('app/jobs/1099/page.tsx', 'utf-8');

// Escape dollar signs in template literals for safe eval
// Replace the entire body after hero section closing tag through to the style tag

// Find the markers
const bodyStart = c.indexOf('<div className="container mx-auto');
const styleStart = c.indexOf('{/* ═══ Responsive + Hover CSS ═══ */}');

if (bodyStart === -1 || styleStart === -1) {
  console.log('Markers not found:', bodyStart, styleStart);
  process.exit(1);
}

// 1. Add CategoryFAQ import
if (!c.includes("CategoryFAQ")) {
  c = c.replace(
    "import { JobListViewTracker }",
    "import CategoryFAQ from '@/components/CategoryFAQ';\nimport { JobListViewTracker }"
  );
}

// 2. Add clayCard token
if (!c.includes("clayCard")) {
  c = c.replace(
    '// force-dynamic removed: it overrides revalidate and defeats ISR caching\r\nexport const revalidate = 3600; // ISR: cache for 1 hour',
    `/* Design Tokens */\nconst clayCard: React.CSSProperties = {\n  background: '#FFFFFF', borderRadius: '20px',\n  border: '1px solid rgba(255,255,255,0.5)',\n  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',\n};\n\nexport const revalidate = 3600;`
  );
}

// 3. Fix bg color
c = c.replace(
  `backgroundColor: 'var(--bg-primary)'`,
  `backgroundColor: '#FDFBF7'`
);

// 4. Add Briefcase and TrendingUp imports  
c = c.replace(
  "FileText, DollarSign, Scale, Calculator, Building2, Lightbulb, Bell, Wifi, Video, GraduationCap, Plane, Calendar , ArrowRight",
  "FileText, DollarSign, Scale, Calculator, Building2, Lightbulb, Bell, Briefcase, TrendingUp, ArrowRight"
);

fs.writeFileSync('app/jobs/1099/page.tsx', c);
console.log('Phase 1 done: tokens + imports');
