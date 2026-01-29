import { Metadata } from 'next';
import Link from 'next/link';
import { DollarSign, TrendingUp, MapPin, Briefcase, Building2, GraduationCap, ArrowUpRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import SalaryGuideForm from '@/components/SalaryGuideForm';

// Enable ISR with daily revalidation
export const revalidate = 86400;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// State codes mapping
const STATE_CODES: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

interface StateSalary {
  state: string;
  stateCode: string;
  avgSalary: number;
  minSalary: number;
  maxSalary: number;
  jobCount: number;
  slug: string;
}

/**
 * Fetch salary data by state from database
 */
async function getSalaryByState(): Promise<StateSalary[]> {
  const stateData = await prisma.job.groupBy({
    by: ['state'],
    where: {
      isPublished: true,
      state: { not: null },
      normalizedMinSalary: { not: null },
    },
    _avg: {
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
    },
    _min: {
      normalizedMinSalary: true,
    },
    _max: {
      normalizedMaxSalary: true,
    },
    _count: {
      id: true,
    },
  });

  return stateData
    .filter(s => s.state && s._avg.normalizedMinSalary)
    .map(s => ({
      state: s.state!,
      stateCode: STATE_CODES[s.state!] || '',
      avgSalary: Math.round(((s._avg.normalizedMinSalary || 0) + (s._avg.normalizedMaxSalary || 0)) / 2),
      minSalary: Math.round(s._min.normalizedMinSalary || 0),
      maxSalary: Math.round(s._max.normalizedMaxSalary || 0),
      jobCount: s._count.id,
      slug: s.state!.toLowerCase().replace(/\s+/g, '-'),
    }))
    .sort((a, b) => b.avgSalary - a.avgSalary);
}

/**
 * Get overall salary statistics
 */
async function getOverallStats() {
  const stats = await prisma.job.aggregate({
    where: {
      isPublished: true,
      normalizedMinSalary: { not: null },
    },
    _avg: {
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
    },
    _min: {
      normalizedMinSalary: true,
    },
    _max: {
      normalizedMaxSalary: true,
    },
    _count: {
      id: true,
    },
  });

  const avgMin = stats._avg.normalizedMinSalary || 120000;
  const avgMax = stats._avg.normalizedMaxSalary || 150000;

  return {
    avgSalary: Math.round((avgMin + avgMax) / 2),
    minSalary: Math.round(stats._min.normalizedMinSalary || 85000),
    maxSalary: Math.round(stats._max.normalizedMaxSalary || 200000),
    jobsWithSalary: stats._count.id,
  };
}

export const metadata: Metadata = {
  title: 'PMHNP Salary Guide 2026 | Psychiatric NP Pay by State | PMHNP Hiring',
  description: 'Complete PMHNP salary guide for 2026. See average psychiatric nurse practitioner salaries by state, factors affecting pay, remote vs in-person rates, and negotiation tips.',
  keywords: ['pmhnp salary', 'psychiatric nurse practitioner salary', 'pmhnp salary by state', 'how much do pmhnps make', 'pmhnp pay'],
  openGraph: {
    title: 'PMHNP Salary Guide 2026 | Psychiatric NP Pay by State',
    description: 'Complete guide to PMHNP salaries. Average pay, state-by-state breakdown, and tips to maximize your earnings.',
    type: 'website',
    url: `${BASE_URL}/salary-guide`,
  },
  alternates: {
    canonical: '/salary-guide',
  },
};

export default async function SalaryGuidePage() {
  const [stateSalaries, overallStats] = await Promise.all([
    getSalaryByState(),
    getOverallStats(),
  ]);

  const topPayingStates = stateSalaries.slice(0, 5);
  const currentYear = new Date().getFullYear();

  // FAQ Schema
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How much do PMHNPs make?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The average PMHNP salary in ${currentYear} is approximately $${Math.round(overallStats.avgSalary / 1000)}k per year, with a typical range of $${Math.round(overallStats.minSalary / 1000)}k to $${Math.round(overallStats.maxSalary / 1000)}k depending on location, experience, and setting.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Which state pays PMHNPs the most?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: topPayingStates.length > 0
            ? `${topPayingStates[0].state} typically offers the highest PMHNP salaries, with averages around $${Math.round(topPayingStates[0].avgSalary / 1000)}k. Other high-paying states include ${topPayingStates.slice(1, 4).map(s => s.state).join(', ')}.`
            : 'California, New York, and Massachusetts typically offer the highest PMHNP salaries.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do remote PMHNPs make less than in-person?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Remote PMHNP positions often pay comparably to in-person roles, and sometimes more due to the flexibility and expanded patient access they provide. Telehealth PMHNPs typically earn $120,000-$180,000 annually.',
        },
      },
      {
        '@type': 'Question',
        name: 'What factors affect PMHNP salary?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Key factors affecting PMHNP salary include: geographic location, years of experience, practice setting (private practice vs hospital), specialization (addiction, child/adolescent), certifications, and whether the position is W2 or 1099.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much do travel PMHNPs make?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Travel and locum tenens PMHNPs typically earn 20-50% more than permanent positions, with annual compensation ranging from $150,000 to $250,000+ including housing stipends, travel allowances, and benefits.',
        },
      },
    ],
  };

  // Sanitize JSON for safe injection into script tag (escape < to prevent XSS)
  const sanitizeJson = (obj: object): string => {
    return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: sanitizeJson(faqSchema) }}
      />

      <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
        {/* Hero Section - Compact */}
        <section style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', color: 'white', padding: '20px 0' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              {/* Left - Title and Stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <DollarSign style={{ height: '28px', width: '28px' }} />
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                    {currentYear} PMHNP Salary Guide
                  </h1>
                </div>
                <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.3)', display: 'none' }} className="hidden sm:block" />
                {/* Quick Stats Row */}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>${Math.round(overallStats.avgSalary / 1000)}k</span>
                    <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>avg</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>${Math.round(overallStats.minSalary / 1000)}k</span>
                    <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>min</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>${Math.round(overallStats.maxSalary / 1000)}k+</span>
                    <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>max</span>
                  </div>
                </div>
              </div>
              {/* Right - PDF Download Form */}
              <SalaryGuideForm />
            </div>
          </div>
        </section>

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ maxWidth: '1024px', margin: '0 auto' }}>
            {/* Overview Section */}
            <section className="mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  How Much Do PMHNPs Make in {currentYear}?
                </h2>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-600 leading-relaxed mb-4">
                    Psychiatric Mental Health Nurse Practitioners (PMHNPs) are among the highest-paid
                    nursing specialties in the United States. The average PMHNP salary is <strong>${Math.round(overallStats.avgSalary / 1000).toLocaleString()}k per year</strong>,
                    with salaries typically ranging from ${Math.round(overallStats.minSalary / 1000)}k to ${Math.round(overallStats.maxSalary / 1000)}k+
                    depending on location, experience, and practice setting.
                  </p>
                  <p className="text-gray-600 leading-relaxed mb-4">
                    The demand for PMHNPs continues to grow due to the nationwide mental health crisis
                    and shortage of psychiatric providers. This high demand translates to competitive
                    salaries, sign-on bonuses, and excellent benefits for qualified practitioners.
                  </p>
                  <p className="text-gray-600 leading-relaxed">
                    Based on our analysis of <strong>{overallStats.jobsWithSalary.toLocaleString()} job postings</strong> with
                    salary data, here&apos;s what you can expect to earn as a PMHNP.
                  </p>
                </div>
              </div>
            </section>

            {/* Salary by State Table */}
            {stateSalaries.length > 0 && (
              <section className="mb-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-6 w-6 text-emerald-600" />
                      <h2 className="text-2xl font-bold text-gray-900">PMHNP Salary by State</h2>
                    </div>
                    <p className="text-gray-600">
                      See how PMHNP salaries compare across different states. Click any state to view available jobs.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            State
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Avg. Salary
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                            Salary Range
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Jobs
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">

                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {stateSalaries.map((state, index) => (
                          <tr key={state.state} className={index < 3 ? 'bg-emerald-50/50' : 'hover:bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {index < 3 && (
                                  <span className="flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                                    {index + 1}
                                  </span>
                                )}
                                <div>
                                  <div className="font-medium text-gray-900">{state.state}</div>
                                  <div className="text-sm text-gray-500">{state.stateCode}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <span className="font-semibold text-gray-900">
                                ${Math.round(state.avgSalary / 1000)}k
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600 hidden sm:table-cell">
                              ${Math.round(state.minSalary / 1000)}k - ${Math.round(state.maxSalary / 1000)}k
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {state.jobCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <Link
                                href={`/jobs/state/${state.slug}`}
                                className="inline-flex items-center text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                              >
                                View Jobs
                                <ArrowUpRight className="ml-1 h-4 w-4" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* Factors Affecting Salary */}
            <section className="mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                  <h2 className="text-2xl font-bold text-gray-900">Factors Affecting PMHNP Salary</h2>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                  <div style={{ flex: '1 1 280px', minWidth: '250px' }}>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Geographic Location</h3>
                        <p className="text-sm text-gray-600">
                          States with higher cost of living and greater demand (CA, NY, MA) typically
                          offer 20-40% higher salaries than rural areas.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <GraduationCap className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Experience Level</h3>
                        <p className="text-sm text-gray-600">
                          Entry-level PMHNPs start around $100-120k. With 5+ years experience,
                          salaries can reach $150-180k or more.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                        <Briefcase className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Employment Type</h3>
                        <p className="text-sm text-gray-600">
                          1099 contractors and travel PMHNPs often earn 20-50% more than W2 employees,
                          though without traditional benefits.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: '1 1 280px', minWidth: '250px' }}>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Practice Setting</h3>
                        <p className="text-sm text-gray-600">
                          Private practice and telehealth positions often pay more than hospital or
                          community health settings.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Specialization</h3>
                        <p className="text-sm text-gray-600">
                          Subspecialties like addiction psychiatry, child/adolescent, or forensic
                          psychiatry can command premium pay.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Negotiation</h3>
                        <p className="text-sm text-gray-600">
                          PMHNPs who negotiate can often secure 5-15% higher starting salaries
                          plus signing bonuses and better benefits.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Salary by Setting */}
            <section className="mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h2 className="text-xl font-bold text-gray-900 mb-4">PMHNP Salary by Setting</h2>
                <div className="space-y-4">
                  {[
                    { setting: 'Private Practice (Owner)', range: '$180,000 - $300,000+', notes: 'Highest earning potential, requires business skills' },
                    { setting: 'Telehealth / Remote', range: '$130,000 - $180,000', notes: 'Growing rapidly, flexible schedules' },
                    { setting: 'Travel / Locum Tenens', range: '$150,000 - $250,000', notes: 'Includes housing, travel, higher hourly rates' },
                    { setting: 'Outpatient Clinic', range: '$120,000 - $160,000', notes: 'Most common setting, steady patient load' },
                    { setting: 'Hospital / Inpatient', range: '$115,000 - $150,000', notes: 'Often includes shift differentials, benefits' },
                    { setting: 'Community Mental Health', range: '$100,000 - $130,000', notes: 'May qualify for loan forgiveness programs' },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h3 className="font-medium text-gray-900">{item.setting}</h3>
                        <p className="text-sm text-gray-500">{item.notes}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-emerald-600">{item.range}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Frequently Asked Questions About PMHNP Salary
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      How much do PMHNPs make?
                    </h3>
                    <p className="text-gray-600">
                      The average PMHNP salary in {currentYear} is approximately ${Math.round(overallStats.avgSalary / 1000)}k per year,
                      with a typical range of ${Math.round(overallStats.minSalary / 1000)}k to ${Math.round(overallStats.maxSalary / 1000)}k+
                      depending on location, experience, and setting. Top earners in high-demand areas
                      can make $200,000 or more.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Which state pays PMHNPs the most?
                    </h3>
                    <p className="text-gray-600">
                      {topPayingStates.length > 0 ? (
                        <>
                          {topPayingStates[0].state} typically offers the highest PMHNP salaries,
                          with averages around ${Math.round(topPayingStates[0].avgSalary / 1000)}k.
                          Other high-paying states include {topPayingStates.slice(1, 4).map(s => s.state).join(', ')}.
                          However, consider cost of living when comparing salaries across states.
                        </>
                      ) : (
                        'California, New York, and Massachusetts typically offer the highest PMHNP salaries, often $150,000+ annually.'
                      )}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Do remote PMHNPs make less than in-person?
                    </h3>
                    <p className="text-gray-600">
                      Not necessarily. Remote/telehealth PMHNP positions often pay comparably to
                      in-person roles, and sometimes more due to the flexibility and expanded patient
                      access they provide. Telehealth PMHNPs typically earn $130,000-$180,000 annually.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      How can I increase my PMHNP salary?
                    </h3>
                    <p className="text-gray-600">
                      To maximize your earning potential: gain experience in high-demand specialties
                      (addiction, child/adolescent), consider travel or locum positions, pursue
                      additional certifications, negotiate your salary and benefits, consider
                      private practice ownership, and be willing to work in underserved areas
                      with higher pay incentives.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      How much do travel PMHNPs make?
                    </h3>
                    <p className="text-gray-600">
                      Travel and locum tenens PMHNPs typically earn 20-50% more than permanent positions,
                      with annual compensation ranging from $150,000 to $250,000+ including housing stipends,
                      travel allowances, and benefits. Hourly rates range from $80-150+.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* CTA Section */}
            <section>
              <div style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', borderRadius: '8px', padding: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', color: 'white' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                    Find Your Next High-Paying PMHNP Job
                  </h2>
                  <p style={{ color: '#a7f3d0', margin: 0, fontSize: '0.875rem' }}>
                    Browse positions with competitive salaries. Filter by location, salary, and work type.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <Link
                    href="/jobs"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', background: 'white', color: '#047857', borderRadius: '6px', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                  >
                    Browse Jobs
                  </Link>
                  <Link
                    href="/jobs/remote"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                  >
                    Remote
                  </Link>
                  <Link
                    href="/jobs/travel"
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                  >
                    Travel
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
