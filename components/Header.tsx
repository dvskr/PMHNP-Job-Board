'use client';

import Link from 'next/link';
import { Menu, X, Bookmark } from 'lucide-react';
import { useState } from 'react';
import Button from '@/components/ui/Button';

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
            <Link href="/" className="text-2xl font-bold text-primary-600 hover:text-primary-700 transition-colors duration-200">
              PMHNP Jobs
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/jobs" className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium">
              Jobs
            </Link>
            <Link href="/saved" className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium flex items-center gap-2">
              <Bookmark size={16} />
              Saved Jobs
            </Link>
            <Link href="/post-job" className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium">
              Post Job
            </Link>
            <Link href="/salary-guide" className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium">
              Salary Guide
            </Link>
            <Link href="/about" className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium">
              About
            </Link>
          </nav>

          {/* Desktop CTA Button */}
          <div className="hidden md:block">
            <Link href="/#subscribe">
              <Button variant="primary" size="md">
                Sign up for alerts
              </Button>
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={toggleMenu}
            className="md:hidden text-gray-600 hover:text-primary-600 transition-colors duration-200"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden pb-4 pt-2 bg-white shadow-lg rounded-xl mt-2">
            <nav className="flex flex-col space-y-2 p-4">
              <Link
                href="/jobs"
                className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Jobs
              </Link>
              <Link
                href="/saved"
                className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium py-2 flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <Bookmark size={16} />
                Saved Jobs
              </Link>
              <Link
                href="/post-job"
                className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Post Job
              </Link>
              <Link
                href="/salary-guide"
                className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Salary Guide
              </Link>
              <Link
                href="/about"
                className="text-gray-600 hover:text-primary-600 transition-colors duration-200 font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                About
              </Link>
              <div className="pt-2" onClick={() => setIsMenuOpen(false)}>
                <Link href="/#subscribe">
                  <Button variant="primary" size="md" className="w-full">
                    Sign up for alerts
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

