import { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, DollarSign, Briefcase, Users, FileText, TrendingUp } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PMHNP Resources & Career Guides',
  description: 'Free resources for psychiatric nurse practitioners. Salary guides, career tips, interview prep, remote work advice, and job search strategies.',
  keywords: [
    'pmhnp resources',
    'psychiatric nurse practitioner career',
    'pmhnp salary guide',
    'pmhnp interview tips',
    'pmhnp job search',
  ],
};

const resources = [
  {
    href: '/salary-guide',
    icon: DollarSign,
    title: '2026 PMHNP Salary Guide',
    description: 'Complete breakdown of PMHNP salaries by state, setting, and experience level. Download the free PDF.',
    category: 'Salary',
    readTime: '8 min read',
    color: 'bg-green-50 text-green-600',
  },
  {
    href: '/for-job-seekers',
    icon: Briefcase,
    title: 'Job Seeker Guide',
    description: 'Tips and strategies for finding your ideal PMHNP position. From resume tips to interview prep.',
    category: 'Career',
    readTime: '10 min read',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    href: '/jobs/remote',
    icon: Users,
    title: 'Remote PMHNP Jobs Guide',
    description: 'Everything you need to know about telehealth and remote psychiatric nursing positions.',
    category: 'Remote Work',
    readTime: '7 min read',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    href: '/jobs/travel',
    icon: TrendingUp,
    title: 'Travel PMHNP Guide',
    description: 'High-paying travel assignments and locum positions. Learn about requirements and pay rates.',
    category: 'Travel',
    readTime: '6 min read',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    href: '/for-employers',
    icon: FileText,
    title: 'Employer Hiring Guide',
    description: 'Best practices for hiring PMHNPs. Job posting tips, salary benchmarks, and recruitment strategies.',
    category: 'Employers',
    readTime: '5 min read',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    href: '/faq',
    icon: BookOpen,
    title: 'FAQ & Help Center',
    description: 'Answers to common questions about PMHNP careers, certifications, and using our job board.',
    category: 'Help',
    readTime: '4 min read',
    color: 'bg-gray-50 text-gray-600',
  },
];

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-6">
              <BookOpen className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              PMHNP Resources & Guides
            </h1>
            <p className="text-lg md:text-xl text-blue-100">
              Free career resources, salary data, and job search strategies for psychiatric nurse practitioners.
            </p>
          </div>
        </div>
      </section>

      {/* Resources Grid */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {resources.map((resource) => {
                const Icon = resource.icon;
                return (
                  <Link
                    key={resource.href}
                    href={resource.href}
                    className="group block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-blue-200 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg ${resource.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            {resource.category}
                          </span>
                          <span className="text-xs text-gray-500">{resource.readTime}</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                          {resource.title}
                        </h2>
                        <p className="text-gray-600 text-sm">
                          {resource.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Ready to Find Your Next PMHNP Role?
            </h2>
            <p className="text-gray-600 mb-8">
              Browse thousands of psychiatric nurse practitioner positions updated daily.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/jobs"
                className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Browse Jobs
              </Link>
              <Link
                href="/job-alerts"
                className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg font-medium border border-blue-200 hover:bg-blue-50 transition-colors"
              >
                Set Up Job Alerts
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
