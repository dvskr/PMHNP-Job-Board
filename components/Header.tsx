'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, Bookmark, Briefcase, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import Button from '@/components/ui/Button';
import HeaderAuth from '@/components/auth/HeaderAuth';
import { useTheme } from '@/components/ThemeProvider';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const isHomepage = pathname === '/';

  useEffect(() => {
    if (!isHomepage) {
      setScrolled(true);
      return;
    }
    const handleScroll = () => setScrolled(window.scrollY > 50);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHomepage]);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMenuOpen]);

  const showSolid = !isHomepage || scrolled;

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  /* ──── CSS injected once ──── */
  const css = `
    .nav-link {
      color: rgba(var(--text-primary-rgb, 255,255,255), 0.55);
      transition: all 0.25s ease;
      position: relative;
      text-decoration: none;
    }
    .nav-link:hover {
      color: rgba(var(--text-primary-rgb, 255,255,255), 0.9);
      background: rgba(var(--text-primary-rgb, 255,255,255), 0.05);
    }
    .nav-link.active {
      color: var(--text-primary);
    }
    .nav-link.active::after {
      content: '';
      position: absolute;
      bottom: 2px;
      left: 50%;
      transform: translateX(-50%);
      width: 16px;
      height: 2px;
      border-radius: 1px;
      background: var(--text-primary);
      opacity: 0.6;
    }
    .hdr-post-link {
      color: rgba(var(--text-primary-rgb, 255,255,255), 0.7);
      background: rgba(var(--text-primary-rgb, 255,255,255), 0.06);
      border: 1px solid rgba(var(--text-primary-rgb, 255,255,255), 0.1);
      transition: all 0.25s ease;
    }
    .hdr-post-link:hover {
      color: var(--text-primary);
      background: rgba(var(--text-primary-rgb, 255,255,255), 0.12);
      border-color: rgba(var(--text-primary-rgb, 255,255,255), 0.2);
    }
    .hdr-theme-btn {
      color: rgba(var(--text-primary-rgb, 255,255,255), 0.4);
      transition: all 0.3s ease;
      cursor: pointer;
    }
    .hdr-theme-btn:hover {
      color: rgba(var(--text-primary-rgb, 255,255,255), 0.8);
      transform: rotate(20deg);
    }
    .hdr-signin {
      transition: all 0.2s ease;
    }
    .hdr-signin:hover {
      color: var(--text-primary) !important;
      background: rgba(var(--text-primary-rgb, 255,255,255), 0.05);
    }
    .hdr-signup {
      transition: all 0.2s ease;
    }
    .hdr-signup:hover {
      background: rgba(var(--text-primary-rgb, 255,255,255), 0.15) !important;
      border-color: rgba(var(--text-primary-rgb, 255,255,255), 0.25) !important;
    }
  `;

  return (
    <>
      {/* Spacer so content below doesn't sit behind the floating nav */}
      <div style={{ height: '94px' }} />

      {/* Solid background strip behind the floating nav — prevents content bleed-through */}
      <div
        className="fixed top-0 left-0 right-0 z-40"
        style={{
          height: '108px',
          backgroundColor: 'var(--bg-primary)',
          pointerEvents: 'none',
        }}
      />

      <header
        className="fixed z-50"
        style={{
          top: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '1360px',
        }}
      >
        <style>{css}</style>
        <div
          className="nav-pill"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '18px',
            border: '1px solid var(--border-color)',
            borderBottom: '1px solid rgba(45, 212, 191, 0.25)',
            boxShadow: showSolid
              ? '0 4px 24px rgba(0,0,0,0.2), 0 0 40px rgba(45,212,191,0.06)'
              : '0 2px 16px rgba(0,0,0,0.1), 0 0 30px rgba(45,212,191,0.04)',
            padding: '0 clamp(12px, 3vw, 28px)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: '78px',
          }}>

            {/* ═══ Left: Logo ═══ */}
            <Link href="/" style={{
              display: 'flex', alignItems: 'center',
              flexShrink: 0, textDecoration: 'none',
            }}>
              <Image
                src="/logo.png"
                alt="PMHNP Hiring"
                width={200}
                height={200}
                priority
                unoptimized
                style={{
                  height: '72px', width: '72px', objectFit: 'contain',
                  filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.6)) drop-shadow(0 0 6px rgba(45,212,191,0.4))',
                  marginRight: '-14px',
                }}
              />
              <div style={{ lineHeight: 1.1, alignSelf: 'center', marginTop: '10px' }}>
                <div style={{
                  fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px',
                  color: 'var(--text-primary)',
                }}>PMHNP</div>
                <div style={{
                  fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px',
                  color: '#2DD4BF',
                  textTransform: 'uppercase' as const,
                  marginTop: '1px',
                }}>Hiring</div>
              </div>
            </Link>

            {/* ═══ Center: Nav links ═══ */}
            <nav className="hidden lg:flex items-center gap-1" style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            }}>
              <Link
                href="/jobs"
                className={`nav-link ${isActive('/jobs') ? 'active' : ''}`}
                style={{
                  padding: '8px 18px', borderRadius: '10px',
                  fontSize: '14px', fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Find Jobs
              </Link>
              <Link
                href="/saved"
                className={`nav-link ${isActive('/saved') ? 'active' : ''}`}
                style={{
                  padding: '8px 18px', borderRadius: '10px',
                  fontSize: '14px', fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                }}
              >
                <Bookmark size={14} /> Saved
              </Link>
              <Link
                href="/post-job"
                className="hdr-post-link"
                style={{
                  padding: '7px 16px', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 600,
                  textDecoration: 'none',
                  marginLeft: '6px',
                }}
              >
                Post a Job
              </Link>
            </nav>

            {/* ═══ Right: Theme + Auth ═══ */}
            <div className="hidden lg:flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="hdr-theme-btn"
                style={{
                  padding: '8px', borderRadius: '10px', cursor: 'pointer',
                  background: 'none', border: 'none',
                  color: 'var(--text-secondary)',
                }}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {/* Separator */}
              <div style={{
                width: '1px', height: '24px',
                backgroundColor: 'var(--border-color)',
                opacity: 0.5,
              }} />
              <HeaderAuth />
            </div>

            {/* ═══ Mobile: Theme + Hamburger ═══ */}
            <div className="flex items-center gap-1 lg:hidden">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg transition-colors touch-manipulation"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'none', border: 'none',
                  minWidth: '44px', minHeight: '44px',
                }}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="lg:hidden transition-colors duration-200 p-2 -mr-2 touch-manipulation"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'none', border: 'none',
                  minWidth: '44px', minHeight: '44px',
                }}
                aria-label="Toggle menu"
                aria-expanded={isMenuOpen ? 'true' : 'false'}
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Overlay — AnimatePresence */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={() => setIsMenuOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                aria-hidden="true"
              />
              <motion.div
                className="fixed inset-y-0 right-0 w-full sm:w-80 z-50 lg:hidden shadow-2xl"
                style={{ backgroundColor: 'var(--mobile-menu-bg)' }}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              >
                <div
                  className="flex items-center justify-between p-4"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Menu</span>
                  <button
                    onClick={() => setIsMenuOpen(false)}
                    className="transition-colors duration-200 p-2 -mr-2 touch-manipulation"
                    style={{ color: 'var(--text-secondary)', minWidth: '44px', minHeight: '44px' }}
                    aria-label="Close menu"
                  >
                    <X size={24} />
                  </button>
                </div>
                <nav className="flex flex-col p-4 overflow-y-auto h-[calc(100vh-73px)]">
                  <div className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <HeaderAuth onNavigate={() => setIsMenuOpen(false)} />
                  </div>
                  <div className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <Link href="/post-job" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="primary" size="lg" className="w-full">
                        <Briefcase size={20} />
                        Post a Job
                      </Button>
                    </Link>
                  </div>
                  <Link
                    href="/jobs"
                    className="hover:text-primary-600 transition-colors duration-200 font-bold py-4 px-3 rounded-lg -mx-3"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Browse Jobs
                  </Link>
                  <Link
                    href="/saved"
                    className="hover:text-primary-600 transition-colors duration-200 font-bold py-4 px-3 rounded-lg -mx-3 flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Bookmark size={18} />
                    Saved Jobs
                  </Link>
                  <div className="mt-auto pt-6 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <Link
                      href="/faq"
                      className="text-sm hover:text-primary-600 transition-colors duration-200 block py-2 font-medium"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      FAQ
                    </Link>
                    <Link
                      href="/contact"
                      className="text-sm hover:text-primary-600 transition-colors duration-200 block py-2 font-medium"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Contact Us
                    </Link>
                  </div>
                </nav>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
