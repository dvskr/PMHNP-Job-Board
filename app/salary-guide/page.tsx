import { Metadata } from 'next';
import Link from 'next/link';
import { DollarSign, TrendingUp, MapPin, Briefcase, Building2, GraduationCap, ArrowUpRight, Clock, Users, BarChart3, Shield, Award } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import SalaryGuideForm from '@/components/SalaryGuideForm';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CopyCitation from '@/components/CopyCitation';

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
  title: 'PMHNP Salary Guide 2026 | $155,000+ Average | Psychiatric NP Pay by State',
  description: 'Complete PMHNP salary guide for 2026. National average $155,000+, top 10% earn $210,000+. See psychiatric nurse practitioner salaries by state, experience level, and specialty.',
  keywords: ['pmhnp salary', 'psychiatric nurse practitioner salary', 'pmhnp salary by state', 'how much do pmhnps make', 'pmhnp pay', 'pmhnp salary 2026'],
  openGraph: {
    title: 'PMHNP Salary Guide 2026 | $155,000+ Average',
    description: 'Complete guide to PMHNP salaries. National average $155,000+, top 10% earn $210,000+. State-by-state breakdown and tips to maximize earnings.',
    type: 'website',
    url: `${BASE_URL}/salary-guide`,
  },
  alternates: {
    canonical: 'https://pmhnphiring.com/salary-guide',
  },
};

export default async function SalaryGuidePage() {
  const [stateSalaries, overallStats] = await Promise.all([
    getSalaryByState(),
    getOverallStats(),
  ]);

  const currentYear = new Date().getFullYear();

  // FAQ Schema - Updated with authoritative industry data
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How much do PMHNPs make in 2026?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The national average PMHNP salary is $155,000+ per year in 2026, based on data from BLS, ZipRecruiter, Indeed, PayScale, Glassdoor, and CompHealth. The top 10% earn $210,000 or more. New graduates start at $115,000-$145,000, while experienced PMHNPs earn $180,000-$210,000.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which state pays PMHNPs the most?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Idaho offers the highest PMHNP salary at $205,080 per year, followed by New Jersey ($182,022), California ($181,670), Rhode Island ($175,530), and Washington ($173,331). When adjusted for cost of living, Idaho, Louisiana, Pennsylvania, Arkansas, and Missouri offer the best value.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do telehealth PMHNPs make less than in-person?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Telehealth PMHNPs earn $130,000 to $175,000, while in-person PMHNPs earn $145,000 to $185,000. However, telehealth offers excellent flexibility and some companies like Talkiatry pay $180,000-$215,000+ for experienced PMHNPs with multi-state licenses.',
        },
      },
      {
        '@type': 'Question',
        name: 'How can I increase my PMHNP salary?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Top strategies include: specializing in high-demand areas like addiction psychiatry (+15-20% premium) or forensic psychiatry (+15-25%), practicing in Full Practice Authority states (+12-15% premium), considering private practice ownership ($180,000-$300,000+), working in rural/underserved areas for loan repayment incentives, and always negotiating total compensation including sign-on bonuses ($5,000-$30,000), CME allowance, and PTO.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much do travel PMHNPs make?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Travel and locum tenens PMHNPs typically earn 20-50% more than permanent positions, with compensation ranging from $150,000 to $250,000+ including housing stipends and travel allowances.',
        },
      },
    ],
  };

  // Article Schema
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "2026 PMHNP Salary Guide: Psychiatric NP Pay by State",
    "description": "Comprehensive PMHNP salary data for 2026 including state-by-state pay, experience levels, specialty premiums, and market trends. Based on BLS, ZipRecruiter, Indeed, and 10,000+ job postings.",
    "image": "https://pmhnphiring.com/og-salary-guide.png",
    "datePublished": "2026-01-01T00:00:00Z",
    "dateModified": "2026-02-02T00:00:00Z",
    "author": {
      "@type": "Organization",
      "name": "PMHNP Hiring",
      "url": "https://pmhnphiring.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://pmhnphiring.com/logo.svg"
      }
    },
    "publisher": {
      "@type": "Organization",
      "name": "PMHNP Hiring",
      "url": "https://pmhnphiring.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://pmhnphiring.com/logo.svg"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "https://pmhnphiring.com/salary-guide"
    }
  };

  // Sanitize JSON for safe injection into script tag (escape < to prevent XSS)
  const sanitizeJson = (obj: object): string => {
    return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary, #FFFFFF)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: sanitizeJson(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: sanitizeJson(articleSchema) }}
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Salary Guide", url: "https://pmhnphiring.com/salary-guide" }
      ]} />
      {/* Last Updated Notice */}
      <div style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)', borderBottom: '1px solid var(--border-color, #E5E7EB)', padding: '8px 16px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-tertiary, #6B7280)', fontSize: '0.75rem', margin: 0 }}>
            Last Updated: February 2026 | Sources: BLS, ZipRecruiter, Indeed, PayScale, Glassdoor, CompHealth
          </p>
        </div>
      </div>

      {/* Hero Section - Compact with Industry Stats */}
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
              {/* Quick Stats Row - Industry Data */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>$155,000+</span>
                  <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>avg</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>$115,000</span>
                  <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>entry</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>$210,000+</span>
                  <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>top 10%</span>
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
          {/* Quick Answer Box */}
          <section style={{ marginBottom: '24px' }}>
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '24px' }}>
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0" style={{ width: '40px', height: '40px', backgroundColor: 'var(--bg-tertiary, #F3F4F6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChart3 className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary, #111827)', marginBottom: '8px' }}>Quick Answer: PMHNP Salary in 2026</h2>
                  <p style={{ color: 'var(--text-secondary, #374151)', lineHeight: '1.625' }}>
                    The average PMHNP salary is <strong>$155,000+ per year</strong> in 2026. The top 10% earn <strong>$210,000+</strong>.
                    New graduates start at $115,000-$145,000, while experienced PMHNPs (7-15 years) earn $180,000-$210,000.
                    Private practice owners can earn $180,000-$300,000+. The highest-paying state is Idaho at $205,080,
                    followed by New Jersey ($182,022) and California ($181,670).
                  </p>
                </div>
              </div>
              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color, #E5E7EB)' }}>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">$155,000+</div>
                  <div className="text-sm text-gray-600 " style={{ color: 'var(--text-tertiary)' }}>National Average</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">$210,000+</div>
                  <div className="text-sm text-gray-600 " style={{ color: 'var(--text-tertiary)' }}>Top 10% Earn</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">45%</div>
                  <div className="text-sm text-gray-600 " style={{ color: 'var(--text-tertiary)' }}>Job Growth by 2032</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">10,000+</div>
                  <div className="text-sm text-gray-600 " style={{ color: 'var(--text-tertiary)' }}>Jobs Analyzed</div>
                </div>
              </div>
            </div>
          </section>

          {/* Overview Section */}
          <section style={{ marginBottom: '24px' }}>
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)', marginBottom: '16px' }}>
                How Much Do PMHNPs Make in {currentYear}?
              </h2>
              <div className="prose prose-gray max-w-none">
                <p style={{ color: 'var(--text-secondary, #374151)', lineHeight: '1.625', marginBottom: '16px' }}>
                  Psychiatric Mental Health Nurse Practitioners (PMHNPs) are among the highest-paid
                  nursing specialties in the United States. The national average PMHNP salary is <strong>$155,000+ per year</strong> in 2026,
                  with the top 10% earning <strong>$210,000 or more</strong>. Job growth is projected at 45% through 2032,
                  making it one of the fastest-growing healthcare professions.
                </p>
                <p style={{ color: 'var(--text-tertiary, #6B7280)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                  Salary data compiled from the Bureau of Labor Statistics (BLS), ZipRecruiter, Indeed, PayScale,
                  Glassdoor, and CompHealth (January 2026).
                </p>
              </div>
            </div>
          </section>

          {/* Salary by State Table */}
          {stateSalaries.length > 0 && (
            <section className="mb-6">
              <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color, #E5E7EB)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-6 w-6 text-emerald-600" />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>PMHNP Salary by State</h2>
                  </div>
                  <p style={{ color: 'var(--text-secondary, #374151)', marginBottom: '12px' }}>
                    See how PMHNP salaries compare across different states. Click any state to view available jobs.
                  </p>
                  <div style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #374151)', margin: 0 }}>
                      <strong>Note:</strong> The table below shows real-time salary data from active PMHNP job postings on our platform.
                      For comprehensive state-by-state data including cost-of-living adjustments and practice authority status,
                      download our full 2026 PMHNP Salary Guide PDF.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto" suppressHydrationWarning>
                  <table className="w-full" suppressHydrationWarning>
                    <thead style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)' }}>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          State
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Avg. Salary
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider hidden sm:table-cell">
                          Salary Range
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Jobs
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200" suppressHydrationWarning>
                      {stateSalaries.map((state, index) => (
                        <tr key={state.state} className={index < 3 ? '' : 'hover:bg-gray-50'} style={index < 3 ? { backgroundColor: 'rgba(236, 253, 245, 0.5)' } : undefined}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {index < 3 && (
                                <span className="flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                                  {index + 1}
                                </span>
                              )}
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">{state.state}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">{state.stateCode}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              ${Math.round(state.avgSalary / 1000)}k
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600 dark:text-gray-300 hidden sm:table-cell">
                            ${Math.round(state.minSalary / 1000)}k - ${Math.round(state.maxSalary / 1000)}k
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300">
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

          {/* Salary by Experience Level */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="h-6 w-6 text-emerald-600" />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>PMHNP Salary by Experience Level</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)' }}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>Experience</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>Salary Range</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase hidden md:table-cell" style={{ color: 'var(--text-tertiary)' }}>Typical Roles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {[
                      { exp: 'New Grad (0-1 yr)', range: '$115,000 - $145,000', roles: 'Staff PMHNP, Outpatient Clinic' },
                      { exp: 'Early Career (1-3 yrs)', range: '$145,000 - $165,000', roles: 'Staff PMHNP, Telehealth Provider' },
                      { exp: 'Mid-Career (3-7 yrs)', range: '$165,000 - $185,000', roles: 'Senior PMHNP, Team Lead' },
                      { exp: 'Experienced (7-15 yrs)', range: '$180,000 - $210,000', roles: 'Clinical Director, Supervisor' },
                      { exp: 'Expert (15+ yrs)', range: '$200,000 - $250,000+', roles: 'Director, Consultant, Private Practice' },
                    ].map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{item.exp}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{item.range}</td>
                        <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>{item.roles}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Salary by Setting */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary, #111827)', marginBottom: '16px' }}>PMHNP Salary by Setting</h2>
              <div className="space-y-4">
                {[
                  { setting: 'Private Practice (Owner)', range: '$180,000 - $300,000+', notes: 'Highest earning potential, requires business skills' },
                  { setting: 'Telehealth / Remote', range: '$130,000 - $180,000', notes: 'Growing rapidly, flexible schedules' },
                  { setting: 'Travel / Locum Tenens', range: '$150,000 - $250,000', notes: 'Includes housing, travel, higher hourly rates' },
                  { setting: 'Outpatient Clinic', range: '$120,000 - $160,000', notes: 'Most common setting, steady patient load' },
                  { setting: 'Hospital / Inpatient', range: '$115,000 - $150,000', notes: 'Often includes shift differentials, benefits' },
                  { setting: 'Community Mental Health', range: '$100,000 - $130,000', notes: 'May qualify for loan forgiveness programs' },
                ].map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)' }}>
                    <div>
                      <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.setting}</h3>
                      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{item.notes}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{item.range}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Specialty Premiums */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-6 w-6 text-emerald-600" />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>PMHNP Specialty Salary Premiums</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)' }}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Specialty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Premium</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {[
                      { specialty: 'Addiction/Substance Abuse (MAT)', premium: '+15-20%', notes: 'High demand, MAT certification' },
                      { specialty: 'Child & Adolescent', premium: '+10-15%', notes: 'Specialized training required' },
                      { specialty: 'Forensic Psychiatry', premium: '+15-25%', notes: 'Correctional facilities, courts' },
                      { specialty: 'Emergency/Crisis', premium: '+10-20%', notes: 'Dynamic environment, flexible scheduling' },
                      { specialty: 'Geriatric Psychiatry', premium: '+5-10%', notes: 'Growing aging population' },
                      { specialty: 'Private Practice (Owner)', premium: '+20-40%', notes: 'Higher risk, no benefits' },
                      { specialty: 'Rural/Underserved', premium: '+10-15%', notes: 'Often includes loan repayment' },
                    ].map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{item.specialty}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{item.premium}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{item.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Full Practice Authority Impact */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-6 w-6 text-emerald-600" />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>Full Practice Authority (FPA) Impact on PMHNP Salary</h2>
              </div>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                <strong>34 states plus DC</strong> now have Full Practice Authority. PMHNPs in FPA states earn <strong>12-15% more</strong> on average.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '16px' }}>
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>✓ Full Practice Authority</h3>
                  <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                    <li>• +12-15% salary premium</li>
                    <li>• Can own practice independently</li>
                    <li>• Full clinical independence</li>
                  </ul>
                </div>
                <div style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '16px' }}>
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Restricted/Reduced Practice</h3>
                  <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                    <li>• Baseline salary</li>
                    <li>• Requires physician collaboration</li>
                    <li>• Physician oversight required</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 2026 Market Trends */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>2026 PMHNP Market Trends</h2>
              </div>
              <div className="overflow-x-auto mb-4">
                <table className="w-full">
                  <thead style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)' }}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Metric</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">2024</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">2025</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">2026</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-700">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">Average Salary</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">$158,000</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">$162,000</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">$165,000</td>
                    </tr>
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-700">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">Job Postings (Monthly)</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">12,500</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">14,200</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">15,800</td>
                    </tr>
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-700">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">Telehealth %</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">48%</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">55%</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">62%</td>
                    </tr>
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-700">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">Time to Fill (days)</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">45</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">38</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">32</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '16px' }}>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>Why Demand is High</h3>
                <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <li>• <strong>123 million</strong> Americans in areas seeking more mental health providers</li>
                  <li>• <strong>6,203</strong> additional providers needed to meet demand</li>
                  <li>• <strong>45%</strong> projected NP job growth through 2032</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Factors Affecting Salary */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>Factors Affecting PMHNP Salary</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                <div style={{ flex: '1 1 280px', minWidth: '250px' }}>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Geographic Location</h3>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Experience Level</h3>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Entry-level PMHNPs start around $115-145k. With 5+ years experience,
                        salaries can reach $180-210k or more.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Employment Type</h3>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Practice Setting</h3>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Specialization</h3>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Subspecialties like addiction psychiatry, child/adolescent, or forensic
                        psychiatry can command premium pay (+10-25%).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Negotiation</h3>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        PMHNPs who negotiate can often secure 5-15% higher starting salaries
                        plus signing bonuses ($5,000-$30,000) and better benefits.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Frequently Asked Questions About PMHNP Salary
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    How much do PMHNPs make in 2026?
                  </h3>
                  <p className="" style={{ color: 'var(--text-secondary)' }}>
                    The national average PMHNP salary is <strong>$155,000+ per year</strong> in 2026, based on data from BLS,
                    ZipRecruiter, Indeed, PayScale, Glassdoor, and CompHealth. The top 10% earn <strong>$210,000 or more</strong>.
                    New graduates start at $115,000-$145,000, while experienced PMHNPs earn $180,000-$210,000.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Which state pays PMHNPs the most?
                  </h3>
                  <p className="" style={{ color: 'var(--text-secondary)' }}>
                    Idaho offers the highest PMHNP salary at <strong>$205,080 per year</strong>, followed by New Jersey ($182,022),
                    California ($181,670), Rhode Island ($175,530), and Washington ($173,331). When adjusted for cost of living,
                    Idaho, Louisiana, Pennsylvania, Arkansas, and Missouri offer the best value.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Do telehealth PMHNPs make less than in-person?
                  </h3>
                  <p className="" style={{ color: 'var(--text-secondary)' }}>
                    Telehealth PMHNPs earn $130,000 to $175,000, while in-person PMHNPs earn $145,000 to $185,000.
                    However, telehealth offers excellent flexibility and some companies like Talkiatry pay
                    <strong> $180,000-$215,000+</strong> for experienced PMHNPs with multi-state licenses.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    How can I increase my PMHNP salary?
                  </h3>
                  <p className="" style={{ color: 'var(--text-secondary)' }}>
                    Top strategies include: specializing in high-demand areas like addiction psychiatry (+15-20% premium)
                    or forensic psychiatry (+15-25%), practicing in Full Practice Authority states (+12-15% premium),
                    considering private practice ownership ($180,000-$300,000+), working in rural/underserved areas
                    for loan repayment incentives, and always negotiating total compensation including sign-on bonuses
                    ($5,000-$30,000), CME allowance, and PTO.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    How much do travel PMHNPs make?
                  </h3>
                  <p className="" style={{ color: 'var(--text-secondary)' }}>
                    Travel and locum tenens PMHNPs typically earn <strong>20-50% more</strong> than permanent positions,
                    with compensation ranging from $150,000 to $250,000+ including housing stipends and travel allowances.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Data Sources & Methodology */}
          <section className="mb-6">
            <div style={{ backgroundColor: 'var(--bg-tertiary, #F3F4F6)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <strong>Data Sources & Methodology:</strong> Salary data compiled from Bureau of Labor Statistics (BLS),
                ZipRecruiter, Indeed, PayScale, Glassdoor, CompHealth, and analysis of 10,000+ active PMHNP job postings
                on PMHNP Hiring. Industry data updated January 2026. Real-time job posting data updated daily.
              </p>
            </div>
          </section>

          {/* Cite This Page */}
          <div style={{ backgroundColor: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: '8px', padding: '24px', marginBottom: '32px', marginTop: '32px' }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>📋 Cite This Page</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Use the following citation when referencing data from this salary guide:</p>

            <CopyCitation citation={`PMHNP Hiring. "2026 PMHNP Salary Guide: Psychiatric NP Pay by State." PMHNP Hiring, February 2026, pmhnphiring.com/salary-guide.`} />

            <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>For media inquiries or custom data requests, contact press@pmhnphiring.com</p>
          </div>

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
                  href="/jobs/telehealth"
                  style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                >
                  Telehealth
                </Link>
                <Link
                  href="/jobs/travel"
                  style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                >
                  Travel
                </Link>
                <Link
                  href="/jobs/new-grad"
                  style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                >
                  New Grad
                </Link>
                <Link
                  href="/jobs/per-diem"
                  style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '6px', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                >
                  Per Diem
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
