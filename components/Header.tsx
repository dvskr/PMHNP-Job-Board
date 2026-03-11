'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, Bookmark, Briefcase, Mail, Bell, Sun, Moon, BarChart, Users, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import Button from '@/components/ui/Button';
import HeaderAuth from '@/components/auth/HeaderAuth';
import { useTheme } from '@/components/ThemeProvider';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
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
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  // Auto-close mobile menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Clear any stale overflow lock when navigating between pages
  useEffect(() => {
    document.body.style.overflow = '';
  }, [pathname]);

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
            height: '78px', gap: '8px',
          }}>

            {/* ═══ Left: Logo ═══ */}
            <Link href="/" style={{
              display: 'flex', alignItems: 'center',
              flexShrink: 0, textDecoration: 'none',
            }}>
              <Image
                src="/logo.png"
                alt="PMHNP Hiring - Psychiatric NP Job Board"
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

            {/* ═══ Center: Main nav links ═══ */}
            <nav aria-label="Main navigation" className="hidden lg:flex items-center" style={{
              gap: 'clamp(4px, 0.6vw, 8px)',
            }}>
              <Link
                href="/jobs"
                className={`nav-link ${isActive('/jobs') ? 'active' : ''}`}
                style={{
                  padding: '8px clamp(12px, 1.2vw, 18px)', borderRadius: '10px',
                  fontSize: 'clamp(12px, 1vw, 14px)', fontWeight: 600,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                Find Jobs
              </Link>
              <Link
                href="/salary-guide"
                className={`nav-link ${isActive('/salary-guide') ? 'active' : ''}`}
                style={{
                  padding: '8px clamp(12px, 1.2vw, 18px)', borderRadius: '10px',
                  fontSize: 'clamp(12px, 1vw, 14px)', fontWeight: 600,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                Salary Guide
              </Link>
              {userRole !== 'job_seeker' && (
                <Link
                  href="/for-employers"
                  className={`nav-link ${isActive('/for-employers') ? 'active' : ''}`}
                  style={{
                    padding: '8px clamp(12px, 1.2vw, 18px)', borderRadius: '10px',
                    fontSize: 'clamp(12px, 1vw, 14px)', fontWeight: 600,
                    textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  For Employers
                </Link>
              )}
              {userRole !== 'job_seeker' && (
                <Link
                  href="/post-job"
                  className="hdr-post-link"
                  style={{
                    padding: '7px clamp(12px, 1.2vw, 16px)', borderRadius: '10px',
                    fontSize: 'clamp(12px, 1vw, 13px)', fontWeight: 600,
                    textDecoration: 'none', whiteSpace: 'nowrap',
                    marginLeft: '4px',
                  }}
                >
                  Post a Job
                </Link>
              )}
            </nav>

            {/* ═══ Right: Saved icon + Theme + Auth ═══ */}
            <div className="hidden lg:flex items-center gap-2" style={{ flexShrink: 0 }}>
              {userRole !== 'employer' && (
                <Link
                  href="/saved"
                  className="hdr-theme-btn"
                  style={{
                    padding: '8px', borderRadius: '10px',
                    color: isActive('/saved') ? '#2DD4BF' : 'var(--text-secondary)',
                    display: 'flex',
                  }}
                  aria-label="Saved jobs"
                  title="Saved Jobs"
                >
                  <Bookmark size={18} />
                </Link>
              )}
              <Link
                href="/messages"
                className="hdr-theme-btn"
                style={{
                  padding: '8px', borderRadius: '10px',
                  color: isActive('/messages') ? '#2DD4BF' : 'var(--text-secondary)',
                  display: 'flex',
                }}
                aria-label="Messages"
                title="Messages"
              >
                <Mail size={18} />
              </Link>
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
              <div style={{
                width: '1px', height: '24px',
                backgroundColor: 'var(--border-color)',
                opacity: 0.5,
              }} />
              <HeaderAuth onRoleChange={setUserRole} />
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
                className="fixed inset-0 z-[70] lg:hidden"
                onClick={() => setIsMenuOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                aria-hidden="true"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}
              />
              <motion.div
                className="fixed inset-y-0 right-0 w-full sm:w-80 z-[90] lg:hidden shadow-2xl"
                style={{ backgroundColor: 'var(--bg-primary)' }}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              >
                <div className="h-full w-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
                  <nav className="flex flex-col items-center p-4 overflow-y-auto h-[calc(100vh-73px)]" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <div className="mb-6 pb-6 w-full" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <HeaderAuth onNavigate={() => setIsMenuOpen(false)} onRoleChange={setUserRole} />
                    </div>
                    {userRole !== 'job_seeker' && (
                      <div className="mb-4 pb-4 w-full" style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <Link href="/post-job" onClick={() => setIsMenuOpen(false)}>
                          <Button variant="primary" size="lg" className="w-full">
                            <Briefcase size={20} />
                            Post a Job
                          </Button>
                        </Link>
                      </div>
                    )}
                    <div className="space-y-1 w-full flex flex-col items-center">
                      {/* Mobile: Job Seekers section */}
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.5px', color: '#2DD4BF', padding: '8px 12px 4px', width: '100%', textAlign: 'center' }}>For Job Seekers</div>
                      <Link
                        href="/jobs"
                        className="flex items-center justify-center gap-3 py-3 px-3 rounded-lg transition-colors duration-200 w-full"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <Briefcase size={20} />
                        <span className="font-semibold">Browse Jobs</span>
                      </Link>
                      <Link
                        href="/salary-guide"
                        className="flex items-center justify-center gap-3 py-3 px-3 rounded-lg transition-colors duration-200 w-full"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <BarChart size={20} />
                        <span className="font-semibold">Salary Guide</span>
                      </Link>
                      <Link
                        href="/saved"
                        className="flex items-center justify-center gap-3 py-3 px-3 rounded-lg transition-colors duration-200 w-full"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <Bookmark size={20} />
                        <span className="font-semibold">Saved Jobs</span>
                      </Link>
                      <Link
                        href="/job-alerts"
                        className="flex items-center justify-center gap-3 py-3 px-3 rounded-lg transition-colors duration-200 w-full"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <Bell size={20} />
                        <span className="font-semibold">Job Alerts</span>
                      </Link>
                      <Link
                        href="/messages"
                        className="flex items-center justify-center gap-3 py-3 px-3 rounded-lg transition-colors duration-200 w-full"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <Mail size={20} />
                        <span className="font-semibold">Messages</span>
                      </Link>

                      {/* Mobile: Employers section */}
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.5px', color: '#E86C2C', padding: '16px 12px 4px', width: '100%', textAlign: 'center', borderTop: '1px solid var(--border-color)', marginTop: '8px' }}>For Employers</div>
                      <Link
                        href="/for-employers"
                        className="flex items-center justify-center gap-3 py-3 px-3 rounded-lg transition-colors duration-200 w-full"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <Users size={20} />
                        <span className="font-semibold">Employer Hub</span>
                      </Link>
                      <Link
                        href="/pricing"
                        className="flex items-center justify-center gap-3 py-3 px-3 rounded-lg transition-colors duration-200 w-full"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <DollarSign size={20} />
                        <span className="font-semibold">Pricing</span>
                      </Link>
                    </div>
                    <div className="mt-auto pt-6 space-y-1 w-full flex flex-col items-center" style={{ borderTop: '1px solid var(--border-color)' }}>
                      <Link
                        href="/faq"
                        className="text-sm transition-colors duration-200 block py-2 px-3 font-medium rounded-lg text-center"
                        style={{ color: 'var(--text-secondary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        FAQ
                      </Link>
                      <Link
                        href="/contact"
                        className="text-sm transition-colors duration-200 block py-2 px-3 font-medium rounded-lg"
                        style={{ color: 'var(--text-secondary)' }}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Contact Us
                      </Link>
                    </div>
                  </nav>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
