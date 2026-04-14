'use client';

import Link from 'next/link';
import { Menu, X, LayoutDashboard, Briefcase, MessageSquare, Settings, DollarSign, Building2, BookOpen, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import HeaderAuth from '@/components/auth/HeaderAuth';

/*
 * Header — Linear-inspired, Lora branding.
 * Logo left ← gap → nav | divider | auth right.
 * Height: 72px. Container: full-width with generous padding.
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

  // Logged-in job seeker nav — minimal, app-focused
  const seekerNavLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/jobs', label: 'Browse Jobs', icon: Briefcase },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  // Logged-in employer nav — minimal, app-focused
  const employerNavLinks = [
    { href: '/employer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  // Pick the right nav set
  const navLinks = userRole === 'job_seeker'
    ? seekerNavLinks
    : userRole === 'employer'
      ? employerNavLinks
      : userRole === 'admin'
        ? [{ href: '/admin', label: 'Admin', icon: LayoutDashboard }, { href: '/messages', label: 'Messages', icon: MessageSquare }, { href: '/settings', label: 'Settings', icon: Settings }]
        : publicNavLinks;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  // Hide header on auth pages — they have their own branding
  const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password', '/employer/login', '/employer/signup'];
  if (AUTH_ROUTES.some(r => pathname?.startsWith(r))) return null;

  return (
    <>
      {/* Spacer */}
      <div style={{ height: 80 }} />

      <header
        className={[
          'fixed top-0 left-0 right-0 z-[100]',
          'flex items-center',
          'transition-all duration-300',
          scrolled
            ? 'border-b shadow-sm'
            : 'border-b border-transparent',
        ].join(' ')}
        style={{
          height: 80,
          backgroundColor: '#F7FBF8',
          borderColor: scrolled ? 'rgba(255,255,255,0.5)' : 'transparent',
          boxShadow: scrolled ? '0 6px 20px rgba(0,0,0,0.08), 0 -2px 8px rgba(255,255,255,0.9) inset, inset 0 -1px 0 rgba(255,255,255,0.6)' : 'none',
        }}
        suppressHydrationWarning
      >
        <div className="w-full max-w-[1440px] mx-auto px-8 xl:px-12 h-full flex items-center justify-between">

          {/* ═══ LEFT: Logo ═══ */}
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden transition-all"
              style={{
                padding: '8px',
                marginLeft: '-8px',
                borderRadius: '12px',
                color: '#374151',
                backgroundColor: '#EDF2EE',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                cursor: 'pointer',
              }}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              <img
                src="/logo.png"
                alt="PMHNP Hiring"
                width="100"
                height="100"
                style={{ width: 100, height: 100, objectFit: 'contain', flexShrink: 0 }}
              />
              <span
                className="font-heading"
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: '#1F2937',
                  letterSpacing: '-0.02em',
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                  transform: 'translateY(4px)',
                  marginLeft: '-24px',
                }}
              >
                PMHNP Hiring
              </span>
            </Link>
          </div>

          {/* ═══ RIGHT: Nav + Divider + Auth ═══ */}
          <div className="hidden lg:flex items-center gap-1">
            <nav className="flex items-center gap-2">
              {navLinks.map((link) => {
                const NavIcon = link.icon;
                return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="nav-link-clay"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '14px',
                    fontSize: '14px',
                    fontWeight: isActive(link.href) ? 600 : 500,
                    color: isActive(link.href) ? '#0D9488' : '#374151',
                    backgroundColor: isActive(link.href) ? '#D5F5F1' : 'transparent',
                    border: isActive(link.href) ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
                    boxShadow: isActive(link.href)
                      ? '4px 4px 10px rgba(13,148,136,0.10), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)'
                      : 'none',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    if (!isActive(link.href)) {
                      e.currentTarget.style.backgroundColor = '#E6FAF8';
                      e.currentTarget.style.color = '#0D9488';
                      e.currentTarget.style.border = '1px solid rgba(255,255,255,0.5)';
                      e.currentTarget.style.boxShadow = '4px 4px 10px rgba(13,148,136,0.10), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive(link.href)) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#374151';
                      e.currentTarget.style.border = '1px solid transparent';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <NavIcon size={16} />
                  {link.label}
                </Link>
                );
              })}
            </nav>

            {/* Divider */}
            <div className="w-px h-5 mx-3" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }} />

            {/* Auth */}
            <HeaderAuth onRoleChange={(role) => setUserRole(role)} />
          </div>
        </div>
      </header>

      {/* ═══ Mobile Menu ═══ */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[99] lg:hidden"
            style={{ top: 80 }}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(247, 251, 248, 0.98)' }}
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="relative px-8 pt-6 pb-8">
              <nav className="flex flex-col">
                {navLinks.map((link) => {
                  const MobileIcon = link.icon;
                  return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="py-4 text-lg font-medium transition-colors"
                    style={{
                      color: isActive(link.href) ? '#0D9488' : '#374151',
                      fontWeight: isActive(link.href) ? 600 : 500,
                      borderBottom: '1px solid rgba(0,0,0,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <MobileIcon size={20} />
                    {link.label}
                  </Link>
                  );
                })}
              </nav>
              <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <HeaderAuth onNavigate={() => setIsMenuOpen(false)} onRoleChange={(role) => setUserRole(role)} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
