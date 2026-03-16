import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Search, Home, Briefcase, MapPin } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-16"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-2xl w-full text-center animate-fade-in">
        {/* 404 Number */}
        <div className="mb-8">
          <h1
            className="text-9xl md:text-[12rem] font-bold leading-none"
            style={{
              background: 'linear-gradient(135deg, #0D9488, #2DD4BF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            404
          </h1>
        </div>

        {/* Icon */}
        <div className="mb-6">
          <div
            className="w-24 h-24 mx-auto rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
          >
            <MapPin className="w-12 h-12" style={{ color: 'var(--color-primary)' }} />
          </div>
        </div>

        {/* Heading */}
        <h2
          className="text-3xl md:text-4xl font-bold mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Page Not Found
        </h2>

        {/* Subtext */}
        <p
          className="text-lg mb-8 max-w-md mx-auto"
          style={{ color: 'var(--text-secondary)' }}
        >
          Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Search Suggestion */}
        <div className="mb-8">
          <div
            className="rounded-xl shadow-md p-6 max-w-md mx-auto"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Search className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Try searching for jobs
              </p>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Browse our 200+ PMHNP positions or use filters to find exactly what you&apos;re looking for.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link href="/jobs">
            <Button variant="primary" size="lg" className="w-full sm:w-auto">
              <Briefcase size={20} />
              Browse All Jobs
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              <Home size={20} />
              Go to Homepage
            </Button>
          </Link>
        </div>

        {/* Quick Links */}
        <div
          className="pt-8 max-w-md mx-auto"
          style={{ borderTop: '1px solid var(--border-color)' }}
        >
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Or explore these popular pages:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/for-job-seekers"
              className="text-sm hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              For Job Seekers
            </Link>
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <Link
              href="/for-employers"
              className="text-sm hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              For Employers
            </Link>
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <Link
              href="/faq"
              className="text-sm hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              FAQ
            </Link>
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <Link
              href="/contact"
              className="text-sm hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
