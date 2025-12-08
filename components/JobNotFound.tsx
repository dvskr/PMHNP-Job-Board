import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Search, Bell, Briefcase, Clock, TrendingUp } from 'lucide-react';

export default function JobNotFound() {
  const handleAlertClick = () => {
    // Scroll to alert section on homepage
    window.location.href = '/#subscribe';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      {/* Main Card */}
      <Card padding="lg" variant="elevated" className="text-center mb-12">
        {/* Icon */}
        <div className="mb-6">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
            <Search className="w-12 h-12 text-gray-400" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Job Not Found
        </h1>

        {/* Subtext */}
        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
          This job posting may have expired, been filled, or removed by the employer.
        </p>

        {/* Suggestions */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-gray-900 mb-4">
            Here's what you can do:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto mb-8">
            <div className="flex items-start gap-3 text-left">
              <Briefcase className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900 text-sm">Browse similar jobs</p>
                <p className="text-xs text-gray-600">Find other PMHNP opportunities</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-left">
              <Bell className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900 text-sm">Set up job alerts</p>
                <p className="text-xs text-gray-600">Get notified of new postings</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/jobs">
            <Button variant="primary" size="lg">
              <Briefcase size={20} />
              Browse All Jobs
            </Button>
          </Link>
          <Button 
            variant="outline" 
            size="lg"
            onClick={handleAlertClick}
          >
            <Bell size={20} />
            Create Job Alert
          </Button>
        </div>
      </Card>

      {/* Why This Might Have Happened */}
      <Card padding="md" variant="bordered" className="mb-8 bg-gray-50">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-gray-900 text-sm mb-2">
              Why did this happen?
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Job postings expire after 30-60 days</li>
              <li>• Employers may remove filled positions</li>
              <li>• The job link may be outdated</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Recently Posted Jobs Section */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-primary-600" />
          <h2 className="text-2xl font-bold text-gray-900">
            Recently Posted Jobs
          </h2>
        </div>
        
        <Card padding="md" variant="bordered" className="bg-primary-50 border-primary-200">
          <div className="text-center py-8">
            <p className="text-gray-700 mb-4">
              Check out our latest PMHNP job postings
            </p>
            <Link href="/jobs?sort=newest">
              <Button variant="primary" size="md">
                View Recent Jobs
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="mt-8 pt-8 border-t border-gray-200 text-center">
        <p className="text-sm text-gray-600 mb-3">
          Looking for something specific?
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/jobs?type=Full-time"
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            Full-time Jobs
          </Link>
          <span className="text-gray-400">·</span>
          <Link
            href="/jobs?mode=Remote"
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            Remote Jobs
          </Link>
          <span className="text-gray-400">·</span>
          <Link
            href="/jobs?type=Part-time"
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            Part-time Jobs
          </Link>
          <span className="text-gray-400">·</span>
          <Link
            href="/salary-guide"
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            Salary Guide
          </Link>
        </div>
      </div>
    </div>
  );
}

