import { Metadata } from 'next';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

import { config } from '@/lib/config';
import {
  Target,
  DollarSign,
  Clock,
  TrendingUp,
  FileText,
  Award,
  BarChart,
  Edit,
  RefreshCw,
  Download,
  Check,
  Sparkles,
  Mail
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'For Employers | PMHNP Jobs',
  description: 'Hire qualified Psychiatric Mental Health Nurse Practitioners. Post jobs for free. Reach thousands of PMHNPs.',
  alternates: {
    canonical: 'https://pmhnphiring.com/for-employers',
  },
};

export default function ForEmployersPage() {
  return (
    <div className="min-h-screen bg-white">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'For Employers', url: 'https://pmhnphiring.com/for-employers' },
      ]} />
      {/* Hero Section */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-gray-900 text-4xl md:text-5xl font-bold mb-4">
            Hire Qualified PMHNPs
          </h1>
          <p className="text-gray-600 text-xl mb-8 max-w-3xl mx-auto">
            Reach thousands of psychiatric nurse practitioners actively looking for opportunities
          </p>
          <Link href="/employer/signup">
            <button className="bg-teal-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-teal-700 transition-colors shadow-md hover:shadow-lg">
              Post a Job
            </button>
          </Link>
        </div>
      </section>

      {/* Why Post Here Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          Why Post on PMHNP Jobs?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Benefit 1 */}
          <Card padding="lg" variant="bordered" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Targeted Audience
            </h3>
            <p className="text-sm text-gray-600">
              Only PMHNPs visit our site. No need to filter through unqualified candidates.
            </p>
          </Card>

          {/* Benefit 2 */}
          <Card padding="lg" variant="bordered" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-success-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Post Jobs for Free
            </h3>
            <p className="text-sm text-gray-600">
              Post your job for free during our launch period. No credit card required.
            </p>
          </Card>

          {/* Benefit 3 */}
          <Card padding="lg" variant="bordered" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-warning-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Quick Setup
            </h3>
            <p className="text-sm text-gray-600">
              Post a job in under 5 minutes. Simple form, instant publishing.
            </p>
          </Card>

          {/* Benefit 4 */}
          <Card padding="lg" variant="bordered" className="text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-accent-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Real Results
            </h3>
            <p className="text-sm text-gray-600">
              Track views, clicks, and applications. Know exactly how your posting performs.
            </p>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      {!config.isPaidPostingEnabled ? (
        // FREE MODE
        <section className="py-16 bg-gradient-to-b from-green-50 to-white">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <div className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              🎉 Launch Special
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Post Jobs for FREE
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              For a limited time, all job postings are completely free.
              Get your PMHNP positions in front of qualified candidates today.
            </p>

            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <div className="bg-white p-6 rounded-xl shadow-md border-2 border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Standard Post</h3>
                <p className="text-3xl font-bold text-gray-900 my-2">
                  <span className="line-through text-gray-400 text-lg">$99</span> FREE
                </p>
                <ul className="text-left text-gray-600 space-y-2 mt-4">
                  <li>✓ 30-day listing</li>
                  <li>✓ Included in job alerts</li>
                  <li>✓ Full job description</li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-md border-2 border-teal-500">
                <div className="text-teal-600 text-sm font-semibold mb-1">RECOMMENDED</div>
                <h3 className="text-lg font-semibold text-gray-900">Featured Post</h3>
                <p className="text-3xl font-bold text-gray-900 my-2">
                  <span className="line-through text-gray-400 text-lg">$199</span> FREE
                </p>
                <ul className="text-left text-gray-600 space-y-2 mt-4">
                  <li>✓ Everything in Standard</li>
                  <li>✓ Featured badge</li>
                  <li>✓ Top placement in results</li>
                  <li>✓ Highlighted in email digest</li>
                </ul>
              </div>
            </div>

            <Link
              href="/post-job"
              className="inline-block mt-8 bg-teal-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-teal-700 transition-colors"
            >
              Post a Job - Free
            </Link>
          </div>
        </section>
      ) : (
        // PAID MODE
        <section className="bg-white py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600 text-center mb-12 max-w-3xl mx-auto">
              Choose the plan that works best for your hiring needs. No subscriptions, no contracts.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Standard Plan */}
              <Card padding="lg" variant="bordered" className="relative">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Standard Post
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">$99</span>
                    <span className="text-gray-600">per posting</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">30-day listing</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Included in job alerts</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Basic analytics (views, clicks)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Edit anytime</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Employer dashboard access</span>
                  </li>
                </ul>

                <Link href="/employer/signup">
                  <Button variant="outline" size="lg" className="w-full">
                    Get Started
                  </Button>
                </Link>
              </Card>

              {/* Featured Plan */}
              <Card padding="lg" variant="elevated" className="relative border-2 border-primary-500">
                <div className="absolute top-0 right-0 mt-4 mr-4">
                  <Badge variant="featured" size="md">
                    Most Popular
                  </Badge>
                </div>

                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    Featured Post
                    <Sparkles className="w-6 h-6 text-accent-500" />
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">$199</span>
                    <span className="text-gray-600">per posting</span>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm font-semibold text-primary-600 mb-2">
                    Everything in Standard, plus:
                  </p>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">60-day listing (2x longer)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Top placement in search results</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Highlighted in job alerts</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">&quot;Featured&quot; badge on your listing</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Priority visibility</span>
                  </li>
                </ul>

                <Link href="/employer/signup">
                  <Button variant="primary" size="lg" className="w-full">
                    Get Featured
                  </Button>
                </Link>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* How It Works Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <Card padding="lg" variant="elevated" className="text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-primary-600" />
            </div>
            <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">
              1
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Create Your Listing
            </h3>
            <p className="text-gray-600">
              Fill out the simple job posting form with your requirements, salary, and application details.
            </p>
          </Card>

          {/* Step 2 */}
          <Card padding="lg" variant="elevated" className="text-center">
            <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="w-8 h-8 text-success-600" />
            </div>
            <div className="w-12 h-12 bg-success-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">
              2
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Preview & Publish
            </h3>
            <p className="text-gray-600">
              Review your job posting and publish it instantly. No payment required during launch period.
            </p>
          </Card>

          {/* Step 3 */}
          <Card padding="lg" variant="elevated" className="text-center">
            <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-accent-600" />
            </div>
            <div className="w-12 h-12 bg-accent-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">
              3
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Start Receiving Candidates
            </h3>
            <p className="text-gray-600">
              Your posting goes live immediately. Track performance and receive qualified applications.
            </p>
          </Card>
        </div>
      </section>

      {/* Features for Employers Section */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Everything You Need to Hire Successfully
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <Card padding="lg" variant="bordered">
              <BarChart className="w-10 h-10 text-primary-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Employer Dashboard
              </h3>
              <p className="text-gray-600 text-sm">
                Manage all your postings from one place. View analytics, edit listings, and track performance.
              </p>
            </Card>

            {/* Feature 2 */}
            <Card padding="lg" variant="bordered">
              <TrendingUp className="w-10 h-10 text-success-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Analytics
              </h3>
              <p className="text-gray-600 text-sm">
                Track views, apply clicks, and engagement. Know exactly how your posting is performing.
              </p>
            </Card>

            {/* Feature 3 */}
            <Card padding="lg" variant="bordered">
              <Edit className="w-10 h-10 text-warning-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Edit Anytime
              </h3>
              <p className="text-gray-600 text-sm">
                Update salary, requirements, or any details whenever you need. Changes go live immediately.
              </p>
            </Card>

            {/* Feature 4 */}
            <Card padding="lg" variant="bordered">
              <RefreshCw className="w-10 h-10 text-primary-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Renew Easily
              </h3>
              <p className="text-gray-600 text-sm">
                Extend your posting with one click when needed. Keep your listing active as long as you&apos;re hiring.
              </p>
            </Card>

            {/* Feature 5 */}
            <Card padding="lg" variant="bordered">
              <Download className="w-10 h-10 text-success-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Invoice Download
              </h3>
              <p className="text-gray-600 text-sm">
                Download professional invoices for your records. Easy expense reporting and accounting.
              </p>
            </Card>

            {/* Feature 6 */}
            <Card padding="lg" variant="bordered">
              <Mail className="w-10 h-10 text-accent-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Email Notifications
              </h3>
              <p className="text-gray-600 text-sm">
                Get notified when your posting expires or needs attention. Never miss an opportunity.
              </p>
            </Card>
          </div>
        </div>
      </section>



      {/* CTA Section */}
      <section className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-gray-900 text-3xl md:text-4xl font-bold mb-4">
            Ready to Find Your Next PMHNP?
          </h2>
          <p className="text-gray-600 text-xl mb-8 max-w-2xl mx-auto">
            Post your job today and start receiving applications from qualified psychiatric nurse practitioners.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto">
            <Link href="/employer/signup" className="w-full sm:w-auto">
              <button className="bg-teal-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors w-full shadow-md hover:shadow-lg">
                Post a Job
              </button>
            </Link>
            <a href="mailto:support@pmhnphiring.com" className="w-full sm:w-auto">
              <button className="border-2 border-teal-600 text-teal-600 bg-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-50 transition-colors w-full shadow-sm hover:shadow-md">
                Contact Us
              </button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

