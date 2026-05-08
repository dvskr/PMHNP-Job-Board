'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, LayoutDashboard, Briefcase, MessageSquare, Settings, DollarSign, Building2, BookOpen, Search, HelpCircle, Info, Mail, PenSquare, GraduationCap, UserCheck, Users, Bookmark, FileText, Activity, Workflow, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
// SEO Fix H5: use LazyMotion + the lightweight `m` namespace instead of the
// full `motion` import. Header renders on every page, so importing the full
// framer-motion namespace bloats every page's JS bundle. LazyMotion ships
// only the animation features used and is the recommended pattern (matches
// HomepageHero.tsx).
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import HeaderAuth from '@/components/auth/HeaderAuth';

/*
 * Header — Floating claymorphic navbar.
 * Warm diorama palette, pill-shaped, centered nav items.
 */

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  useEffect(() => {
    setIsMenuOpen(false);
    document.body.style.overflow = '';
  }, [pathname]);

  // Public nav — shown when NOT logged in
  const publicNavLinks = [
    { href: '/jobs', label: 'Browse Jobs', icon: Search },
    { href: '/salary-guide', label: 'Salary Guide', icon: DollarSign },
    { href: '/for-employers', label: 'Employers', icon: Building2 },
    { href: '/resources', label: 'Resources', icon: BookOpen },
  ];

  // Logged-in job seeker nav — high-frequency destinations only.
  // Settings is accessible from the avatar dropdown; freeing the slot for
  // Saved (a daily quick-check action) is the better UX trade.
  const seekerNavLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/jobs', label: 'Browse Jobs', icon: Briefcase },
    { href: '/saved', label: 'Saved', icon: Bookmark },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
  ];

  // Logged-in employer nav — high-frequency destinations only.
  // Applicants gets its own dedicated route (not a dashboard tab) so the
  // nav navigation feels like a destination, not a tab switch inside the
  // dashboard. The dashboard still has an Applicants tab for in-context
  // viewing alongside other dashboard data.
  const employerNavLinks = [
    { href: '/employer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/employer/candidates', label: 'Talent Pool', icon: Users },
    { href: '/employer/applicants', label: 'Applicants', icon: FileText },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
  ];

  // Logged-in admin nav — admin-specific surfaces beat the public Browse
  // Jobs / Messages defaults that admins rarely use day-to-day.
  const adminNavLinks = [
    { href: '/admin', label: 'Admin', icon: LayoutDashboard },
    { href: '/admin/jobs', label: 'Jobs', icon: Briefcase },
    { href: '/admin/outreach', label: 'Outreach', icon: Activity },
    { href: '/admin/pipeline', label: 'Pipeline', icon: Workflow },
  ];

  // Mobile-only extra links for public users (pages not in top nav)
  const mobileExtraLinks = [
    { href: '/for-job-seekers', label: 'For Job Seekers', icon: UserCheck },
    { href: '/new-grad', label: 'New Grad Guide', icon: GraduationCap },
    { href: '/blog', label: 'Blog', icon: PenSquare },
    { href: '/faq', label: 'FAQ', icon: HelpCircle },
    { href: '/about', label: 'About', icon: Info },
    { href: '/contact', label: 'Contact', icon: Mail },
  ];

  // Pick the right nav set
  const navLinks = userRole === 'job_seeker'
    ? seekerNavLinks
    : userRole === 'employer'
      ? employerNavLinks
      : userRole === 'admin'
        ? adminNavLinks
        : publicNavLinks;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  // Hide header on auth pages — they have their own branding
  const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password', '/employer/login', '/employer/signup'];
  if (AUTH_ROUTES.some(r => pathname?.startsWith(r))) return null;

  return (
    <LazyMotion features={domAnimation}>
      {/* Spacer */}
      <div style={{ height: 84 }} />

      {/* Floating navbar wrapper */}
      <div
        className="fixed top-0 left-0 right-0 z-[100]"
        style={{
          padding: '12px 16px 0',
          pointerEvents: 'none',
        }}
      >
        <header
          className="transition-all duration-300"
          style={{
            // Responsive cap — held at 1360px on viewports ≤ ~1448px (no
            // change vs. the previous fixed value), then scales with the
            // viewport up to a ceiling of 1680px on very wide screens.
            // Wrapper padding (16px each side) still bounds it on narrow.
            maxWidth: 'clamp(1360px, 94vw, 1680px)',
            margin: '0 auto',
            height: 64,
            borderRadius: '18px',
            backgroundColor: '#F5F0EB',
            border: '1px solid rgba(255,255,255,0.65)',
            boxShadow: scrolled
              ? '0 8px 32px rgba(90,74,66,0.12), 0 2px 8px rgba(90,74,66,0.06), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.02)'
              : '0 4px 20px rgba(90,74,66,0.08), 0 1px 4px rgba(90,74,66,0.04), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '12px',
            paddingRight: '12px',
            pointerEvents: 'auto',
            transition: 'box-shadow 0.3s ease, transform 0.3s ease',
          }}
          suppressHydrationWarning
        >
          {/* ═══ LEFT: Logo ═══ */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile hamburger.
                SEO Fix M8: padding bumped 7px → 12px so the button hits a
                44×44px tap target (Apple HIG / Google ≥48 informal).
                With the 20px icon: 12px*2 + 20 = 44px. */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden transition-all"
              style={{
                padding: '12px',
                borderRadius: '10px',
                color: '#5A4A42',
                backgroundColor: '#EDE7E0',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '3px 3px 8px rgba(90,74,66,0.08), -2px -2px 5px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
                cursor: 'pointer',
              }}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>

            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              {/* SEO Fix L8: next/image automatically picks the right format
                  (avif/webp), generates a srcset, and sets fetchpriority on
                  the LCP-relevant header logo. priority=true since this is
                  above the fold on every page. */}
              <Image
                src="/logo.png"
                alt="PMHNP Hiring"
                width={56}
                height={56}
                priority
                style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }}
              />
              <span
                className="font-heading hidden sm:inline"
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#3D2E24',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                  marginLeft: '-6px',
                }}
              >
                PMHNP{' '}
                <span style={{ fontStyle: 'italic', color: '#0D9488', fontWeight: 600 }}>Hiring</span>
              </span>
            </Link>
          </div>

          {/* ═══ CENTER: Nav ═══ */}
          <nav className="hidden lg:flex items-center justify-center flex-1 gap-1 mx-4">
            {navLinks.map((link) => {
              const NavIcon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="nav-pill-floating"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 16px',
                    borderRadius: '12px',
                    fontSize: '13.5px',
                    fontWeight: active ? 600 : 500,
                    color: active ? '#0D9488' : '#5A4A42',
                    backgroundColor: active ? 'rgba(13,148,136,0.10)' : 'transparent',
                    border: active
                      ? '1px solid rgba(13,148,136,0.15)'
                      : '1px solid transparent',
                    boxShadow: active
                      ? 'inset 1px 1px 3px rgba(13,148,136,0.06), 2px 2px 6px rgba(13,148,136,0.06)'
                      : 'none',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = '#EDE7E0';
                      e.currentTarget.style.color = '#5A4A42';
                      e.currentTarget.style.border = '1px solid rgba(255,255,255,0.5)';
                      e.currentTarget.style.boxShadow = '3px 3px 8px rgba(90,74,66,0.10), -2px -2px 5px rgba(255,255,255,0.7), inset 1px 1px 3px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#5A4A42';
                      e.currentTarget.style.border = '1px solid transparent';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <NavIcon size={15} style={{ opacity: 0.85 }} />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* ═══ RIGHT: Auth ═══ */}
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            {userRole === 'employer' && <PostJobCTA />}
            <HeaderAuth onRoleChange={(role) => setUserRole(role)} />
          </div>

          {/* Mobile right side - just auth (hamburger is on left) */}
          <div className="lg:hidden flex items-center gap-2 ml-auto">
            {userRole === 'employer' && <PostJobCTA mobile />}
            <HeaderAuth onRoleChange={(role) => setUserRole(role)} />
          </div>
        </header>
      </div>

      {/* ═══ Mobile Menu ═══ */}
      <AnimatePresence>
        {isMenuOpen && (
          <m.div
            id="mobile-nav-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[99] lg:hidden"
            style={{ top: 80 }}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(245, 240, 235, 0.98)' }}
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="relative px-6 pt-4 pb-8">
              <nav className="flex flex-col">
                {navLinks.map((link) => {
                  const MobileIcon = link.icon;
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMenuOpen(false)}
                      style={{
                        padding: '14px 16px',
                        fontSize: '16px',
                        fontWeight: active ? 600 : 500,
                        color: active ? '#0D9488' : '#5A4A42',
                        backgroundColor: active ? 'rgba(13,148,136,0.08)' : 'transparent',
                        borderRadius: '14px',
                        marginBottom: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textDecoration: 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      <MobileIcon size={20} style={{ opacity: 0.75 }} />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Extra links for public mobile users */}
              {!userRole && (
                <div className="mt-3 pt-4" style={{ borderTop: '1px solid rgba(90,74,66,0.08)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-4" style={{ color: '#A89890' }}>More</p>
                  <nav className="flex flex-col">
                    {mobileExtraLinks.map((link) => {
                      const ExtraIcon = link.icon;
                      const active = isActive(link.href);
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setIsMenuOpen(false)}
                          style={{
                            padding: '12px 16px',
                            fontSize: '15px',
                            fontWeight: active ? 600 : 400,
                            color: active ? '#0D9488' : '#7A6A62',
                            backgroundColor: active ? 'rgba(13,148,136,0.06)' : 'transparent',
                            borderRadius: '12px',
                            marginBottom: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            textDecoration: 'none',
                            transition: 'all 0.15s',
                          }}
                        >
                          <ExtraIcon size={18} style={{ opacity: 0.65 }} />
                          {link.label}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              )}
              <div className="mt-6 pt-5 px-4" style={{ borderTop: '1px solid rgba(90,74,66,0.08)' }}>
                <HeaderAuth onNavigate={() => setIsMenuOpen(false)} onRoleChange={(role) => setUserRole(role)} />
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Floating nav hover styles */}
      <style>{`
        .nav-pill-floating:active {
          transform: translateY(0) scale(0.98) !important;
        }
      `}</style>
    </LazyMotion>
  );
}

/**
 * Primary employer CTA — `+ Post Job`. Filled-pill, branded primary color,
 * visually distinct from the ghost-style nav pills next to it. Surfaces the
 * employer's #1 money action from every page in one tap.
 */
function PostJobCTA({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link
      href="/post-job"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: mobile ? '7px 12px' : '8px 16px',
        borderRadius: '12px',
        fontSize: mobile ? '13px' : '13.5px',
        fontWeight: 700,
        color: '#FFFFFF',
        background: 'linear-gradient(135deg, #0D9488, #0F766E)',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 2px 8px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(13,148,136,0.35), inset 0 1px 0 rgba(255,255,255,0.25)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.2)';
      }}
      aria-label="Post a new job"
    >
      <Plus size={mobile ? 14 : 15} strokeWidth={2.5} />
      {mobile ? 'Post' : 'Post Job'}
    </Link>
  );
}
