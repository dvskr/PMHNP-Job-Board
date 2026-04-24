/**
 * Migrate hero sections: Add watercolor image + match bg color
 * For each page that has a hero_wc image available:
 * 1. Add `Image` and `ArrowRight` imports if missing
 * 2. Replace flat bg-teal-600 hero with watercolor hero layout
 * 3. Set hero bg to sampled corner-average color from the image
 */
const fs = require('fs');
const path = require('path');

const PAGES = [
  {
    folder: '1099',
    image: 'hero_wc_1099.png',
    bgColor: '#f5dbd4',
    alt: 'PMHNP independent contractor workspace',
    h1Line1: '1099 PMHNP',
    h1Line2: 'Jobs',
    subtitle: 'Independent contractor positions with higher hourly rates, schedule flexibility, and tax advantages.',
    ctaLabel: 'Browse All 1099 Jobs',
    ctaHref: '/jobs/1099',
  },
  {
    folder: 'addiction',
    image: 'hero_wc_addiction.png',
    bgColor: '#f3e8d9',
    alt: 'PMHNP addiction medicine practice',
    h1Line1: 'Addiction PMHNP',
    h1Line2: 'Jobs',
    subtitle: 'Substance use disorder and MAT positions with high demand, competitive pay, and life-changing patient impact.',
    ctaLabel: 'Browse All Addiction Jobs',
    ctaHref: '/jobs/addiction',
  },
  {
    folder: 'behavioral-health',
    image: 'hero_wc_behavioralhealth.png',
    bgColor: '#fefffe',
    alt: 'Behavioral health nurse practitioner setting',
    h1Line1: 'Behavioral Health',
    h1Line2: 'NP Jobs',
    subtitle: 'Psychiatric and mental health positions across inpatient, outpatient, telehealth, and community settings.',
    ctaLabel: 'Browse All BH Jobs',
    ctaHref: '/jobs/behavioral-health',
  },
  {
    folder: 'correctional',
    image: 'hero_wc_correctional.png',
    bgColor: '#fcfcfc',
    alt: 'Correctional PMHNP forensic practice',
    h1Line1: 'Correctional PMHNP',
    h1Line2: 'Jobs',
    subtitle: 'Forensic psychiatric positions with premium pay, high autonomy, and federal loan forgiveness eligibility.',
    ctaLabel: 'Browse All Correctional Jobs',
    ctaHref: '/jobs/correctional',
  },
  {
    folder: 'locum-tenens',
    image: 'hero_wc_locumtenens.png',
    bgColor: '#fefefe',
    alt: 'Locum tenens travel PMHNP assignment',
    h1Line1: 'Locum Tenens',
    h1Line2: 'PMHNP Jobs',
    subtitle: 'Travel assignments with premium hourly rates, housing stipends, and schedule flexibility.',
    ctaLabel: 'Browse All Locum Jobs',
    ctaHref: '/jobs/locum-tenens',
  },
  {
    folder: 'outpatient',
    image: 'hero_wc_outpatient.png',
    bgColor: '#f6faf7',
    alt: 'Outpatient PMHNP clinic setting',
    h1Line1: 'Outpatient PMHNP',
    h1Line2: 'Jobs',
    subtitle: 'Clinic and private practice positions with M-F schedules and long-term patient relationships.',
    ctaLabel: 'Browse All Outpatient Jobs',
    ctaHref: '/jobs/outpatient',
  },
  {
    folder: 'per-diem',
    image: 'hero_wc_perdiem.png',
    bgColor: '#fafcf4',
    alt: 'Per diem PMHNP flexible scheduling',
    h1Line1: 'Per Diem PMHNP',
    h1Line2: 'Jobs',
    subtitle: 'PRN and part-time positions with flexible scheduling, higher hourly rates, and no long-term commitments.',
    ctaLabel: 'Browse All Per Diem Jobs',
    ctaHref: '/jobs/per-diem',
  },
  {
    folder: 'telehealth',
    image: 'hero_wc_telehealth.png',
    bgColor: '#f8f6ee',
    alt: 'Telehealth PMHNP virtual practice',
    h1Line1: 'Telehealth PMHNP',
    h1Line2: 'Jobs',
    subtitle: 'Virtual psychiatric care positions with flexible hours, no commute, and multi-state practice opportunities.',
    ctaLabel: 'Browse All Telehealth Jobs',
    ctaHref: '/jobs/telehealth',
  },
  {
    folder: 'va',
    image: 'hero_wc_va.png',
    bgColor: '#d7dde0',
    alt: 'VA PMHNP Veterans Affairs medical center',
    h1Line1: 'VA PMHNP',
    h1Line2: 'Jobs',
    subtitle: 'Federal benefits, EDRP loan repayment up to $200K, pension, and full practice authority nationwide.',
    ctaLabel: 'Browse All VA Jobs',
    ctaHref: '/jobs/va',
  },
];

function buildHeroSection(p, statsAccess) {
  return `{/* ═══ HERO ═══ */}
      <section style={{ background: '${p.bgColor}', padding: '72px 0 56px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px' }}>
          <div className="cat-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#134E4A', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>
                {${statsAccess}.totalJobs}+ Open Positions
              </p>
              <h1 className="font-lora" style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, lineHeight: 1.08, color: '#1A2E35', margin: '0 0 20px' }}>
                ${p.h1Line1}<br />
                <span style={{ color: '#0D9488' }}>${p.h1Line2}</span>
              </h1>
              <p style={{ fontSize: '16px', color: '#3D2E26', lineHeight: 1.7, margin: '0 0 36px', maxWidth: '440px', fontWeight: 400 }}>
                ${p.subtitle}
              </p>
              <Link href="${p.ctaHref}" className="clay-btn cat-cta-primary" style={{
                padding: '16px 40px', borderRadius: '16px', fontWeight: 700, fontSize: '15px',
                background: '#0D9488', color: '#fff', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                boxShadow: '4px 4px 14px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.2)',
              }}>
                ${p.ctaLabel} <ArrowRight size={17} />
              </Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Image src="/images/categories/${p.image}" alt="${p.alt}" width={520} height={520} style={{ width: '100%', maxWidth: '500px', height: 'auto' }} priority />
            </div>
          </div>
        </div>
      </section>`;
}

let updated = 0;
let skipped = 0;

PAGES.forEach(p => {
  const filePath = path.join(__dirname, '..', 'app', 'jobs', p.folder, 'page.tsx');
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (no file): ${p.folder}`);
    skipped++;
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // Check if already migrated
  if (content.includes('hero_wc_')) {
    console.log(`SKIP (already has hero_wc_): ${p.folder}`);
    skipped++;
    return;
  }

  // 1. Add Image import if missing
  if (!content.includes("from 'next/image'")) {
    content = content.replace(
      "import Link from 'next/link';",
      "import Link from 'next/link';\nimport Image from 'next/image';"
    );
  }

  // 2. Add ArrowRight to lucide imports if missing
  if (!content.includes('ArrowRight')) {
    content = content.replace(
      /} from 'lucide-react';/,
      ", ArrowRight } from 'lucide-react';"
    );
  }

  // 3. Find the hero section and replace it
  // Pattern: from "Hero" comment + section with bg-teal/bg-blue/bg-indigo to closing </section>
  const heroPatterns = [
    // Match: {/* Hero Section */} or {/* Hero */} followed by <section className="bg-...
    /\{\/\*\s*Hero\s*(?:Section)?\s*\*\/\}\s*\n\s*<section\s+className="bg-(?:teal|blue|indigo)-\d+[^]*?<\/section>/,
    // Match with comment on same line
    /\{\/\*\s*Hero\s*\*\/\}\s*\n\s*<section\s+className="bg-(?:teal|blue|indigo)-\d+[^]*?<\/section>/,
  ];

  let replaced = false;
  for (const pattern of heroPatterns) {
    if (pattern.test(content)) {
      // Determine stats variable name
      let statsAccess = 'stats';
      content = content.replace(pattern, buildHeroSection(p, statsAccess));
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    // Try without the comment, just matching the section
    const sectionPattern = /<section\s+className="bg-(?:teal|blue|indigo)-\d+\s+text-white\s+py-12[^]*?<\/section>/;
    if (sectionPattern.test(content)) {
      let statsAccess = 'stats';
      content = content.replace(sectionPattern, buildHeroSection(p, statsAccess));
      replaced = true;
    }
  }

  if (!replaced) {
    console.log(`WARN (no hero pattern found): ${p.folder}`);
    skipped++;
    return;
  }

  // Add responsive CSS if not present
  if (!content.includes('.cat-hero-grid')) {
    // Find the closing style tag or add before the last </div>
    const styleBlock = `
      {/* ═══ Responsive + Hover CSS ═══ */}
      <style>{\`
        .cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        @media (max-width: 768px) {
          .cat-hero-grid { grid-template-columns: 1fr !important; }
        }
      \`}</style>`;
    
    // Insert before the final closing </div> of the component
    const lastDivClose = content.lastIndexOf('</div>');
    if (lastDivClose > -1) {
      // Find the second to last closing div (the one before the final wrapper)
      const secondLastDiv = content.lastIndexOf('</div>', lastDivClose - 1);
      if (secondLastDiv > -1) {
        content = content.slice(0, secondLastDiv) + styleBlock + '\n' + content.slice(secondLastDiv);
      }
    }
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✅ MIGRATED: ${p.folder} (bg: ${p.bgColor})`);
  updated++;
});

console.log(`\nDone: ${updated} migrated, ${skipped} skipped`);
