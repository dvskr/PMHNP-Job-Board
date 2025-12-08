import { Metadata } from 'next';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import { CheckCircle, Users, DollarSign, Bell, Target, TrendingUp, Award, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Us | PMHNP Jobs',
  description: 'Learn about PMHNP Jobs - the dedicated job board for Psychiatric Mental Health Nurse Practitioners.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">About PMHNP Jobs</h1>
          <p className="text-xl md:text-2xl text-primary-100 max-w-3xl mx-auto">
            The dedicated job board for Psychiatric Mental Health Nurse Practitioners
          </p>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Mission Section */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <div className="flex items-center gap-3 mb-6">
              <Target className="w-8 h-8 text-primary-600" />
              <h2 className="text-3xl font-bold text-gray-900">Our Mission</h2>
            </div>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p className="text-lg">
                We believe that Psychiatric Mental Health Nurse Practitioners deserve a dedicated job resource 
                that understands their unique career needs and aspirations.
              </p>
              <p>
                PMHNP Jobs was created to solve a simple problem: it's too hard for PMHNPs to find quality job 
                opportunities, and too difficult for employers to connect with qualified candidates. Traditional 
                job boards are cluttered with irrelevant listings, making it time-consuming to find roles that 
                match your specialization.
              </p>
              <p>
                Our platform aggregates opportunities from multiple sources, provides salary transparency, and 
                helps connect PMHNPs with the right opportunities—whether you're looking for remote telehealth 
                positions, hospital roles, or private practice opportunities.
              </p>
            </div>
          </Card>
        </section>

        {/* What We Offer Section */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">What We Offer</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* For Job Seekers */}
            <Card padding="lg" variant="bordered">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-7 h-7 text-primary-600" />
                <h3 className="text-2xl font-bold text-gray-900">For Job Seekers</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">200+ Job Listings</p>
                    <p className="text-sm text-gray-600">Aggregated from multiple sources, updated daily</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Salary Transparency</p>
                    <p className="text-sm text-gray-600">See salary ranges and compensation details upfront</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Job Alerts</p>
                    <p className="text-sm text-gray-600">Get notified when new opportunities match your criteria</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">100% Free</p>
                    <p className="text-sm text-gray-600">No hidden fees, no subscriptions required</p>
                  </div>
                </li>
              </ul>
            </Card>

            {/* For Employers */}
            <Card padding="lg" variant="bordered">
              <div className="flex items-center gap-3 mb-6">
                <Award className="w-7 h-7 text-primary-600" />
                <h3 className="text-2xl font-bold text-gray-900">For Employers</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Targeted Audience</p>
                    <p className="text-sm text-gray-600">Reach qualified PMHNPs actively seeking opportunities</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Affordable Pricing</p>
                    <p className="text-sm text-gray-600">Standard ($99) and Featured ($199) posting options</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Featured Placement</p>
                    <p className="text-sm text-gray-600">Get your posting to the top of search results</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Analytics & Tracking</p>
                    <p className="text-sm text-gray-600">View counts, apply clicks, and performance metrics</p>
                  </div>
                </li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Why We Built This Section */}
        <section className="mb-12">
          <Card padding="lg" variant="default">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Why We Built This</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                The idea for PMHNP Jobs came from a simple observation: Psychiatric Mental Health Nurse 
                Practitioners were underserved by existing job boards. General nursing job sites were 
                cluttered with irrelevant positions, and it took hours to find PMHNP-specific opportunities 
                scattered across multiple platforms.
              </p>
              <p>
                We noticed that PMHNPs were spending valuable time searching through hundreds of listings 
                that weren't relevant to their specialization. Meanwhile, employers looking to hire PMHNPs 
                struggled to reach the right candidates in an efficient, cost-effective way.
              </p>
              <p>
                We built PMHNP Jobs to bridge this gap. Our goal is simple: create a dedicated space where 
                PMHNPs can quickly find relevant opportunities, and where employers can connect with qualified 
                candidates without breaking the bank.
              </p>
              <p className="text-base italic text-gray-600 border-l-4 border-primary-500 pl-4">
                "We're committed to making the job search process easier, more transparent, and more efficient 
                for everyone in the PMHNP community."
              </p>
            </div>
          </Card>
        </section>

        {/* Contact Section */}
        <section>
          <Card padding="lg" variant="elevated" className="bg-primary-50 border-primary-200">
            <div className="text-center">
              <Mail className="w-12 h-12 text-primary-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Get In Touch</h2>
              <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
                Have questions, feedback, or suggestions? We'd love to hear from you. 
                We're always looking to improve and serve the PMHNP community better.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href="mailto:hello@pmhnpjobs.com"
                  className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
                >
                  <Mail size={20} />
                  Email Us
                </a>
                <Link
                  href="/jobs"
                  className="inline-flex items-center gap-2 bg-white text-primary-600 px-6 py-3 rounded-lg font-semibold border-2 border-primary-600 hover:bg-primary-50 transition-colors"
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

