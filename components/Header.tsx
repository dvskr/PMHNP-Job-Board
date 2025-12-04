'use client';

import Link from 'next/link';
import { Menu, X, Bookmark } from 'lucide-react';
import { useState } from 'react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="text-2xl font-bold text-blue-500 hover:text-blue-600 transition-colors">
              PMHNP Jobs
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/jobs" className="text-gray-700 hover:text-blue-500 transition-colors font-medium">
              Jobs
            </Link>
            <Link href="/saved" className="text-gray-700 hover:text-blue-500 transition-colors font-medium flex items-center gap-1">
              <Bookmark size={16} />
              Saved Jobs
            </Link>
            <Link href="/post-job" className="text-gray-700 hover:text-blue-500 transition-colors font-medium">
              Post Job
            </Link>
            <Link href="/salary-guide" className="text-gray-700 hover:text-blue-500 transition-colors font-medium">
              Salary Guide
            </Link>
          </nav>

          {/* Desktop CTA Button */}
          <div className="hidden md:block">
            <Link
              href="/#subscribe"
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              Sign up for alerts
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={toggleMenu}
            className="md:hidden text-gray-700 hover:text-blue-500 transition-colors"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-gray-200">
            <nav className="flex flex-col space-y-3">
              <Link
                href="/jobs"
                className="text-gray-700 hover:text-blue-500 transition-colors font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Jobs
              </Link>
              <Link
                href="/saved"
                className="text-gray-700 hover:text-blue-500 transition-colors font-medium py-2 flex items-center gap-1"
                onClick={() => setIsMenuOpen(false)}
              >
                <Bookmark size={16} />
                Saved Jobs
              </Link>
              <Link
                href="/post-job"
                className="text-gray-700 hover:text-blue-500 transition-colors font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Post Job
              </Link>
              <Link
                href="/salary-guide"
                className="text-gray-700 hover:text-blue-500 transition-colors font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Salary Guide
              </Link>
              <Link
                href="/#subscribe"
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium text-center"
                onClick={() => setIsMenuOpen(false)}
              >
                Sign up for alerts
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

