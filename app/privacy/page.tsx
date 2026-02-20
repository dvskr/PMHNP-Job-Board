import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { AlertTriangle, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | PMHNP Hiring',
  description: 'Privacy Policy for PMHNP Hiring. Learn how we collect, use, and protect your information.',
  openGraph: {
    images: [{ url: '/images/pages/pmhnp-hiring-privacy-policy.webp', width: 1280, height: 900, alt: 'PMHNP Hiring privacy policy page detailing data collection, security measures, and user privacy rights' }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-hiring-privacy-policy.webp'] },
  alternates: {
    canonical: 'https://pmhnphiring.com/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Privacy Policy', url: 'https://pmhnphiring.com/privacy' },
      ]} />
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
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-10 h-10 text-teal-600" />
            <h1 className="text-4xl font-bold text-gray-900">
              Privacy Policy
            </h1>
          </div>
          <p className="text-sm text-gray-500">
            Last updated: December 8, 2024
          </p>
        </header>

        {/* Content */}
        <div className="prose prose-gray max-w-none">
          {/* Introduction */}
          <section className="mb-10">
            <p className="text-gray-700 leading-relaxed mb-4">
              At PMHNP Hiring, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
            </p>
          </section>

          {/* Section 1 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              1. Information We Collect
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may collect information about you in a variety of ways. The information we may collect on the Site includes:
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Personal Data
            </h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Email addresses:</strong> When you subscribe to job alerts, save drafts, or post jobs</li>
              <li><strong>Employer information:</strong> Company name, job posting details, contact information when posting jobs</li>
              <li><strong>Payment information:</strong> Processed securely through Stripe (we do not store credit card details)</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Automatically Collected Information
            </h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Usage data:</strong> Pages visited, time spent on pages, links clicked, search queries</li>
              <li><strong>Device information:</strong> Browser type, operating system, IP address</li>
              <li><strong>Cookies and local storage:</strong> We use cookies and browser local storage to remember your preferences and saved jobs</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              2. How We Use Your Information
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use the information we collect in the following ways:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>To send job alerts:</strong> Send you email notifications about jobs matching your criteria (only if you&apos;ve subscribed)</li>
              <li><strong>To process job postings:</strong> Publish and manage job listings from employers</li>
              <li><strong>To improve our service:</strong> Analyze usage patterns to enhance user experience and fix issues</li>
              <li><strong>To communicate with you:</strong> Send confirmation emails, dashboard links, renewal reminders, and service updates</li>
              <li><strong>To process payments:</strong> Handle transactions for job posting purchases through our payment processor</li>
              <li><strong>To provide customer support:</strong> Respond to your questions and resolve issues</li>
              <li><strong>To prevent fraud:</strong> Monitor and prevent fraudulent or suspicious activity</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              3. Information Sharing and Disclosure
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>We do not sell, trade, or rent your personal information to third parties.</strong>
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may share your information in the following situations:
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Service Providers
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may share your information with third-party service providers who perform services on our behalf:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Stripe:</strong> Payment processing for job postings</li>
              <li><strong>Resend:</strong> Email delivery service for job alerts and notifications</li>
              <li><strong>Hosting providers:</strong> Services that host our website and database</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              These service providers are contractually obligated to protect your information and use it only for the purposes we specify.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Legal Requirements
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may disclose your information if required to do so by law or in response to valid requests by public authorities (e.g., a court or government agency).
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Business Transfers
            </h3>
            <p className="text-gray-700 leading-relaxed">
              If we are involved in a merger, acquisition, or sale of assets, your information may be transferred. We will notify you via email and/or a prominent notice on our site before your information becomes subject to a different privacy policy.
            </p>
          </section>

          {/* Section 4 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              4. Cookies and Tracking Technologies
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use cookies and similar tracking technologies to track activity on our service and hold certain information.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              What Are Cookies?
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Cookies are small data files stored on your device. We use cookies for:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Essential functionality:</strong> Remember your preferences and settings</li>
              <li><strong>Analytics:</strong> Understand how visitors use our site (using privacy-friendly methods)</li>
              <li><strong>Security:</strong> Protect against fraudulent activity</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Local Storage
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use browser local storage to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Save your job searches and filters</li>
              <li>Remember jobs you&apos;ve saved or applied to</li>
              <li>Store draft job posting data</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              You can control cookies through your browser settings. Note that disabling cookies may limit your ability to use some features of our service.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              5. Data Security
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We implement appropriate technical and organizational security measures to protect your personal information:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Encryption:</strong> All data transmitted between your browser and our servers is encrypted using HTTPS/TLS</li>
              <li><strong>Secure storage:</strong> Personal data is stored in secure, access-controlled databases</li>
              <li><strong>Payment security:</strong> Payment information is handled by Stripe, a PCI DSS compliant payment processor. We never see or store your full credit card details</li>
              <li><strong>Access controls:</strong> We limit access to personal information to employees and contractors who need it to perform their job functions</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your personal information, we cannot guarantee its absolute security.
            </p>
          </section>

          {/* Section 6 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              6. Your Privacy Rights
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Depending on your location, you may have certain rights regarding your personal information:
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Access and Portability
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can request a copy of the personal information we hold about you.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Correction
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can update or correct your information at any time through your employer dashboard or by contacting us.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Deletion
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can request deletion of your personal information. Note that we may need to retain certain information for legal or legitimate business purposes.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Unsubscribe from Emails
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can unsubscribe from marketing emails at any time by:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Clicking the &quot;Unsubscribe&quot; link in any email we send you</li>
              <li>Contacting us at support@pmhnphiring.com</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Opt-Out of Tracking
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can opt out of cookies and tracking by adjusting your browser settings or using privacy tools.
            </p>

            <p className="text-gray-700 leading-relaxed">
              To exercise any of these rights, please contact us at support@pmhnphiring.com. We will respond to your request within 30 days.
            </p>
          </section>

          {/* Section 7 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              7. Third-Party Links
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our Service may contain links to third-party websites, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Employer websites and application pages</li>
              <li>Job board sources where we aggregate listings</li>
              <li>Social media platforms</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              We are not responsible for the privacy practices or content of these third-party sites. We encourage you to read the privacy policies of any website you visit.
            </p>
            <p className="text-gray-700 leading-relaxed">
              When you click &quot;Apply Now&quot; on a job listing, you will be directed to the employer&apos;s website or application system. Your interactions with that site are governed by their privacy policy, not ours.
            </p>
          </section>

          {/* Section 8 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              8. Children&apos;s Privacy
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children under 18.
            </p>
            <p className="text-gray-700 leading-relaxed">
              If you are a parent or guardian and you are aware that your child has provided us with personal information, please contact us. If we become aware that we have collected personal information from children without verification of parental consent, we will take steps to remove that information from our servers.
            </p>
          </section>

          {/* Section 9 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              9. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may update our Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or for other reasons.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              We will notify you of any changes by:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Updating the &quot;Last updated&quot; date at the top of this Privacy Policy</li>
              <li>Sending an email notification to subscribers for significant changes</li>
              <li>Posting a notice on our homepage</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              We encourage you to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
            </p>
          </section>

          {/* Section 10 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              10. Contact Us
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have any questions about this Privacy Policy, or if you wish to exercise your privacy rights, please contact us:
            </p>
            <ul className="list-none text-gray-700 space-y-2">
              <li><strong>Email:</strong> support@pmhnphiring.com</li>
              <li><strong>Subject line:</strong> &quot;Privacy Inquiry&quot;</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We will respond to your inquiry within 30 days.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              For general questions about our service, please visit our <Link href="/faq" className="text-teal-600 hover:text-teal-700 underline">FAQ page</Link> or <Link href="/contact" className="text-teal-600 hover:text-teal-700 underline">Contact page</Link>.
            </p>
          </section>

          {/* California Privacy Rights */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              California Privacy Rights
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>The right to know what personal information we collect, use, disclose, and sell</li>
              <li>The right to request deletion of your personal information</li>
              <li>The right to opt-out of the sale of your personal information (Note: We do not sell personal information)</li>
              <li>The right to non-discrimination for exercising your CCPA rights</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              To exercise these rights, please contact us at support@pmhnphiring.com with &quot;CCPA Request&quot; in the subject line.
            </p>
          </section>

          {/* GDPR Rights */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              European Privacy Rights (GDPR)
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you are located in the European Economic Area (EEA), you have certain data protection rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>The right to access, update, or delete your personal information</li>
              <li>The right to rectification if your information is inaccurate or incomplete</li>
              <li>The right to object to processing of your personal information</li>
              <li>The right to data portability</li>
              <li>The right to withdraw consent at any time</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              To exercise these rights, please contact us at support@pmhnphiring.com with &quot;GDPR Request&quot; in the subject line.
            </p>
          </section>
        </div>

        {/* Bottom Navigation */}
        <footer className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-4 justify-center text-sm">
            <Link href="/terms" className="text-teal-600 hover:text-teal-700 underline">
              Terms of Service
            </Link>
            <span className="text-gray-400">·</span>
            <Link href="/faq" className="text-teal-600 hover:text-teal-700 underline">
              FAQ
            </Link>
            <span className="text-gray-400">·</span>
            <Link href="/about" className="text-teal-600 hover:text-teal-700 underline">
              About Us
            </Link>
            <span className="text-gray-400">·</span>
            <Link href="/contact" className="text-teal-600 hover:text-teal-700 underline">
              Contact
            </Link>
          </div>
        </footer>
      </article>
    </div>
  );
}

