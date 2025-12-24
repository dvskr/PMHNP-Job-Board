import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Search, Home, Briefcase, MapPin } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center animate-fade-in">
        {/* 404 Number */}
        <div className="mb-8">
          <h1 className="text-9xl md:text-[12rem] font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-600 leading-none">
            404
          </h1>
        </div>

        {/* Icon */}
        <div className="mb-6">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center">
            <MapPin className="w-12 h-12 text-primary-600" />
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Page Not Found
        </h2>

        {/* Subtext */}
        <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
          Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Search Suggestion */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <Search className="w-5 h-5 text-primary-600" />
              <p className="font-medium text-gray-900">
                Try searching for jobs
              </p>
            </div>
            <p className="text-sm text-gray-600">
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
        <div className="pt-8 border-t border-gray-200 max-w-md mx-auto">
          <p className="text-sm text-gray-600 mb-3">
            Or explore these popular pages:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/for-job-seekers"
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              For Job Seekers
            </Link>
            <span className="text-gray-400">·</span>
            <Link
              href="/for-employers"
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              For Employers
            </Link>
            <span className="text-gray-400">·</span>
            <Link
              href="/faq"
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              FAQ
            </Link>
            <span className="text-gray-400">·</span>
            <Link
              href="/contact"
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

