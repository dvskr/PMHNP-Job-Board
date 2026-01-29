import { Metadata } from 'next';
import Link from 'next/link';
import { Plane, DollarSign, Clock, MapPin, Bell, CheckCircle, Building2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';

// Enable ISR - revalidate every hour
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// Travel/locum related keywords
const TRAVEL_KEYWORDS = [
  'travel',
  'locum',
  'locums',
  'assignment',
  'temporary',
  'contract',
  'per diem',
  'prn',
  'temp',
  'traveling',
  'traveler',
];

/**
 * Fetch travel/locum PMHNP jobs
 */
async function getTravelJobs() {
  // Build OR conditions for travel-related keywords in title
  const titleConditions = TRAVEL_KEYWORDS.map(keyword => ({
    title: {
      contains: keyword,
      mode: 'insensitive' as const,
    },
  }));

  // Also check description for travel terms
  const descriptionConditions = ['travel assignment', 'locum tenens', 'travel position', 'locum position'].map(term => ({
    description: {
      contains: term,
      mode: 'insensitive' as const,
    },
  }));

  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [
        ...titleConditions,
        ...descriptionConditions,
        { jobType: { in: ['Contract', 'Temporary', 'Per Diem', 'PRN'] } },
      ],
    },
    orderBy: [
      { isFeatured: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 100,
  });

  return jobs;
}

/**
 * Get statistics for travel jobs
 */
async function getTravelStats(jobs: Job[]) {
  const totalJobs = jobs.length;

  // Calculate average salary from jobs with salary data
  const jobsWithSalary = jobs.filter(j => j.normalizedMinSalary || j.normalizedMaxSalary);
  let avgSalary = 0;
  let minSalary = 0;
  let maxSalary = 0;

  if (jobsWithSalary.length > 0) {
    const salaries = jobsWithSalary.map(j => {
      const min = j.normalizedMinSalary || j.normalizedMaxSalary || 0;
      const max = j.normalizedMaxSalary || j.normalizedMinSalary || 0;
      return (min + max) / 2;
    });
    avgSalary = Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length / 1000);

    const allMin = jobsWithSalary.map(j => j.normalizedMinSalary || j.normalizedMaxSalary || 0);
    const allMax = jobsWithSalary.map(j => j.normalizedMaxSalary || j.normalizedMinSalary || 0);
    minSalary = Math.round(Math.min(...allMin) / 1000);
    maxSalary = Math.round(Math.max(...allMax) / 1000);
  }

  // Get top employers
  const employerCounts = jobs.reduce((acc, job) => {
    acc[job.employer] = (acc[job.employer] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topEmployers = Object.entries(employerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Get states with most travel jobs
  const stateCounts = jobs.reduce((acc, job) => {
    if (job.state) {
      acc[job.state] = (acc[job.state] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const topStates = Object.entries(stateCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, slug: name.toLowerCase().replace(/\s+/g, '-') }));

  return {
    totalJobs,
    avgSalary,
    minSalary,
    maxSalary,
    topEmployers,
    topStates,
    jobsWithSalary: jobsWithSalary.length,
  };
}

export const metadata: Metadata = {
  title: 'Travel PMHNP Jobs | Locum Psychiatric NP Assignments | PMHNP Hiring',
  description: 'Find travel PMHNP jobs and locum tenens assignments. High-paying psychiatric nurse practitioner positions with flexible schedules across the US. $100-200k+. Apply today!',
  keywords: ['travel pmhnp jobs', 'locum pmhnp', 'travel psychiatric nurse practitioner', 'locum tenens pmhnp', 'contract pmhnp jobs'],
  openGraph: {
    title: 'Travel PMHNP Jobs & Locum Assignments',
    description: 'High-paying travel psychiatric nurse practitioner positions across the US. Flexible schedules, competitive pay, adventure awaits.',
    type: 'website',
    url: `${BASE_URL}/jobs/travel`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Travel PMHNP Jobs & Locum Assignments',
    description: 'Find high-paying travel PMHNP and locum tenens positions.',
  },
  alternates: {
    canonical: '/jobs/travel',
  },
};

export default async function TravelJobsPage() {
  const jobs = await getTravelJobs();
  const stats = await getTravelStats(jobs);

  // FAQ Schema for rich snippets
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is a travel PMHNP?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'A travel PMHNP is a psychiatric mental health nurse practitioner who takes temporary assignments at healthcare facilities across different locations, typically lasting 8-26 weeks. Travel PMHNPs fill staffing gaps, cover leaves of absence, and help facilities meet patient demand.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much do travel PMHNPs make?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Travel PMHNPs typically earn $100,000-$200,000+ annually, significantly higher than permanent positions. Many assignments also include housing stipends ($1,500-$3,000/month), travel reimbursement, health insurance, and 401k matching. Hourly rates range from $75-150+ depending on location and specialty.',
        },
      },
      {
        '@type': 'Question',
        name: 'What are locum tenens PMHNP jobs?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Locum tenens (Latin for "to hold a place") PMHNP jobs are temporary positions where psychiatric nurse practitioners fill in at healthcare facilities. These assignments can range from a few days to several months and offer flexibility, higher pay, and the opportunity to work in different settings and locations.',
        },
      },
      {
        '@type': 'Question',
        name: 'What qualifications do I need for travel PMHNP jobs?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'To work as a travel PMHNP, you typically need: an active PMHNP certification (ANCC or AANP), at least 1-2 years of clinical experience, state licensure (or willingness to obtain compact license), DEA certification, and current BLS/ACLS certifications. Some positions may require additional credentials.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do travel PMHNPs get benefits?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! Most travel PMHNP positions through staffing agencies include comprehensive benefits: health, dental, and vision insurance, 401k with employer matching, housing stipends or free housing, travel reimbursement, license reimbursement, CEU allowances, and referral bonuses.',
        },
      },
    ],
  };

  // Job Posting schema for the page
  const jobListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Travel PMHNP Jobs',
    description: 'Current travel and locum PMHNP job openings',
    numberOfItems: stats.totalJobs,
    itemListElement: jobs.slice(0, 10).map((job, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'JobPosting',
        title: job.title,
        hiringOrganization: {
          '@type': 'Organization',
          name: job.employer,
        },
        jobLocation: {
          '@type': 'Place',
          address: job.location,
        },
        datePosted: job.createdAt,
      },
    })),
  };

  return (
    <>
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobListSchema) }}
      />

      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-indigo-600 via-blue-600 to-blue-700 text-white py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Plane className="h-10 w-10" />
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                Travel PMHNP Jobs & Locum Assignments
              </h1>
              <p className="text-lg md:text-xl text-blue-100 mb-6 max-w-2xl mx-auto">
                High-paying travel psychiatric nurse practitioner positions across the United States.
                Flexible schedules, competitive pay, and new adventures await.
              </p>

              {/* Stats Bar */}
              <div className="flex flex-wrap justify-center gap-6 md:gap-10 mt-8">
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold">{stats.totalJobs}</div>
                  <div className="text-sm text-blue-100">Travel Positions</div>
                </div>
                {stats.avgSalary > 0 && (
                  <div className="text-center">
                    <div className="text-3xl md:text-4xl font-bold">${stats.avgSalary}k</div>
                    <div className="text-sm text-blue-100">Avg. Salary</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold">{stats.topStates.length}+</div>
                  <div className="text-sm text-blue-100">States Hiring</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-10 bg-white border-b border-gray-100">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
                <div style={{ flex: '1 1 200px', maxWidth: '250px', textAlign: 'center', padding: '16px' }}>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Higher Pay</h3>
                  <p className="text-sm text-gray-600">Earn 20-50% more than permanent positions</p>
                </div>
                <div style={{ flex: '1 1 200px', maxWidth: '250px', textAlign: 'center', padding: '16px' }}>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Flexibility</h3>
                  <p className="text-sm text-gray-600">Choose when and where you work</p>
                </div>
                <div style={{ flex: '1 1 200px', maxWidth: '250px', textAlign: 'center', padding: '16px' }}>
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <MapPin className="h-6 w-6 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Adventure</h3>
                  <p className="text-sm text-gray-600">Explore new cities and states</p>
                </div>
                <div style={{ flex: '1 1 200px', maxWidth: '250px', textAlign: 'center', padding: '16px' }}>
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="h-6 w-6 text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Full Benefits</h3>
                  <p className="text-sm text-gray-600">Housing, travel, health insurance</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="max-w-7xl mx-auto">
            {/* Intro Content */}
            <div className="mb-8 md:mb-12">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  About Travel PMHNP & Locum Tenens Positions
                </h2>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-600 leading-relaxed mb-4">
                    Travel PMHNP jobs offer psychiatric mental health nurse practitioners the opportunity
                    to work temporary assignments across the country while earning premium pay. Whether
                    you&apos;re looking for locum tenens positions, contract work, or per diem assignments,
                    the travel healthcare industry provides unmatched flexibility and compensation.
                  </p>
                  <p className="text-gray-600 leading-relaxed mb-4">
                    As a travel PMHNP, you&apos;ll fill critical staffing needs at hospitals, clinics,
                    telehealth companies, and behavioral health facilities. Assignments typically range
                    from 8-26 weeks, with many offering extension opportunities. Most positions include
                    comprehensive benefits packages with housing stipends, travel reimbursement, and
                    competitive hourly rates.
                  </p>
                  {stats.avgSalary > 0 && (
                    <p className="text-gray-600 leading-relaxed">
                      Current travel PMHNP positions are offering average compensation of <strong>${stats.avgSalary}k annually</strong>,
                      {stats.minSalary > 0 && stats.maxSalary > 0 && (
                        <> with salaries ranging from ${stats.minSalary}k to ${stats.maxSalary}k</>
                      )} depending on location, experience, and assignment type.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-4 gap-8">
              {/* Main Content - Jobs List */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Travel & Locum Jobs ({stats.totalJobs})
                  </h2>
                  <Link
                    href="/jobs"
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    View All Jobs →
                  </Link>
                </div>

                {jobs.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <Plane className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No travel jobs found
                    </h3>
                    <p className="text-gray-600 mb-6">
                      We don&apos;t have any travel PMHNP positions listed right now. Check back soon!
                    </p>
                    <Link
                      href="/jobs"
                      className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Browse All Jobs
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-4 md:gap-6">
                    {jobs.map((job: Job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="lg:col-span-1">
                {/* Job Alert CTA */}
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-xl p-6 text-white mb-6 shadow-lg">
                  <Bell className="h-8 w-8 mb-3" />
                  <h3 className="text-lg font-bold mb-2">
                    Travel Job Alerts
                  </h3>
                  <p className="text-sm text-blue-100 mb-4">
                    Get notified about new travel and locum PMHNP positions.
                  </p>
                  <Link
                    href="/job-alerts?keyword=travel"
                    className="block w-full text-center px-4 py-2 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                  >
                    Create Alert
                  </Link>
                </div>

                {/* Top Staffing Agencies */}
                {stats.topEmployers.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <h3 className="font-bold text-gray-900">Top Employers</h3>
                    </div>
                    <ul className="space-y-3">
                      {stats.topEmployers.map((employer, index) => (
                        <li key={index} className="flex items-center justify-between">
                          <span className="text-sm text-gray-700 truncate flex-1">
                            {employer.name}
                          </span>
                          <span className="text-sm font-medium text-blue-600 ml-2">
                            {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Top States */}
                {stats.topStates.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="h-5 w-5 text-green-600" />
                      <h3 className="font-bold text-gray-900">Top States</h3>
                    </div>
                    <ul className="space-y-2">
                      {stats.topStates.map((state, index) => (
                        <li key={index}>
                          <Link
                            href={`/jobs/state/${state.slug}`}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                          >
                            <span className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors">
                              {state.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {state.count} {state.count === 1 ? 'job' : 'jobs'}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Salary Info */}
                {stats.avgSalary > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      <h3 className="font-bold text-gray-900">Salary Range</h3>
                    </div>
                    <div className="mb-3">
                      <div className="text-2xl font-bold text-gray-900">
                        ${stats.minSalary}k - ${stats.maxSalary}k
                      </div>
                      <div className="text-sm text-gray-600">
                        Annual compensation range
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-100">
                      <div className="text-lg font-semibold text-green-600">
                        ${stats.avgSalary}k avg
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Based on {stats.jobsWithSalary} positions with salary data
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FAQ Section */}
            <section className="mt-12 md:mt-16">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Frequently Asked Questions About Travel PMHNP Jobs
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      What is a travel PMHNP?
                    </h3>
                    <p className="text-gray-600">
                      A travel PMHNP is a psychiatric mental health nurse practitioner who takes temporary
                      assignments at healthcare facilities across different locations, typically lasting 8-26 weeks.
                      Travel PMHNPs fill staffing gaps, cover leaves of absence, and help facilities meet patient demand.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      How much do travel PMHNPs make?
                    </h3>
                    <p className="text-gray-600">
                      Travel PMHNPs typically earn $100,000-$200,000+ annually, significantly higher than permanent
                      positions. Many assignments also include housing stipends ($1,500-$3,000/month), travel
                      reimbursement, health insurance, and 401k matching. Hourly rates range from $75-150+
                      depending on location and specialty.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      What are locum tenens PMHNP jobs?
                    </h3>
                    <p className="text-gray-600">
                      Locum tenens (Latin for &quot;to hold a place&quot;) PMHNP jobs are temporary positions where
                      psychiatric nurse practitioners fill in at healthcare facilities. These assignments can
                      range from a few days to several months and offer flexibility, higher pay, and the
                      opportunity to work in different settings and locations.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      What qualifications do I need for travel PMHNP jobs?
                    </h3>
                    <p className="text-gray-600">
                      To work as a travel PMHNP, you typically need: an active PMHNP certification (ANCC or AANP),
                      at least 1-2 years of clinical experience, state licensure (or willingness to obtain compact
                      license), DEA certification, and current BLS/ACLS certifications. Some positions may require
                      additional credentials.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Do travel PMHNPs get benefits?
                    </h3>
                    <p className="text-gray-600">
                      Yes! Most travel PMHNP positions through staffing agencies include comprehensive benefits:
                      health, dental, and vision insurance, 401k with employer matching, housing stipends or free
                      housing, travel reimbursement, license reimbursement, CEU allowances, and referral bonuses.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
