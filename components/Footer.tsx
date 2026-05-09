'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { XLogo, FacebookLogo, InstagramLogo, LinkedinLogo, YoutubeLogo } from '@phosphor-icons/react';
import { reopenConsentBanner } from '@/lib/consent';
import { brand } from '@/config/brand';
/* ──────────────────────────────────────────────
 *  Footer — Dark, clean, professional
 *  Uses inline styles for background/color to
 *  bypass Tailwind compilation issues.
 * ────────────────────────────────────────────── */

const linkColumns = [
  {
    title: 'For Job Seekers',
    links: [
      { label: 'Browse Jobs', href: '/jobs' },
      { label: 'Saved Jobs', href: '/saved' },
      { label: 'Job Alerts', href: '/job-alerts' },
      { label: 'Salary Guide', href: '/salary-guide' },
      { label: 'Post a Job', href: '/post-job' },
    ],
  },
  {
    title: 'Categories',
    links: [
      { label: 'Remote', href: '/jobs/remote' },
      { label: 'Telehealth', href: '/jobs/telehealth' },
      { label: 'Inpatient', href: '/jobs/inpatient' },
      { label: 'Outpatient', href: '/jobs/outpatient' },
      { label: 'New Grad', href: '/jobs/new-grad' },
      { label: 'Travel', href: '/jobs/travel' },
    ],
  },
  {
    title: 'Locations',
    links: [
      { label: 'New York', href: '/jobs/state/new-york' },
      { label: 'California', href: '/jobs/state/california' },
      { label: 'Florida', href: '/jobs/state/florida' },
      { label: 'Texas', href: '/jobs/state/texas' },
      { label: 'Massachusetts', href: '/jobs/state/massachusetts' },
      { label: 'All States', href: '/jobs/locations' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Salary Guide', href: '/salary-guide' },
      { label: 'New Grad Hub', href: '/new-grad' },
      { label: 'For Employers', href: '/for-employers' },
      { label: 'FAQ', href: '/faq' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
];

const columnTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'var(--font-lora), Georgia, serif',
  color: '#ffffff',
  marginBottom: '20px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
};

const linkStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#a8a29e',
  textDecoration: 'none',
  display: 'block',
  paddingTop: '4px',
  paddingBottom: '4px',
  transition: 'color 0.15s ease',
};

export default function Footer() {
  const pathname = usePathname();
  const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password', '/employer/login', '/employer/signup'];
  if (AUTH_ROUTES.some(r => pathname?.startsWith(r))) return null;

  return (
    <>

      {/* ── Footer ── */}
      <footer
        style={{
          backgroundColor: '#1c1917',
          color: '#e7e5e4',
          paddingBottom: '20px',
        }}
        aria-label="Site footer"
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 20px',
          }}
        >
          {/* Main grid (Links only) */}
          <div
            className="footer-link-grid"
            style={{
              display: 'grid',
              gap: '32px 28px',
              paddingTop: '48px',
              paddingBottom: '48px',
              alignItems: 'start',
            }}
          >

            {/* Link columns.
                SEO Fix M12: <h4> with no preceding <h2>/<h3> in the footer
                landmark broke heading order. Bumped to <h3> and wrapped the
                column links in <nav aria-label> so the relationship is
                exposed in the accessibility tree. */}
            {linkColumns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h3 style={columnTitleStyle}>{col.title}</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {col.links.map((link) => {
                    const isExternal = link.href.startsWith('http');
                    if (isExternal) {
                      return (
                        <li key={link.href + link.label}>
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={linkStyle}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#a8a29e'; }}
                          >
                            {link.label}
                          </a>
                        </li>
                      );
                    }
                    return (
                      <li key={link.href + link.label}>
                        <Link
                          href={link.href}
                          style={linkStyle}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#a8a29e'; }}
                        >
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </div>

          {/* ── Bottom area: legal sub-row + 3-cell brand row.
              Split into two rows so 7 legal links + 5 social icons +
              company info don't fight for one cramped flex row (which
              was producing the wrapped "Sub-\nprocessors" / "Data\nRequest"
              breaks). ── */}

          {/* Sub-row 1: Legal links centered */}
          <nav
            className="footer-legal-row"
            aria-label="Legal"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              padding: '20px 0 16px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Link href="/privacy" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
            >Privacy</Link>
            <Link href="/terms" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
            >Terms</Link>
            <Link href="/security" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
            >Security</Link>
            <Link href="/sub-processors" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
            >Sub-processors</Link>
            <Link href="/data-request" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
            >Data Request</Link>
            <Link href="/do-not-sell" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
            >Do Not Sell or Share</Link>
            <button
              type="button"
              onClick={reopenConsentBanner}
              style={{
                fontSize: '13px', color: '#78716c', background: 'none', border: 'none',
                padding: 0, cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
            >Cookie Settings</button>
          </nav>

          {/* Sub-row 2: Logo+tagline | Socials | Copyright — 3-cell flex */}
          <div
            className="footer-bottom-bar"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0 24px',
              gap: '16px',
            }}
          >
            {/* Left: Logo + Name + Tagline */}
            <div className="footer-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                <img src="/logo.png" alt="PMHNP Hiring" width="36" height="36" loading="lazy" decoding="async" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                <span className="font-heading" style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginLeft: '-4px', whiteSpace: 'nowrap' }}>
                  PMHNP Hiring
                </span>
              </Link>
              <span className="footer-pipe" style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />
              <p className="footer-tagline" style={{ fontSize: '13px', color: '#78716c', margin: 0, whiteSpace: 'nowrap' }}>
                The #1 specialized job board for psychiatric nurse practitioners.
              </p>
            </div>

            {/* Center: Social icons */}
            <div className="footer-bar-center" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>

              {/* Pebble Social Icons — organic shapes from hero */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {[
                  { icon: XLogo, href: 'https://x.com/pmhnphiring', label: 'X', color: '#6ee7b7', shape: '54% 46% 62% 38% / 49% 55% 45% 51%' },
                  { icon: FacebookLogo, href: 'https://www.facebook.com/pmhnphiring', label: 'Facebook', color: '#5eead4', shape: '61% 39% 45% 55% / 40% 62% 38% 60%' },
                  { icon: InstagramLogo, href: 'https://www.instagram.com/pmhnphiring', label: 'Instagram', color: '#67e8f9', shape: '42% 58% 55% 45% / 58% 42% 60% 40%' },
                  { icon: LinkedinLogo, href: 'https://www.linkedin.com/company/pmhnpjobs', label: 'LinkedIn', color: '#a5b4fc', shape: '67% 33% 48% 52% / 45% 58% 42% 55%' },
                  { icon: YoutubeLogo, href: 'https://www.youtube.com/@pmhnphiring', label: 'YouTube', color: '#c4b5fd', shape: '50% 50% 60% 40% / 55% 45% 52% 48%' },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 38,
                        height: 34,
                        background: `linear-gradient(145deg, ${s.color}cc, ${s.color}88)`,
                        borderRadius: s.shape,
                        boxShadow: 'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.08)',
                        transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px) scale(1.12)';
                        e.currentTarget.style.boxShadow = 'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.14)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = 'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.08)';
                      }}
                    >
                      <Icon size={16} weight="fill" style={{ color: 'rgba(51,65,85,0.7)' }} />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Right: Copyright + legal address.
                SEO Fix M15: surface the legal mailing address as a trust
                signal for E-E-A-T (a real LLC operates this site, with a
                real registered address). */}
            <div className="footer-bar-right" style={{ display: 'flex', alignItems: 'center' }}>
              <p style={{ fontSize: '13px', color: '#57534e', margin: 0, lineHeight: 1.6, textAlign: 'right' }}>
                © {new Date().getFullYear()} {brand.name} · operated by {brand.legal.entityName}
                <span className="footer-address-sep" style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
                <span style={{ whiteSpace: 'nowrap' }}>{brand.legal.addressLine}, {brand.legal.addressCity}, {brand.legal.addressRegion} {brand.legal.addressPostalCode}</span>
              </p>
            </div>
          </div>

          {/* Footer responsive styles */}
          <style jsx>{`
            @media (min-width: 769px) {
              .footer-link-grid {
                /* 4 equal-width columns inside a centered max-width track —
                   columns spread evenly across the visual area without
                   stretching edge-to-edge of the 1440px wrapper. */
                grid-template-columns: repeat(4, 1fr) !important;
                max-width: 1100px !important;
                margin: 0 auto !important;
                gap: 32px 40px !important;
                padding-top: 64px !important;
                padding-bottom: 64px !important;
              }
            }
            @media (max-width: 768px) {
              .footer-link-grid {
                grid-template-columns: repeat(2, 1fr) !important;
              }
              .footer-bottom-bar {
                flex-direction: column !important;
                align-items: flex-start !important;
              }
              .footer-bar-left {
                flex-wrap: wrap !important;
              }
              .footer-bar-right {
                flex-wrap: wrap !important;
              }
              .footer-pipe {
                display: none !important;
              }
              .footer-tagline {
                white-space: normal !important;
              }
            }
            @media (max-width: 480px) {
              .footer-link-grid {
                grid-template-columns: 1fr !important;
                gap: 28px !important;
              }
            }
          `}</style>
        </div>
      </footer>
    </>
  );
}
