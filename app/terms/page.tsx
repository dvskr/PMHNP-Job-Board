import { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service | PMHNP Jobs',
  description: 'Terms of Service for PMHNP Jobs job board platform.',
  alternates: {
    canonical: 'https://pmhnphiring.com/terms',
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <article className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-8 md:p-12">
        {/* Legal Disclaimer */}
        <div className="mb-8 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              <strong>Legal Disclaimer:</strong> This is a template. Consult a legal professional for advice specific to your situation.
            </p>
          </div>
        </div>

        {/* Header */}
        <header className="mb-12 pb-6 border-b border-gray-200">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-500">
            Last updated: December 8, 2024
          </p>
        </header>

        {/* Content */}
        <div className="prose prose-gray max-w-none">
          {/* Section 1 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              By accessing and using PMHNP Jobs (&quot;the Service&quot;, &quot;our Service&quot;), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to abide by these Terms of Service, please do not use this Service.
            </p>
            <p className="text-gray-700 leading-relaxed">
              These terms apply to all visitors, users, and others who access or use the Service, including but not limited to job seekers, employers, and recruiters.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              2. Description of Service
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              PMHNP Jobs is a job board platform that connects Psychiatric Mental Health Nurse Practitioners (PMHNPs) with employers seeking to hire qualified candidates. Our Service includes:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Job listing aggregation from multiple sources</li>
              <li>Direct employer job posting capabilities</li>
              <li>Job search and filtering functionality</li>
              <li>Job alerts and notifications</li>
              <li>Application tracking for job seekers</li>
              <li>Analytics and management tools for employers</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time without prior notice.
            </p>
          </section>

          {/* Section 3 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              3. User Responsibilities
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              By using our Service, you agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Provide accurate, current, and complete information when creating job postings or using our Service</li>
              <li>Maintain the security of any access credentials or dashboard tokens</li>
              <li>Not post false, misleading, or fraudulent content</li>
              <li>Not use the Service for any illegal or unauthorized purpose</li>
              <li>Not transmit any viruses, malware, or other malicious code</li>
              <li>Not attempt to gain unauthorized access to any part of the Service</li>
              <li>Comply with all applicable local, state, national, and international laws and regulations</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              Violation of any of these terms may result in immediate termination of your access to the Service.
            </p>
          </section>

          {/* Section 4 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              4. Job Postings
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Employer Responsibilities:</strong>
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Employers are solely responsible for the accuracy, legality, and content of their job listings</li>
              <li>Job postings must comply with all applicable employment laws and regulations</li>
              <li>Job postings must not contain discriminatory language or violate equal employment opportunity laws</li>
              <li>Employers must honor the terms stated in their job postings</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Our Rights:</strong>
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>We reserve the right to review, edit, or remove any job posting at our sole discretion</li>
              <li>We may reject or remove postings that violate these terms or are deemed inappropriate</li>
              <li>We are not responsible for screening employers or verifying the accuracy of job listings</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              Job postings expire after the stated duration (30 days for Standard, 60 days for Featured). Renewal options may be available through the employer dashboard.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              5. Payments and Refunds
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Payment Terms:</strong>
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Job posting fees are due at the time of purchase</li>
              <li>All payments are processed securely through Stripe, our third-party payment processor</li>
              <li>Prices are stated in US Dollars (USD)</li>
              <li>Payment is required before your job posting goes live</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Refund Policy:</strong>
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Job posting fees are generally non-refundable</li>
              <li>Refund requests may be considered within 7 days of purchase on a case-by-case basis</li>
              <li>Contact us at support@pmhnphiring.com to request a refund</li>
              <li>We reserve the right to issue refunds at our sole discretion</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              If we remove your job posting due to violation of these terms, no refund will be issued.
            </p>
          </section>

          {/* Section 6 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              6. Intellectual Property
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              All content on PMHNP Jobs, including but not limited to text, graphics, logos, icons, images, audio clips, digital downloads, data compilations, and software, is the property of PMHNP Jobs or its content suppliers and is protected by United States and international copyright laws.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              The compilation of all content on this Service is the exclusive property of PMHNP Jobs and is protected by U.S. and international copyright laws.
            </p>
            <p className="text-gray-700 leading-relaxed">
              You may not reproduce, distribute, modify, create derivative works of, publicly display, or otherwise use any content from this Service without our express written permission, except for your personal, non-commercial use.
            </p>
          </section>

          {/* Section 7 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              7. Disclaimer
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.</strong>
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              To the fullest extent permitted by law, we disclaim all warranties, express or implied, including but not limited to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>We do not guarantee job placement, interviews, or employment outcomes</li>
              <li>We are not responsible for interactions between employers and candidates</li>
              <li>We do not verify the identity, credentials, or background of users</li>
              <li>We do not guarantee the accuracy, completeness, or timeliness of job listings</li>
              <li>We are not an employment agency or recruiter</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              Job seekers and employers use this Service at their own risk. We strongly encourage all users to conduct their own due diligence when evaluating opportunities or candidates.
            </p>
          </section>

          {/* Section 8 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              8. Limitation of Liability
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL PMHNP JOBS, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Your access to or use of or inability to access or use the Service</li>
              <li>Any conduct or content of any third party on the Service</li>
              <li>Any content obtained from the Service</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              Our total liability to you for all claims arising from or related to the Service shall not exceed the amount you paid us in the twelve (12) months prior to the claim, or $100, whichever is greater.
            </p>
          </section>

          {/* Section 9 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              9. Changes to Terms
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We reserve the right to modify or replace these Terms of Service at any time at our sole discretion. We will make reasonable efforts to notify users of material changes by:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Updating the &quot;Last updated&quot; date at the top of this page</li>
              <li>Sending email notifications to registered users (where applicable)</li>
              <li>Posting a notice on our homepage</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              Your continued use of the Service after any changes to these Terms constitutes acceptance of those changes. If you do not agree to the new terms, please stop using the Service.
            </p>
            <p className="text-gray-700 leading-relaxed">
              We encourage you to review these Terms periodically for any updates or changes.
            </p>
          </section>

          {/* Section 10 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              10. Contact
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <ul className="list-none text-gray-700 space-y-2">
              <li><strong>Email:</strong> support@pmhnphiring.com</li>
              <li><strong>Website:</strong> <Link href="/" className="text-blue-600 hover:text-blue-700 underline">pmhnphiring.com</Link></li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              For general inquiries or support, please visit our <Link href="/faq" className="text-blue-600 hover:text-blue-700 underline">FAQ page</Link> or <Link href="/contact" className="text-blue-600 hover:text-blue-700 underline">Contact page</Link>.
            </p>
          </section>
        </div>

        {/* Bottom Navigation */}
        <footer className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-4 justify-center text-sm">
            <Link href="/privacy" className="text-blue-600 hover:text-blue-700 underline">
              Privacy Policy
            </Link>
            <span className="text-gray-400">·</span>
            <Link href="/faq" className="text-blue-600 hover:text-blue-700 underline">
              FAQ
            </Link>
            <span className="text-gray-400">·</span>
            <Link href="/about" className="text-blue-600 hover:text-blue-700 underline">
              About Us
            </Link>
            <span className="text-gray-400">·</span>
            <Link href="/contact" className="text-blue-600 hover:text-blue-700 underline">
              Contact
            </Link>
          </div>
        </footer>
      </article>
    </div>
  );
}

