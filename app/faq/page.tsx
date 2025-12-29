import { Metadata } from 'next';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FAQAccordion from '@/components/FAQAccordion';
import { Mail, HelpCircle } from 'lucide-react';
import { config } from '@/lib/config';

export const metadata: Metadata = {
  title: 'FAQ | PMHNP Jobs',
  description: 'Frequently asked questions about PMHNP Jobs for job seekers and employers.',
};

export default function FAQPage() {
  const jobSeekerFaqs = [
    {
      question: "Is PMHNP Jobs free to use?",
      answer: "Yes! Job seekers can browse, save, and apply to jobs completely free. There are no hidden fees, subscriptions, or charges for candidates."
    },
    {
      question: "How do I save jobs?",
      answer: "Click the bookmark icon on any job card or detail page. Saved jobs are stored in your browser and accessible anytime from the 'Saved Jobs' page in the navigation menu."
    },
    {
      question: "How do job alerts work?",
      answer: "Create an alert with your search criteria (location, job type, salary, etc.). We'll email you when new matching jobs are posted. You can manage or unsubscribe from alerts at any time."
    },
    {
      question: "Where do the jobs come from?",
      answer: "We aggregate jobs from multiple sources including job boards, company career pages, and direct employer postings. This gives you access to the most comprehensive collection of PMHNP opportunities in one place."
    },
    {
      question: "How do I apply to a job?",
      answer: "Click 'Apply Now' on any job listing. You'll be directed to the employer's application page where you can submit your resume and information directly to them."
    },
    {
      question: "Can I track my applications?",
      answer: "Yes! When you apply to a job and confirm that you've completed the application, the job is automatically tracked in your 'Applications' tab on the Saved Jobs page."
    },
  ];

  const employerFaqs = [
    {
      question: "How much does it cost to post a job?",
      answer: config.isPaidPostingEnabled
        ? "We offer two posting options: Standard ($99) for a 30-day listing with full features, and Featured ($199) which includes priority placement, a featured badge, and highlighted inclusion in our email digest."
        : "During our launch period, job postings are completely FREE! This includes both Standard and Featured listings. Take advantage of this limited-time offer to get your positions in front of qualified PMHNPs."
    },
    {
      question: "Is there a free trial?",
      answer: config.isPaidPostingEnabled
        ? "We don't offer a free trial, but our pricing is straightforward with no hidden fees. You only pay when you post a job, and your listing stays active for 30 days."
        : "Even better - we're currently offering FREE job postings during our launch period! No credit card required. Simply create your listing and it goes live immediately."
    },
    {
      question: "What's the difference between Standard and Featured?",
      answer: config.isPaidPostingEnabled
        ? "Featured jobs appear at the top of search results, are highlighted in job alerts with special formatting, display a prominent 'Featured' badge, and last for 60 days instead of 30. Featured postings typically receive 3-5x more views and applications."
        : "Featured jobs appear at the top of search results, are highlighted in job alerts with special formatting, and display a prominent 'Featured' badge. During our free launch period, both options are free - we recommend choosing Featured for maximum visibility!"
    },
    {
      question: "How long do job postings last?",
      answer: config.isPaidPostingEnabled
        ? "Standard postings are active for 30 days. Featured postings are active for 60 days. You can renew your posting at any time from your employer dashboard before or after it expires."
        : "All postings are active for 30 days. You can renew your posting at any time from your employer dashboard before or after it expires - completely free during our launch period!"
    },
    {
      question: "Can I edit my job posting?",
      answer: "Yes! You'll receive an edit link in your confirmation email. You can update your posting anytime—change salary, requirements, description, or any other details. Changes go live immediately."
    },
    {
      question: "How do I access my employer dashboard?",
      answer: config.isPaidPostingEnabled
        ? "Check your confirmation email for a dashboard link. The dashboard allows you to view analytics, edit your posting, renew listings, and manage all your job postings in one place. If you've lost the link, contact us at support@pmhnphiring.com."
        : "Check your confirmation email for a dashboard link. The dashboard allows you to view analytics, edit your posting, and renew listings for free during our launch period. If you've lost the link, contact us at support@pmhnphiring.com."
    },
    {
      question: "Do you offer refunds?",
      answer: "Contact us at support@pmhnphiring.com within 7 days of posting if you're unsatisfied and we'll work with you. We want you to have a great experience and will do our best to resolve any issues."
    },
  ];

  const generalFaqs = [
    {
      question: "How do I contact support?",
      answer: "Email us at support@pmhnphiring.com and we'll respond within 24 hours (usually much faster). You can also use our contact form for general inquiries."
    },
    {
      question: "Is my information secure?",
      answer: "Yes. We use industry-standard security practices including encrypted connections (HTTPS), secure payment processing through Stripe, and we never share your personal information with third parties. See our Privacy Policy for complete details."
    },
    {
      question: "How often are jobs updated?",
      answer: "Jobs are added and updated daily. New postings go live immediately, and we regularly refresh aggregated listings to ensure accuracy."
    },
    {
      question: "Can I post jobs in multiple locations?",
      answer: "Yes! When creating your job posting, you can specify multiple locations or select 'Remote' for positions that can be done from anywhere."
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <HelpCircle className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-blue-100 max-w-3xl mx-auto">
            Find answers to common questions about PMHNP Jobs
          </p>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* For Job Seekers FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b border-gray-200">
              For Job Seekers
            </h2>
            <FAQAccordion items={jobSeekerFaqs} />
          </Card>
        </section>

        {/* For Employers FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b border-gray-200">
              For Employers
            </h2>
            <FAQAccordion items={employerFaqs} />
          </Card>
        </section>

        {/* General FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b border-gray-200">
              General Questions
            </h2>
            <FAQAccordion items={generalFaqs} />
          </Card>
        </section>

        {/* Still Have Questions Section */}
        <section>
          <Card padding="lg" variant="elevated" className="bg-blue-50 border-blue-200 text-center">
            <Mail className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Still Have Questions?
            </h2>
            <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
              Didn&apos;t find your answer? We&apos;re here to help. Reach out and we&apos;ll get back to you within 24 hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-lg mx-auto">
              <a href="mailto:support@pmhnphiring.com" className="w-full sm:w-auto">
                <Button variant="primary" size="lg" className="w-full">
                  <Mail size={20} />
                  Email Us
                </Button>
              </a>
              <Link href="/contact" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full">
                  Contact Us
                </Button>
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

