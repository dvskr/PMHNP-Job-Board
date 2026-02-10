'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, Bookmark, Briefcase, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';
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

  // Passive scroll listener for transparent-to-solid effect on homepage
  useEffect(() => {
    if (!isHomepage) {
      setScrolled(true);
      return;
    }

    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    // Check initial scroll position
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHomepage]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  // Determine if the navbar should show solid background
  const showSolid = !isHomepage || scrolled;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        backgroundColor: showSolid ? 'var(--header-bg)' : 'transparent',
        borderBottom: showSolid ? '1px solid var(--border-color)' : '1px solid transparent',
        boxShadow: showSolid ? 'var(--shadow-md)' : 'none',
        backdropFilter: showSolid ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: showSolid ? 'blur(12px)' : 'none',
        transition: 'background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 relative">
          {/* Centered Logo and Navigation with Even Spacing */}
          <div className="hidden lg:flex items-center gap-4 absolute left-1/2 transform -translate-x-1/2 -ml-20">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <Image
                src="/pmhnp_logo.png"
                alt="PMHNP Hiring"
                width={121}
                height={52}
                priority
                className="h-[52px] w-auto"
              />
            </Link>

            {/* Divider */}
            <div className="h-12 w-px" style={{ backgroundColor: 'var(--border-color)' }}></div>

            {/* Desktop Navigation Buttons */}
            <Link href="/jobs">
              <button
                className="px-5 py-2 rounded-lg font-bold transition-colors shadow-sm"
                style={{
                  backgroundColor: 'var(--nav-btn-bg)',
                  color: 'var(--nav-btn-text)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--nav-btn-hover-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--nav-btn-bg)')}
              >
                Jobs
              </button>
            </Link>
            <Link href="/saved">
              <button
                className="px-5 py-2 rounded-lg font-bold transition-colors shadow-sm flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--nav-btn-bg)',
                  color: 'var(--nav-btn-text)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--nav-btn-hover-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--nav-btn-bg)')}
              >
                <Bookmark size={16} />
                Saved
              </button>
            </Link>
            <Link href="/post-job">
              <button className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg">
                Post a Job
              </button>
            </Link>
          </div>

          {/* Mobile Logo */}
          <div className="flex-shrink-0 lg:hidden">
            <Link href="/" className="flex items-center">
              <Image
                src="/pmhnp_logo.png"
                alt="PMHNP Hiring"
                width={93}
                height={40}
                priority
                className="h-[40px] w-auto"
              />
            </Link>
          </div>

          {/* Spacer for desktop to push auth to right */}
          <div className="hidden lg:block flex-1"></div>

          {/* Theme Toggle + Auth Section - Desktop */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors"
              style={{
                color: 'var(--text-secondary)',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--nav-btn-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <HeaderAuth />
          </div>

          {/* Mobile: Theme Toggle + Hamburger */}
          <div className="flex items-center gap-1 lg:hidden">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors touch-manipulation"
              style={{
                color: 'var(--text-secondary)',
                minWidth: '44px',
                minHeight: '44px',
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
                minWidth: '44px',
                minHeight: '44px',
              }}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen ? "true" : "false"}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Full-screen Menu */}
          <div
            className="fixed inset-y-0 right-0 w-full sm:w-80 z-50 lg:hidden shadow-2xl animate-slide-in-right"
            style={{ backgroundColor: 'var(--mobile-menu-bg)' }}
          >
            {/* Menu Header */}
            <div
              className="flex items-center justify-between p-4"
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Menu</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="transition-colors duration-200 p-2 -mr-2 touch-manipulation"
                style={{
                  color: 'var(--text-secondary)',
                  minWidth: '44px',
                  minHeight: '44px',
                }}
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
            </div>

            {/* Menu Content */}
            <nav className="flex flex-col p-4 overflow-y-auto h-[calc(100vh-73px)]">
              {/* Auth Section - Mobile */}
              <div className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <HeaderAuth onNavigate={() => setIsMenuOpen(false)} />
              </div>

              {/* Primary CTA - Post a Job */}
              <div className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <Link href="/post-job" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="primary" size="lg" className="w-full">
                    <Briefcase size={20} />
                    Post a Job
                  </Button>
                </Link>
              </div>

              {/* Navigation Links */}
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

              {/* Footer Links */}
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
          </div>
        </>
      )}
    </header>
  );
}
