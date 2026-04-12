'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
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

  const navLinks = [
    { href: '/jobs', label: 'Find Jobs' },
    { href: '/salary-guide', label: 'Salary Guide' },
    { href: '/for-employers', label: 'Employers' },
    { href: '/resources', label: 'Resources' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

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
          backgroundColor: '#1c1917',
          borderColor: scrolled ? 'rgba(255,255,255,0.08)' : 'transparent',
        }}
        suppressHydrationWarning
      >
        <div className="w-full max-w-[1440px] mx-auto px-8 xl:px-12 h-full flex items-center justify-between">

          {/* ═══ LEFT: Logo ═══ */}
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 -ml-2 transition-colors rounded-lg"
              style={{ color: '#CBD5E1' }}
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
                  color: '#FFFFFF',
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
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="nav-link-hover px-4 py-2 text-[15px] font-medium transition-colors rounded-lg"
                  style={{
                    color: isActive(link.href) ? '#2DD4BF' : '#CBD5E1',
                    fontWeight: isActive(link.href) ? 600 : 500,
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Divider */}
            <div className="w-px h-5 mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />

            {/* Auth */}
            <HeaderAuth onNavigate={() => setIsMenuOpen(false)} />
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
              style={{ backgroundColor: 'rgba(28, 25, 23, 0.98)' }}
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="relative px-8 pt-6 pb-8">
              <nav className="flex flex-col">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="py-4 text-lg font-medium transition-colors"
                    style={{
                      color: isActive(link.href) ? '#2DD4BF' : '#CBD5E1',
                      fontWeight: isActive(link.href) ? 600 : 500,
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <HeaderAuth onNavigate={() => setIsMenuOpen(false)} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
