import Link from 'next/link';
import StatsSection from '@/components/StatsSection';
import PopularCategories from '@/components/PopularCategories';
import TestimonialsSection from '@/components/TestimonialsSection';
import HomepageJobAlertForm from '@/components/HomepageJobAlertForm';

/**
 * Home Page Component
 * Displays the landing page with hero section, stats, categories, features, and CTAs
 */
export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Find Your Next PMHNP Role
          </h1>
          <p className="text-xl md:text-2xl text-blue-50 mb-8 max-w-2xl mx-auto">
            The #1 job board for psychiatric mental health nurse practitioners. 
            200+ remote and in-person jobs updated daily.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/jobs"
              className="inline-block bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-blue-50 transition-colors w-full sm:w-auto text-center"
            >
              Browse Jobs
            </Link>
            <Link
              href="/post-job"
              className="inline-block bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg border-2 border-blue-500 hover:bg-blue-600 transition-colors w-full sm:w-auto text-center"
            >
              Post a Job for Free
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <StatsSection />

      {/* Popular Categories */}
      <PopularCategories />

      {/* Features Section */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Why PMHNP Jobs?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold mb-2">Specialized Focus</h3>
              <p className="text-gray-600">
                Only psychiatric nurse practitioner jobs. No filtering through irrelevant listings.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">🏠</div>
              <h3 className="text-xl font-semibold mb-2">Remote & In-Person</h3>
              <p className="text-gray-600">
                Find telehealth, hybrid, and on-site positions that match your lifestyle.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">📧</div>
              <h3 className="text-xl font-semibold mb-2">Weekly Alerts</h3>
              <p className="text-gray-600">
                Get new jobs delivered to your inbox. Never miss an opportunity.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <TestimonialsSection />

      {/* Job Alerts Section */}
      <section className="bg-blue-50 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Get PMHNP Job Alerts
          </h2>
          <p className="text-gray-600 mb-8">
            New psychiatric nurse practitioner jobs delivered to your inbox
          </p>
          <HomepageJobAlertForm className="max-w-2xl mx-auto" />
        </div>
      </section>

      {/* Salary Guide Section */}
      <section className="bg-gradient-to-br from-gray-50 to-gray-100 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-lg font-semibold text-blue-600 mb-2">📊 Know Your Worth</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Get the Free 2026 PMHNP Salary Guide
          </h2>
          <p className="text-gray-600 mb-8">
            Pay rates by state • Telehealth vs in-person • Negotiation tips
          </p>
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-6">
            <iframe 
              src="https://subscribe-forms.beehiiv.com/ec7a9528-db98-40ff-948a-fa8f637fd4f0"
              className="w-full"
              data-test-id="beehiiv-embed"
              frameBorder="0"
              scrolling="no"
              style={{ 
                height: '280px', 
                backgroundColor: 'transparent',
                border: 'none'
              }}
            />
            <p className="text-xs text-gray-500 mt-3">
              No spam. Unsubscribe anytime.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Hiring PMHNPs?
          </h2>
          <p className="text-gray-700 mb-8">
            Reach thousands of qualified psychiatric nurse practitioners actively looking for their next role.
          </p>
          <Link
            href="/post-job"
            className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors"
          >
            Post a Job for Free
          </Link>
        </div>
      </section>
    </div>
  );
}
