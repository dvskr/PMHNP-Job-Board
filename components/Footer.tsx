'use client';

import Link from 'next/link';

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
  color: '#2D3748',
  marginBottom: '20px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
};

const linkStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#4A5568',
  textDecoration: 'none',
  display: 'block',
  paddingTop: '4px',
  paddingBottom: '4px',
  transition: 'color 0.15s ease',
};

export default function Footer() {
  return (
    <>
      {/* ── CTA Banner ── */}
      <section
        style={{
          textAlign: 'center',
          padding: '80px 24px',
          marginTop: '80px',
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)',
            fontWeight: 700,
            color: '#2D3748',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            margin: '0 0 16px',
          }}
        >
          Your next chapter starts here.
        </h2>
        <p
          style={{
            fontSize: '17px',
            color: '#718096',
            maxWidth: '520px',
            margin: '0 auto 32px',
            lineHeight: 1.6,
          }}
        >
          The only job board built exclusively for Psychiatric Mental Health
          Nurse Practitioners. Every listing verified.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            href="/jobs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 32px',
              backgroundColor: '#0D9488',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: 500,
              borderRadius: '999px',
              textDecoration: 'none',
              transition: 'background-color 0.15s ease',
            }}
          >
            Browse Jobs →
          </Link>
          <Link
            href="/post-job"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '12px 32px',
              backgroundColor: '#FFFFFF',
              color: '#2D3748',
              fontSize: '15px',
              fontWeight: 500,
              borderRadius: '999px',
              textDecoration: 'none',
              border: '1px solid #CBD5E0',
              transition: 'border-color 0.15s ease',
            }}
          >
            Post a Job
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          backgroundColor: '#E6EDEA',
          color: '#2D3748',
          paddingBottom: '20px',
        }}
        aria-label="Site footer"
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 32px',
          }}
        >
          {/* Main grid */}
          {/* Main grid (Links only) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '48px 40px',
              paddingTop: '64px',
              paddingBottom: '64px',
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
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#4A5568'; }}
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
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#4A5568'; }}
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

          {/* Centered Brand Block (Above Bottom Bar) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingBottom: '40px',
            }}
          >
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
                marginBottom: '12px',
              }}
            >
              <img
                src="/logo.png"
                alt="PMHNP Hiring"
                width="100"
                height="100"
                style={{
                  width: 100,
                  height: 100,
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
              />
              <span
                className="font-heading"
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: '#2D3748',
                  letterSpacing: '-0.02em',
                  whiteSpace: 'nowrap',
                  lineHeight: 1, 
                  transform: 'translateY(4px)',
                  marginLeft: '-24px', // Perfectly tight, backed off from overlapping the face
                }}
              >
                PMHNP Hiring
              </span>
            </Link>
            <p
              style={{
                fontSize: '15px',
                color: '#718096',
                margin: 0,
                textAlign: 'center',
              }}
            >
              The #1 specialized job board for psychiatric nurse practitioners.
            </p>
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px 0',
              borderTop: '1px solid rgba(13,148,136,0.15)',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', gap: '24px' }}>
              <Link
                href="/privacy"
                style={{ fontSize: '13px', color: '#4A5568', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#4A5568'; }}
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                style={{ fontSize: '13px', color: '#4A5568', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#4A5568'; }}
              >
                Terms
              </Link>
            </div>
            <p style={{ fontSize: '13px', color: '#718096', margin: 0 }}>
              © {new Date().getFullYear()} PMHNP Hiring. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
