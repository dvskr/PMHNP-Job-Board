import { Metadata } from 'next';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import VideoJsonLd from '@/components/VideoJsonLd';
import { CheckCircle, Users, DollarSign, Bell, Target, TrendingUp, Award, Mail, Briefcase, MapPin, RefreshCw, Database, FileText, Shield, BarChart3 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Us | PMHNP Hiring - The #1 Job Board for Psychiatric NPs',
  description: 'Learn about PMHNP Hiring - the #1 dedicated job board for Psychiatric Mental Health Nurse Practitioners. 10,000+ jobs from 3,000+ companies across 50 states.',
  openGraph: {
    images: [
      {
        url: '/images/pages/about-pmhnp-hiring-platform.webp',
        width: 1280,
        height: 900,
        alt: 'About PMHNP Hiring platform showing mission, methodology, and data sources for psychiatric nurse practitioner job board',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/images/pages/about-pmhnp-hiring-platform.webp'],
  },
  alternates: {
    canonical: 'https://pmhnphiring.com/about',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <VideoJsonLd pathname="/about" />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'About', url: 'https://pmhnphiring.com/about' },
      ]} />
      {/* Hero Section */}
      <section className="py-20 px-4" style={{ background: 'var(--bg-secondary)' }}>
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>About PMHNP Hiring</h1>
          <p className="text-xl md:text-2xl max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            The #1 dedicated job board for Psychiatric Mental Health Nurse Practitioners — trusted by thousands of PMHNPs nationwide
          </p>
        </div>
      </section>

      {/* By The Numbers Stats Row */}
      <section className="border-y py-8 px-4" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <Briefcase className="w-5 h-5 text-emerald-600" />
                <span className="text-2xl md:text-3xl font-bold text-emerald-600">10,000+</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Active Jobs</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="w-5 h-5 text-teal-600" />
                <span className="text-2xl md:text-3xl font-bold text-teal-600">3,000+</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Companies</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <MapPin className="w-5 h-5 text-purple-600" />
                <span className="text-2xl md:text-3xl font-bold text-purple-600">51</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>States Covered</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <RefreshCw className="w-5 h-5 text-amber-600" />
                <span className="text-2xl md:text-3xl font-bold text-amber-600">Daily</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Updated</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Mission Section */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <div className="flex items-center gap-3 mb-6">
              <Target className="w-8 h-8 text-primary-600" />
              <h2 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Our Mission</h2>
            </div>
            <div className="space-y-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <p className="text-lg">
                PMHNP Hiring exists to be the most comprehensive and transparent career resource for
                Psychiatric Mental Health Nurse Practitioners. We aggregate, verify, and enrich job data
                from hundreds of sources to provide PMHNPs with accurate salary information, real-time
                job listings, and data-driven career insights.
              </p>
              <p>
                Our platform analyzes thousands of job postings daily to deliver the salary transparency
                and career data that PMHNPs deserve — helping practitioners make informed decisions about
                where to work, what to negotiate, and how to advance their careers.
              </p>
            </div>
          </Card>
        </section>

        {/* What We Offer Section */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: 'var(--text-primary)' }}>What We Offer</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* For Job Seekers */}
            <Card padding="lg" variant="bordered">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-7 h-7 text-primary-600" />
                <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>For Job Seekers</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>10,000+ Job Listings</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aggregated from multiple sources, updated daily</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Salary Transparency</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>See salary ranges and compensation details upfront</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Job Alerts</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Get notified when new opportunities match your criteria</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>100% Free</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No hidden fees, no subscriptions required</p>
                  </div>
                </li>
              </ul>
            </Card>

            {/* For Employers */}
            <Card padding="lg" variant="bordered">
              <div className="flex items-center gap-3 mb-6">
                <Award className="w-7 h-7 text-primary-600" />
                <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>For Employers</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Targeted Audience</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Reach qualified PMHNPs actively seeking opportunities</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Post Jobs for Free</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Post your job for free during our launch period</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Featured Placement</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Get your posting to the top of search results</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Analytics & Tracking</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>View counts, apply clicks, and performance metrics</p>
                  </div>
                </li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Our Data & Methodology Section */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <div className="flex items-center gap-3 mb-6">
              <Database className="w-8 h-8 text-primary-600" />
              <h2 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Our Data & Methodology</h2>
            </div>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
              Accuracy and transparency are at the core of everything we do. Here&apos;s how we ensure
              the data on PMHNP Hiring is reliable and up-to-date:
            </p>

            <div className="space-y-6">
              {/* Job Data Collection */}
              <div className="rounded-lg p-5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-5 h-5 text-teal-600" />
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Job Data Collection</h3>
                </div>
                <p className="" style={{ color: 'var(--text-secondary)' }}>
                  We aggregate PMHNP job postings from multiple verified sources including direct employer
                  postings, healthcare staffing agencies, and major job platforms. Every listing is filtered
                  for relevance to ensure only genuine PMHNP positions appear on our platform.
                </p>
              </div>

              {/* Salary Data Sources */}
              <div className="rounded-lg p-5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Salary Data Sources</h3>
                </div>
                <p className="text-gray-600 mb-3">
                  Our salary guide combines data from multiple authoritative sources:
                </p>
                <ul className="grid grid-cols-2 gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    Bureau of Labor Statistics (BLS)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ZipRecruiter
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    Indeed
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    PayScale
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    Glassdoor
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    CompHealth
                  </li>
                </ul>
                <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
                  We also analyze 10,000+ active job postings on our platform and cross-reference multiple
                  sources to provide the most accurate salary picture possible.
                </p>
              </div>

              {/* Data Updates */}
              <div className="rounded-lg p-5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <RefreshCw className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Data Updates</h3>
                </div>
                <p className="" style={{ color: 'var(--text-secondary)' }}>
                  Job listings are refreshed daily. Salary guide data is reviewed and updated monthly.
                  State-by-state comparisons include cost-of-living adjustments using current economic data.
                </p>
              </div>

              {/* Editorial Standards */}
              <div className="rounded-lg p-5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Editorial Standards</h3>
                </div>
                <p className="" style={{ color: 'var(--text-secondary)' }}>
                  All content on PMHNP Hiring is researched and fact-checked against authoritative sources.
                  Our salary data is never inflated or manipulated. When our platform data differs from
                  industry averages, we clearly label both data sets so PMHNPs can make informed comparisons.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Why We Built This Section */}
        <section className="mb-12">
          <Card padding="lg" variant="default">
            <h2 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Why We Built This</h2>
            <div className="space-y-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <p>
                The idea for PMHNP Hiring came from a simple observation: Psychiatric Mental Health Nurse
                Practitioners were underserved by existing job boards. General nursing job sites were
                cluttered with irrelevant positions, and it took hours to find PMHNP-specific opportunities
                scattered across multiple platforms.
              </p>
              <p>
                We noticed that PMHNPs were spending valuable time searching through hundreds of listings
                that weren&apos;t relevant to their specialization. Meanwhile, employers looking to hire PMHNPs
                struggled to reach the right candidates in an efficient, cost-effective way.
              </p>
              <p>
                We built PMHNP Hiring to bridge this gap. Our goal is simple: create a dedicated space where
                PMHNPs can quickly find relevant opportunities, and where employers can connect with qualified
                candidates without breaking the bank.
              </p>
              <p className="font-medium border-l-4 border-emerald-500 pl-4 py-3 rounded-r-lg" style={{ color: 'var(--text-primary)', background: 'rgba(16,185,129,0.1)' }}>
                Today, PMHNP Hiring is the largest dedicated job board for psychiatric mental health nurse
                practitioners, with over 10,000+ active positions from 3,000+ companies across 50 states.
                We&apos;re committed to providing the most comprehensive, accurate, and transparent PMHNP
                career resource available.
              </p>
            </div>
          </Card>
        </section>

        {/* For Media & Citations Section */}
        <section className="mb-12">
          <Card padding="lg" variant="bordered">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-7 h-7" style={{ color: 'var(--text-tertiary)' }} />
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>For Media & Citations</h2>
            </div>
            <div className="space-y-4" style={{ color: 'var(--text-secondary)' }}>
              <p>
                Journalists, researchers, and content creators are welcome to cite PMHNP Hiring data with
                attribution. For data inquiries, custom reports, or media requests, please contact us at{' '}
                <a href="mailto:press@pmhnphiring.com" className="text-teal-600 hover:underline font-medium">
                  press@pmhnphiring.com
                </a>.
              </p>
              <div className="rounded-lg p-4" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>When citing our data, please use:</p>
                <p className="font-mono text-sm px-3 py-2 rounded" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                  Source: PMHNP Hiring (pmhnphiring.com), [Month Year]
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Contact Section */}
        <section>
          <Card padding="lg" variant="bordered">
            <div className="text-center">
              <Mail className="w-12 h-12 text-teal-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Get In Touch</h2>
              <p className="mb-6 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Have questions, feedback, or suggestions? We&apos;d love to hear from you.
                We&apos;re always looking to improve and serve the PMHNP community better.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto">
                <a
                  href="mailto:support@pmhnphiring.com"
                  className="inline-flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors w-full sm:w-auto justify-center shadow-md hover:shadow-lg"
                >
                  <Mail size={20} />
                  Email Us
                </a>
                <Link
                  href="/jobs"
                  className="inline-flex items-center gap-2 text-teal-600 px-6 py-3 rounded-lg font-semibold border-2 border-teal-600 hover:bg-teal-50 transition-colors w-full sm:w-auto justify-center shadow-sm hover:shadow-md"
                >
                  Browse Jobs
                </Link>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
