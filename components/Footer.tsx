'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
      { label: 'New York', href: '/jobs/metro/new-york-ny' },
      { label: 'California', href: '/jobs/metro/los-angeles-ca' },
      { label: 'Florida', href: '/jobs/metro/jacksonville-fl' },
      { label: 'Texas', href: '/jobs/metro/dallas-tx' },
      { label: 'Massachusetts', href: '/jobs/state/massachusetts' },
      { label: 'All States', href: '/jobs/locations' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'New Grad Guide', href: '/new-grad' },
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

            {/* Link columns */}
            {linkColumns.map((col) => (
              <div key={col.title}>
                <h4 style={columnTitleStyle}>{col.title}</h4>
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
              </div>
            ))}
          </div>

          {/* ── Bottom bar: single row on desktop, vertical stack on mobile ── */}
          <div
            className="footer-bottom-bar"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px 0',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              gap: '16px',
            }}
          >
            {/* Left: Logo + Name + Tagline */}
            <div className="footer-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                <img src="/logo.png" alt="PMHNP Hiring" width="36" height="36" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                <span className="font-heading" style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginLeft: '-4px', whiteSpace: 'nowrap' }}>
                  PMHNP Hiring
                </span>
              </Link>
              <span className="footer-pipe" style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />
              <p className="footer-tagline" style={{ fontSize: '13px', color: '#78716c', margin: 0, whiteSpace: 'nowrap' }}>
                The #1 specialized job board for psychiatric nurse practitioners.
              </p>
            </div>

            {/* Right: Privacy · Terms | Socials | Copyright */}
            <div className="footer-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <Link href="/privacy" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
              >Privacy</Link>
              <Link href="/terms" style={{ fontSize: '13px', color: '#78716c', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
              >Terms</Link>

              <span className="footer-pipe" style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />

              {/* Social Icons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <a href="https://www.linkedin.com/company/pmhnphiring" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                  style={{ color: '#78716c', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
                ><svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
                <a href="https://x.com/pmhnphiring" target="_blank" rel="noopener noreferrer" aria-label="X"
                  style={{ color: '#78716c', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
                ><svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
                <a href="https://www.facebook.com/pmhnphiring" target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                  style={{ color: '#78716c', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
                ><svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
                <a href="https://www.youtube.com/@pmhnphiring" target="_blank" rel="noopener noreferrer" aria-label="YouTube"
                  style={{ color: '#78716c', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
                ><svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
                <a href="https://www.instagram.com/pmhnphiring" target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                  style={{ color: '#78716c', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#5eead4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#78716c'; }}
                ><svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>
              </div>

              <span className="footer-pipe" style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />

              <p style={{ fontSize: '13px', color: '#57534e', margin: 0, whiteSpace: 'nowrap' }}>
                © {new Date().getFullYear()} PMHNP Hiring
              </p>
            </div>
          </div>

          {/* Footer responsive styles */}
          <style jsx>{`
            @media (min-width: 769px) {
              .footer-link-grid {
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 48px 40px !important;
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
