import { Metadata } from 'next';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import {
  Search,
  Bookmark,
  CheckCircle,
  Database,
  DollarSign,
  Bell,
  FileCheck,
  Heart,
  Sparkles,
  Monitor,
  Building,
  Flag,
  Clock
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'For Job Seekers | PMHNP Jobs',
  description: 'Find your next PMHNP opportunity. 200+ remote and in-person psychiatric nurse practitioner jobs with salary transparency.',
  alternates: {
    canonical: 'https://pmhnphiring.com/for-job-seekers',
  },
};

export default function ForJobSeekersPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-gray-900 text-4xl md:text-5xl font-bold mb-4">
            Find Your Next PMHNP Opportunity
          </h1>
          <p className="text-gray-600 text-xl mb-8 max-w-3xl mx-auto">
            200+ remote and in-person psychiatric NP jobs, updated daily
          </p>
          <Link href="/jobs">
            <button className="bg-teal-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-teal-700 transition-colors shadow-md hover:shadow-lg">
              Browse Jobs
            </button>
          </Link>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <Card padding="lg" variant="elevated" className="text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-primary-600" />
            </div>
            <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">
              1
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Search & Filter
            </h3>
            <p className="text-gray-600">
              Find jobs matching your criteria with powerful search filters for location, job type, salary, and more.
            </p>
          </Card>

          {/* Step 2 */}
          <Card padding="lg" variant="elevated" className="text-center">
            <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bookmark className="w-8 h-8 text-success-600" />
            </div>
            <div className="w-12 h-12 bg-success-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">
              2
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Save & Track
            </h3>
            <p className="text-gray-600">
              Bookmark interesting jobs and track your applications to stay organized throughout your job search.
            </p>
          </Card>

          {/* Step 3 */}
          <Card padding="lg" variant="elevated" className="text-center">
            <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-accent-600" />
            </div>
            <div className="w-12 h-12 bg-accent-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">
              3
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Apply & Land
            </h3>
            <p className="text-gray-600">
              Apply directly to employers with one click and land your dream PMHNP position.
            </p>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
            Everything You Need to Find Your Next Role
          </h2>
          <p className="text-xl text-gray-600 text-center mb-12 max-w-3xl mx-auto">
            We&apos;ve built the most comprehensive PMHNP job search platform with features designed specifically for you.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <Card padding="lg" variant="bordered" className="hover:shadow-lg transition-shadow">
              <Database className="w-10 h-10 text-primary-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Aggregated Listings
              </h3>
              <p className="text-gray-600 text-sm">
                Jobs from multiple sources in one place. Everything you need in a single search.
              </p>
            </Card>

            {/* Feature 2 */}
            <Card padding="lg" variant="bordered" className="hover:shadow-lg transition-shadow">
              <DollarSign className="w-10 h-10 text-success-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Salary Transparency
              </h3>
              <p className="text-gray-600 text-sm">
                Know what jobs pay upfront. See salary ranges and compensation details before applying.
              </p>
            </Card>

            {/* Feature 3 */}
            <Card padding="lg" variant="bordered" className="hover:shadow-lg transition-shadow">
              <Bell className="w-10 h-10 text-warning-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Job Alerts
              </h3>
              <p className="text-gray-600 text-sm">
                Get notified when new jobs match your criteria. Never miss an opportunity.
              </p>
            </Card>

            {/* Feature 4 */}
            <Card padding="lg" variant="bordered" className="hover:shadow-lg transition-shadow">
              <FileCheck className="w-10 h-10 text-primary-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Application Tracking
              </h3>
              <p className="text-gray-600 text-sm">
                Keep track of where you&apos;ve applied and when. Stay organized throughout your search.
              </p>
            </Card>

            {/* Feature 5 */}
            <Card padding="lg" variant="bordered" className="hover:shadow-lg transition-shadow">
              <Heart className="w-10 h-10 text-error-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Save Jobs
              </h3>
              <p className="text-gray-600 text-sm">
                Bookmark interesting opportunities to review later. Build your personal job list.
              </p>
            </Card>

            {/* Feature 6 */}
            <Card padding="lg" variant="bordered" className="hover:shadow-lg transition-shadow">
              <Sparkles className="w-10 h-10 text-accent-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                100% Free
              </h3>
              <p className="text-gray-600 text-sm">
                No cost to job seekers. No hidden fees. No subscription required. Completely free.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Job Types Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          Explore Different Opportunity Types
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Remote/Telehealth */}
          <Card padding="lg" variant="default" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Remote/Telehealth
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Work from anywhere with telepsychiatry and remote opportunities
            </p>
            <Link href="/jobs?mode=Remote" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View Remote Jobs →
            </Link>
          </Card>

          {/* Clinical Roles */}
          <Card padding="lg" variant="default" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building className="w-8 h-8 text-success-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              In-Person Clinical
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Hospital, clinic, and private practice positions
            </p>
            <Link href="/jobs?mode=In-Person" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View Clinical Jobs →
            </Link>
          </Card>

          {/* Government/VA */}
          <Card padding="lg" variant="default" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Flag className="w-8 h-8 text-warning-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Government/VA
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Federal positions with excellent benefits
            </p>
            <Link href="/jobs?search=VA" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View VA Jobs →
            </Link>
          </Card>

          {/* Part-Time/Contract */}
          <Card padding="lg" variant="default" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-accent-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Part-Time/Contract
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Flexible arrangements and per diem opportunities
            </p>
            <Link href="/jobs?jobType=Part-Time" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View Flexible Jobs →
            </Link>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-gray-900 text-3xl md:text-4xl font-bold mb-4">
            Ready to Find Your Next Role?
          </h2>
          <p className="text-gray-600 text-xl mb-8 max-w-2xl mx-auto">
            Join hundreds of PMHNPs who have found their dream positions through our platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto">
            <Link href="/jobs" className="w-full sm:w-auto">
              <button className="bg-teal-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors w-full shadow-md hover:shadow-lg">
                Browse Jobs
              </button>
            </Link>
            <Link href="/#subscribe" className="w-full sm:w-auto">
              <button className="border-2 border-teal-600 text-teal-600 bg-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-50 transition-colors w-full shadow-sm hover:shadow-md">
                Set Up Job Alerts
              </button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

