const fs = require('fs');

// ═══ TIER 1: Quick fixes ═══

// 1. Add tablet CSS to 1099, addiction, behavioral-health
const tabletCSS = `@media (min-width: 769px) and (max-width: 1024px) {
          .cat-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .cat-bento-hero-1, .cat-bento-hero-3 { grid-column: span 6 !important; }
          .cat-bento-hero-2, .cat-bento-cta { grid-column: span 6 !important; }
          .cat-bento-grid > div:not(.cat-bento-hero-1):not(.cat-bento-hero-2):not(.cat-bento-hero-3):not(.cat-bento-cta) { grid-column: span 3 !important; }
        }`;

['app/jobs/1099/page.tsx', 'app/jobs/addiction/page.tsx', 'app/jobs/behavioral-health/page.tsx'].forEach(file => {
  let c = fs.readFileSync(file, 'utf-8');
  if (!c.includes('min-width: 769px')) {
    c = c.replace('`}</style>', tabletCSS + '\n      `}</style>');
    fs.writeFileSync(file, c);
    console.log(`Added tablet CSS: ${file}`);
  } else {
    console.log(`Already has tablet CSS: ${file}`);
  }
});

// 2. Fix remote hero CTA
let remote = fs.readFileSync('app/jobs/remote/page.tsx', 'utf-8');
if (!remote.includes('/jobs?q=remote')) {
  remote = remote.replace(
    /href="\/jobs\/remote" className="clay-btn cat-cta-primary"/,
    'href="/jobs?q=remote" className="clay-btn cat-cta-primary"'
  );
  // Also check for other self-linking patterns
  remote = remote.replace(
    /href="\/jobs\/remote" className="cat-cta-primary"/,
    'href="/jobs?q=remote" className="cat-cta-primary"'
  );
  fs.writeFileSync('app/jobs/remote/page.tsx', remote);
  console.log('Fixed remote hero CTA');
} else {
  console.log('Remote CTA already fixed');
}

console.log('\nTier 1 complete!');
