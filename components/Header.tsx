'use client';

import Link from 'next/link';
import { Menu, X, Bookmark, Briefcase } from 'lucide-react';
import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import HeaderAuth from '@/components/auth/HeaderAuth';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

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

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="text-2xl font-bold text-blue-600 hover:text-blue-700 transition-colors duration-200">
              PMHNP Jobs
            </Link>
          </div>

          {/* Desktop Navigation - Centered Buttons */}
          <nav className="hidden lg:flex items-center gap-3 absolute left-1/2 transform -translate-x-1/2">
            <Link href="/jobs">
              <button className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors shadow-sm">
                Jobs
              </button>
            </Link>
            <Link href="/saved">
              <button className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors shadow-sm flex items-center gap-2">
                <Bookmark size={16} />
                Saved
              </button>
            </Link>
            <Link href="/post-job">
              <button className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg">
                Post a Job
              </button>
            </Link>
          </nav>

          {/* Auth Section - Desktop */}
          <div className="hidden lg:flex items-center">
            <HeaderAuth />
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={toggleMenu}
            className="lg:hidden text-gray-600 hover:text-primary-600 transition-colors duration-200 p-2 -mr-2 touch-manipulation"
            style={{ minWidth: '44px', minHeight: '44px' }}
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen ? "true" : "false"}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
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
          <div className="fixed inset-y-0 right-0 w-full sm:w-80 bg-white z-50 lg:hidden shadow-2xl animate-slide-in-right">
            {/* Menu Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <span className="text-lg font-bold text-gray-900">Menu</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="text-gray-600 hover:text-primary-600 transition-colors duration-200 p-2 -mr-2 touch-manipulation"
                style={{ minWidth: '44px', minHeight: '44px' }}
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
            </div>

            {/* Menu Content */}
            <nav className="flex flex-col p-4 overflow-y-auto h-[calc(100vh-73px)]">
              {/* Auth Section - Mobile */}
              <div className="mb-6 pb-6 border-b border-gray-200">
                <HeaderAuth />
              </div>

              {/* Primary CTA - Post a Job */}
              <div className="mb-6 pb-6 border-b border-gray-200">
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
                className="text-gray-700 hover:text-primary-600 hover:bg-gray-50 transition-colors duration-200 font-medium py-4 px-3 rounded-lg -mx-3"
                onClick={() => setIsMenuOpen(false)}
              >
                Browse Jobs
              </Link>
              <Link
                href="/saved"
                className="text-gray-700 hover:text-primary-600 hover:bg-gray-50 transition-colors duration-200 font-medium py-4 px-3 rounded-lg -mx-3 flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <Bookmark size={18} />
                Saved Jobs
              </Link>

              {/* Footer Links */}
              <div className="mt-auto pt-6 space-y-2 border-t border-gray-200">
                <Link
                  href="/faq"
                  className="text-sm text-gray-600 hover:text-primary-600 transition-colors duration-200 block py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  FAQ
                </Link>
                <Link
                  href="/contact"
                  className="text-sm text-gray-600 hover:text-primary-600 transition-colors duration-200 block py-2"
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

