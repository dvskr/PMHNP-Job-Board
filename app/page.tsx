import { Metadata } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { prisma } from '@/lib/prisma';
import StatsSection from '@/components/StatsSection';
import PopularCategories from '@/components/PopularCategories';
import HomepageHero from '@/components/HomepageHero';

// Lazy load client components
const HomepageJobAlertForm = dynamic(() => import('@/components/HomepageJobAlertForm'), {
  loading: () => <div className="h-32 bg-white/50 animate-pulse rounded-lg max-w-xl mx-auto" />,
});

const SalaryGuideSection = dynamic(() => import('@/components/SalaryGuideSection'), {
  loading: () => <div className="h-64 bg-teal-100 animate-pulse" />,
});

// Revalidate every 60 seconds
export const revalidate = 60;

/**
 * Get total job count for dynamic metadata
 */
async function getTotalJobCount(): Promise<number> {
  try {
    const count = await prisma.job.count({
      where: { isPublished: true },
    });
    return count;
  } catch {
    return 200; // Fallback
  }
}

/**
 * Generate dynamic metadata with job count
 */
export async function generateMetadata(): Promise<Metadata> {
  const totalJobs = await getTotalJobCount();
  const jobCountDisplay = totalJobs > 1000
    ? `${Math.floor(totalJobs / 100) * 100}+`
    : totalJobs.toLocaleString();

  return {
    title: `${jobCountDisplay} PMHNP Jobs | Psychiatric Nurse Practitioner Job Board`,
    description: `Find ${jobCountDisplay} PMHNP jobs across the United States. The #1 job board for psychiatric mental health nurse practitioners. Remote and in-person positions updated daily.`,
    openGraph: {
      title: `${jobCountDisplay} PMHNP Jobs - Find Your Next Position`,
      description: `Browse ${jobCountDisplay} psychiatric nurse practitioner jobs. Remote, hybrid, and in-person positions with salary transparency.`,
    },
    alternates: {
      canonical: 'https://pmhnphiring.com',
    },
  };
}

/**
 * Home Page Component
 * Displays the landing page with hero section, stats, categories, features, and CTAs
 */
export default async function Home() {
  const totalJobs = await getTotalJobCount();
  const jobCountDisplay = totalJobs > 1000
    ? `${Math.floor(totalJobs / 100) * 100}+`
    : totalJobs.toLocaleString();

  return (
    <div>
      {/* Hero Section */}
      <HomepageHero jobCountDisplay={jobCountDisplay} />

      {/* Stats Section */}
      <StatsSection />

      {/* Popular Categories */}
      <PopularCategories />

      {/* Explore PMHNP Opportunities */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Explore PMHNP Opportunities</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/jobs/remote" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">🏠</span>
              <h3 className="font-semibold text-gray-900 mt-2">Remote Jobs</h3>
            </Link>
            <Link href="/jobs/telehealth" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">💻</span>
              <h3 className="font-semibold text-gray-900 mt-2">Telehealth Jobs</h3>
            </Link>
            <Link href="/jobs/travel" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">✈️</span>
              <h3 className="font-semibold text-gray-900 mt-2">Travel Jobs</h3>
            </Link>
            <Link href="/jobs/new-grad" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">🎓</span>
              <h3 className="font-semibold text-gray-900 mt-2">New Grad Jobs</h3>
            </Link>
            <Link href="/jobs/per-diem" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">⏰</span>
              <h3 className="font-semibold text-gray-900 mt-2">Per Diem Jobs</h3>
            </Link>
            <Link href="/jobs/locations" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">📍</span>
              <h3 className="font-semibold text-gray-900 mt-2">Jobs by Location</h3>
            </Link>
            <Link href="/salary-guide" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">💰</span>
              <h3 className="font-semibold text-gray-900 mt-2">Salary Guide</h3>
            </Link>
            <Link href="/jobs" className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm text-center transition-all">
              <span className="text-2xl">🔍</span>
              <h3 className="font-semibold text-gray-900 mt-2">All Jobs</h3>
            </Link>
          </div>
        </div>
      </section>

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

      {/* Salary Guide Section */}
      <SalaryGuideSection />


      {/* Job Alerts Section */}
      <section id="subscribe" className="bg-blue-50 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Get PMHNP Job Alerts
          </h2>
          <p className="text-gray-700 mb-8">
            New psychiatric nurse practitioner jobs delivered to your inbox
          </p>
          <HomepageJobAlertForm />
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
