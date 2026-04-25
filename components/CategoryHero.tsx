import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   CategoryHero — Layout 5: Oversized type / asymmetric collage
   Fonts: Lora (heading), Inter (body/ui)
   Design reference: heroes.jsx → Hero5
   ═══════════════════════════════════════════════════════════════ */

interface CategoryHeroProps {
  /** Category background color (from the watercolor asset) */
  bgColor: string;
  /** Watercolor hero image path */
  heroImage: string;
  /** Alt text for the hero image */
  heroAlt: string;
  /** Live badge text, e.g. "395 live roles · updated 4 min ago" */
  badgeText: string;
  /** Breadcrumb trail labels */
  breadcrumbs: string[];
  /** Category index label, e.g. "№ 04 / 26" */
  indexLabel?: string;
  /** Line 1 of the oversized heading */
  headlineLine1: string;
  /** Line 2 of the oversized heading */
  headlineLine2: string;
  /** Italic sub-line below the big type */
  headlineSub: string;
  /** Floating tag on the photo — bold title */
  photoTagTitle?: string;
  /** Floating tag on the photo — body text */
  photoTagBody?: string;
  /** Stats array for the footer row */
  stats: { value: string; label: string }[];
  /** Description paragraph */
  description: string;
  /** Primary CTA */
  ctaLabel: string;
  ctaHref: string;
  /** Secondary CTA */
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
}

/**
 * Determines if a hex color is "dark" (luminance < 0.5).
 */
function isDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

export default function CategoryHero({
  bgColor,
  heroImage,
  heroAlt,
  badgeText,
  breadcrumbs,
  indexLabel,
  headlineLine1,
  headlineLine2,
  headlineSub,
  photoTagTitle,
  photoTagBody,
  stats,
  description,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: CategoryHeroProps) {
  // Asymmetric coloring: cream bg, category color on photo + decorative circle
  const ink       = '#1f1a17';
  const inkSoft   = '#3d342d';
  const rule      = 'rgba(31,26,23,.16)';
  const teal      = '#0D9488';
  const tealDeep  = '#0f766e';

  return (
    <section className="cath5" style={{ background: '#faf6ef', padding: '48px 56px 0', position: 'relative', overflow: 'hidden' }}>
      {/* ── Decorative swatch circles ── */}
      <div className="cath5-swatch" />

      <div style={{ position: 'relative' }}>
        {/* ── STAGE: Oversized type + photo ── */}
        <div className="cath5-stage">
          <h1 className="cath5-h1">
            {headlineLine1}<br />
            {headlineLine2}
            <span className="cath5-h1-sub">
              <em>{headlineSub}</em>
            </span>
          </h1>
          <div className="cath5-photo">
            <Image
              src={heroImage}
              alt={heroAlt}
              width={560}
              height={560}
              priority
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
            />
          </div>
        </div>

        {/* ── FOOTER: Stats+Description left | CTAs under image ── */}
        <div className="cath5-footer">
          <div className="cath5-footer-left">
            <div className="cath5-stats">
              {stats.map((s, i) => (
                <div key={i}>
                  {s.value}
                  <small>{s.label}</small>
                </div>
              ))}
            </div>
            <p className="cath5-deck">{description}</p>
          </div>
          <div className="cath5-ctas">
            <Link href={ctaHref} className="cat-cta-primary" style={{
              padding: '14px 32px', borderRadius: '999px', fontWeight: 700, fontSize: '14px',
              background: '#0D9488', color: '#fff', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              boxShadow: '4px 4px 12px rgba(13,148,136,0.2)',
            }}>
              {ctaLabel} <ArrowRight size={16} />
            </Link>
            {secondaryCtaLabel && secondaryCtaHref && (
              <Link href={secondaryCtaHref} className="cat-cta-primary" style={{
                padding: '14px 28px', borderRadius: '999px', fontWeight: 700, fontSize: '14px',
                background: 'rgba(255,255,255,0.8)', color: '#1A2E35', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '4px 4px 12px rgba(0,0,0,0.06)',
                backdropFilter: 'blur(8px)',
              }}>
                {secondaryCtaLabel} <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Scoped styles — using CSS vars from the component ── */}
      <style>{`
        .cath5 {
          --ink: ${ink};
          --ink-soft: ${inkSoft};
          --rule: ${rule};
          --teal: ${teal};
          --teal-deep: ${tealDeep};
          --cat-color: ${bgColor};
        }

        /* ── Decorative swatch ── */
        .cath5-swatch {
          position: absolute; inset: 0; pointer-events: none;
        }
        .cath5-swatch::before {
          content: ""; position: absolute;
          left: -80px; top: -80px;
          width: 480px; height: 480px;
          border-radius: 50%;
          background: var(--cat-color);
          opacity: 0.35;
        }
        .cath5-swatch::after {
          content: ""; position: absolute;
          right: -100px; bottom: -140px;
          width: 380px; height: 380px;
          border-radius: 50%;
          background: #d8ebe4;
          opacity: 0.35;
        }

        /* ── Row 1 ── */
        .cath5-row1 {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          margin-bottom: 24px;
          font: 500 12px/1 'Inter', var(--font-inter), system-ui, sans-serif;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .cath5-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--pill-bg);
          padding: 8px 14px; border-radius: 999px;
          border: 1px solid var(--pill-border);
          font: 500 12px/1 'Inter', var(--font-inter), system-ui, sans-serif;
          color: var(--ink-soft);
          letter-spacing: .04em;
          text-transform: none;
        }
        .cath5-dot {
          width: 7px; height: 7px; border-radius: 99px;
          background: var(--teal);
          display: inline-block;
          animation: cath5-pulse 1.6s ease-in-out infinite;
        }
        @keyframes cath5-pulse {
          0%, 100% { opacity: .4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .cath5-crumbs {
          justify-self: center;
          display: flex; gap: 14px;
          color: var(--ink-soft);
          opacity: 0.7;
        }
        .cath5-crumbs span:not(:last-child)::after {
          content: "·"; margin-left: 14px;
        }
        .cath5-crumb-now { color: var(--ink) !important; opacity: 1; }
        .cath5-index {
          font: 500 12px/1 'Inter', var(--font-inter), monospace;
          letter-spacing: .1em;
          color: var(--ink-soft);
        }

        /* ── Stage ── */
        .cath5-stage {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 24px;
          align-items: end;
        }
        .cath5-h1 {
          font-family: var(--font-lora), 'Lora', Georgia, serif;
          font-weight: 700;
          font-size: clamp(72px, 12vw, 160px);
          line-height: .88;
          letter-spacing: -0.04em;
          margin: 0;
          color: var(--ink);
        }
        .cath5-h1-sub {
          display: block;
          font-family: var(--font-lora), 'Lora', Georgia, serif;
          font-style: italic;
          font-size: clamp(36px, 5.5vw, 72px);
          color: var(--teal);
          font-weight: 400;
          margin-top: -4px;
          letter-spacing: -0.02em;
        }
        .cath5-h1-sub em {
          font-family: var(--font-lora), 'Lora', Georgia, serif;
          font-style: italic;
          color: var(--teal);
        }
        .cath5-photo {
          position: relative;
          overflow: hidden;
          align-self: end;
          height: clamp(260px, 28vw, 380px);
          background: var(--cat-color);
        }
        .cath5-photo-tag {
          position: absolute;
          left: 16px; bottom: 16px;
          background: rgba(255,255,255,.92);
          padding: 10px 14px;
          border-radius: 10px;
          font: 500 12px/1.35 'Inter', var(--font-inter), sans-serif;
          color: #1f1a17;
          max-width: 220px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .cath5-photo-tag b {
          color: var(--teal);
          display: block;
          font-weight: 700;
          font-size: 12px;
          margin-bottom: 3px;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        /* ── Footer ── */
        .cath5-footer {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 24px;
          align-items: center;
          margin-top: 32px;
          padding: 24px 0 40px;
          border-top: 1px solid var(--rule);
        }
        .cath5-footer-left {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 36px;
          align-items: center;
        }
        .cath5-stats {
          display: flex; gap: 32px;
          font-family: var(--font-lora), 'Lora', Georgia, serif;
        }
        .cath5-stats > div {
          font-size: 22px;
          line-height: 1;
          font-weight: 600;
          color: var(--ink);
        }
        .cath5-stats > div small {
          display: block;
          font-family: 'Inter', var(--font-inter), sans-serif;
          font-size: 11px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-top: 6px;
          font-weight: 500;
        }
        .cath5-deck {
          font: 400 14px/1.55 'Inter', var(--font-inter), sans-serif;
          color: var(--ink-soft);
          max-width: 54ch;
          margin: 0;
        }
        .cath5-ctas {
          display: flex; gap: 10px;
          justify-content: center;
          align-self: center;
        }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .cath5 { padding: 32px 24px 0 !important; }
          .cath5-row1 { grid-template-columns: 1fr; gap: 12px; }
          .cath5-crumbs { justify-self: start; }
          .cath5-index { display: none; }
          .cath5-stage { grid-template-columns: 1fr; gap: 16px; }
          .cath5-h1 { font-size: clamp(56px, 15vw, 96px); }
          .cath5-h1-sub { font-size: clamp(28px, 7vw, 44px); }
          .cath5-photo { height: 240px; }
          .cath5-footer {
            grid-template-columns: 1fr;
            gap: 20px;
          }
          .cath5-stats { flex-wrap: wrap; gap: 20px; }
          .cath5-deck { justify-self: start; }
        }
      `}</style>
    </section>
  );
}
