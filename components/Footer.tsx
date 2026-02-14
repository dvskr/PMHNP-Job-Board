'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Twitter, Facebook, Instagram, Linkedin, Youtube } from 'lucide-react';

const linkColumns = [
  {
    title: 'For Job Seekers',
    links: [
      { label: 'Browse Jobs', href: '/jobs' },
      { label: 'Saved Jobs', href: '/saved' },
      { label: 'Job Alerts', href: '/job-alerts' },
      { label: 'Resources', href: '/resources' },
    ],
  },
  {
    title: 'For Employers',
    links: [
      { label: 'Post a Job', href: '/post-job' },
      { label: 'Employer Login', href: '/employer/login' },
      { label: 'Pricing', href: '/post-job' },
      { label: 'Why PMHNP Hiring', href: '/for-employers' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Salary Guide', href: '/salary-guide' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    title: 'Quick Links',
    links: [
      { label: 'Remote Jobs', href: '/jobs/remote' },
      { label: 'Telehealth', href: '/jobs/telehealth' },
      { label: 'Travel Jobs', href: '/jobs/travel' },
      { label: 'New Grad', href: '/jobs/new-grad' },
      { label: 'Per Diem', href: '/jobs/per-diem' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

const socialLinks = [
  { icon: Twitter, href: 'https://x.com/pmhnphiring', label: 'X' },
  { icon: Facebook, href: 'https://www.facebook.com/profile.php?id=61586136316931', label: 'Facebook' },
  { icon: Instagram, href: 'https://www.instagram.com/pmhnphiring', label: 'Instagram' },
  { icon: Linkedin, href: 'https://www.linkedin.com/company/pmhnp-hiring', label: 'LinkedIn' },
  { icon: Youtube, href: 'https://www.youtube.com/@pmhnphiring', label: 'YouTube' },
];

export default function Footer() {
  const pathname = usePathname();
  const isHomepage = pathname === '/';

  const socialRowClass = isHomepage ? 'footer-social-homepage' : '';

  return (
    <footer style={{
      backgroundColor: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-color)',
    }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px 0' }}>

        {/* Link columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '24px',
          marginBottom: '28px',
        }}>
          {linkColumns.map((col) => (
            <div key={col.title}>
              <h4 style={{
                fontSize: '14px', fontWeight: 700,
                color: 'var(--text-primary)', margin: '0 0 14px',
                whiteSpace: 'nowrap',
              }}>
                {col.title}
              </h4>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="footer-link"
                      style={{
                        fontSize: '13px', fontWeight: 500,
                        color: 'var(--text-secondary)',
                        textDecoration: 'none', whiteSpace: 'nowrap',
                        transition: 'color 0.2s',
                      }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Social media icons row — hidden on homepage desktop (floating icons visible) */}
        <style>{`
          @media (min-width: 768px) {
            .footer-social-homepage { display: none !important; }
          }
        `}</style>
        <div className={socialRowClass} style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: '20px', padding: '16px 0',
          borderTop: '1px solid var(--border-color)',
        }}>
          {socialLinks.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="footer-social-icon"
                style={{
                  color: 'var(--text-tertiary)',
                  transition: 'color 0.2s, transform 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
              </a>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div className="footer-bottom-bar" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 0', borderTop: '1px solid var(--border-color)',
          flexWrap: 'wrap', gap: '12px',
        }}>
          {/* Left: logo + tagline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
              <Image
                src="/logo.png"
                alt="PMHNP Hiring"
                width={32}
                height={32}
                style={{ width: '32px', height: '32px', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.4))' }}
              />
            </Link>
            <span style={{
              fontSize: '13px', fontWeight: 500,
              color: 'var(--text-secondary)',
              borderLeft: '1px solid var(--border-color)',
              paddingLeft: '8px', marginLeft: '2px',
            }}>
              The #1 job board for psychiatric NPs
            </span>
          </div>

          {/* Right: copyright */}
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-tertiary)', margin: 0 }}>
            © {new Date().getFullYear()} PMHNP Hiring
          </p>
        </div>
      </div>

      {/* Responsive + hover */}
      <style>{`
        .footer-link:hover {
          color: var(--color-primary) !important;
        }
        .footer-social-icon:hover {
          color: var(--color-primary) !important;
          transform: translateY(-2px);
        }
        @media (max-width: 768px) {
          footer > div > div:first-child {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          footer > div > div:first-child {
            grid-template-columns: 1fr !important;
          }
          .footer-bottom-bar {
            flex-direction: column !important;
            justify-content: center !important;
            align-items: center !important;
            text-align: center;
            gap: 8px !important;
          }
        }
      `}</style>
    </footer>
  );
}
