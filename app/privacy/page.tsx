import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import Image from 'next/image';
import { Shield } from 'lucide-react';
import { brand } from '@/config/brand';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Privacy Policy for ${brand.name}. Learn how we collect, use, and protect your information.`,
  openGraph: {
    images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-privacy-policy.webp', width: 1280, height: 900, alt: `${brand.name} privacy policy page detailing data collection, security measures, and user privacy rights` }],
  },
  twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-privacy-policy.webp'] },
  alternates: { canonical: `${brand.baseUrl}/privacy` },
};

/* ═══ Clay Tokens ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
};
const h2Style: React.CSSProperties = { fontSize: '20px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px', marginTop: '40px' };
const h3Style: React.CSSProperties = { fontSize: '16px', fontWeight: 600, color: '#1A2E35', marginBottom: '10px', marginTop: '20px' };
const pStyle: React.CSSProperties = { fontSize: '14px', color: '#4A5568', lineHeight: 1.75, marginBottom: '14px' };
const ulStyle: React.CSSProperties = { listStyleType: 'disc', paddingLeft: '24px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' };
const liStyle: React.CSSProperties = { fontSize: '14px', color: '#4A5568', lineHeight: 1.65 };

const clayIconWrap: React.CSSProperties = {
  width: '48px', height: '48px', borderRadius: '16px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(145deg, #8B5CF6, #A855F7)',
  boxShadow: '4px 4px 10px rgba(139,92,246,0.15), inset 1px 1px 2px rgba(255,255,255,0.2)',
};

export default function PrivacyPage() {
  return (
    <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '48px 16px 80px' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: brand.baseUrl },
        { name: 'Privacy Policy', url: `${brand.baseUrl}/privacy` },
      ]} />
      <article style={{ ...clayCard, maxWidth: '760px', margin: '0 auto', padding: '48px 40px' }}>

        {/* Header */}
        <header style={{ marginBottom: '40px', paddingBottom: '32px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px', gap: '24px', alignItems: 'center' }} className="legal-hero-grid">
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: '#ECFDF5', color: '#059669', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
                  <Shield size={14} /> Data Protection
              </div>
              <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 12px 0', lineHeight: 1.15 }}>
                Privacy <span style={{ color: '#059669' }}>Policy</span>
              </h1>
              <p style={{ fontSize: '15px', color: '#6B7F8A', margin: 0, lineHeight: 1.6 }}>Last updated: April 30, 2026</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/clay_hero_privacy.webp" alt="Privacy Policy" width={140} height={140} style={{ objectFit: 'contain', filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.12))' }} priority />
            </div>
          </div>
        </header>

        <div>
          <p style={pStyle}>At {brand.name}, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.</p>
          <p style={pStyle}>Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.</p>

          <h2 style={h2Style}>1. Information We Collect</h2>
          <p style={pStyle}>We may collect information about you in a variety of ways:</p>
          <h3 style={h3Style}>Personal Data</h3>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Email addresses:</strong> When you subscribe to job alerts, save drafts, or post jobs</li>
            <li style={liStyle}><strong>Employer information:</strong> Company name, job posting details, contact information when posting jobs</li>
            <li style={liStyle}><strong>Payment information:</strong> Processed securely through Stripe (we do not store credit card details)</li>
          </ul>
          <h3 style={h3Style}>Automatically Collected Information</h3>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Usage data:</strong> Pages visited, time spent on pages, links clicked, search queries</li>
            <li style={liStyle}><strong>Device information:</strong> Browser type, operating system, IP address</li>
            <li style={liStyle}><strong>Cookies and local storage:</strong> We use cookies and browser local storage to remember your preferences and saved jobs</li>
          </ul>

          <h2 style={h2Style}>2. How We Use Your Information</h2>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>To send job alerts:</strong> Email notifications about jobs matching your criteria (only if you&apos;ve subscribed)</li>
            <li style={liStyle}><strong>To process job postings:</strong> Publish and manage job listings from employers</li>
            <li style={liStyle}><strong>To improve our service:</strong> Analyze usage patterns to enhance user experience</li>
            <li style={liStyle}><strong>To communicate with you:</strong> Send confirmation emails, dashboard links, renewal reminders</li>
            <li style={liStyle}><strong>To process payments:</strong> Handle transactions through our payment processor</li>
            <li style={liStyle}><strong>To prevent fraud:</strong> Monitor and prevent fraudulent or suspicious activity</li>
          </ul>

          <h2 style={h2Style}>3. Information Sharing and Disclosure</h2>
          <p style={{ ...pStyle, fontWeight: 700, color: '#1A2E35' }}>We do not sell, trade, or rent your personal information to third parties.</p>
          <h3 style={h3Style}>Service Providers (sub-processors)</h3>
          <p style={pStyle}>We use the following sub-processors to operate the service. Each receives only the data necessary for its specific function and is bound by a Data Processing Agreement. The complete current list with processing locations and DPA links is maintained at our <Link href="/sub-processors" style={{ color: '#0D9488', textDecoration: 'underline' }}>sub-processors page</Link>.</p>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Vercel:</strong> Application hosting and performance telemetry (Speed Insights — only after analytics consent).</li>
            <li style={liStyle}><strong>Supabase:</strong> Database, authentication, and file storage (resumes, profile assets).</li>
            <li style={liStyle}><strong>Stripe:</strong> Payment processing for employer job postings (hosted Checkout — card data never touches our servers).</li>
            <li style={liStyle}><strong>Resend:</strong> Transactional and marketing email delivery.</li>
            <li style={liStyle}><strong>Google Analytics 4:</strong> Aggregate site analytics. Loads only after explicit analytics consent. IP anonymization and Google Signals are disabled. We honor Global Privacy Control (GPC) signals.</li>
            <li style={liStyle}><strong>Sentry:</strong> Application error monitoring (build-time wired; client-side reporting currently disabled).</li>
          </ul>
          <h3 style={h3Style}>Legal Requirements</h3>
          <p style={pStyle}>We may disclose your information if required to do so by law or in response to valid requests by public authorities.</p>
          <h3 style={h3Style}>Business Transfers</h3>
          <p style={pStyle}>If we are involved in a merger, acquisition, or sale of assets, your information may be transferred. We will notify you before your information becomes subject to a different privacy policy.</p>

          <h2 style={h2Style}>4. Cookies and Tracking Technologies</h2>
          <p style={pStyle}>We use cookies and similar tracking technologies to track activity on our service.</p>
          <h3 style={h3Style}>What Are Cookies?</h3>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Essential functionality:</strong> Remember your preferences and settings</li>
            <li style={liStyle}><strong>Analytics:</strong> Understand how visitors use our site (privacy-friendly methods)</li>
            <li style={liStyle}><strong>Security:</strong> Protect against fraudulent activity</li>
          </ul>
          <h3 style={h3Style}>Local Storage</h3>
          <ul style={ulStyle}>
            <li style={liStyle}>Save your job searches and filters</li>
            <li style={liStyle}>Remember jobs you&apos;ve saved or applied to</li>
            <li style={liStyle}>Store draft job posting data</li>
          </ul>
          <p style={pStyle}>You can control cookies through your browser settings. Disabling cookies may limit some features.</p>

          <h2 style={h2Style}>5. Data Security</h2>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Encryption:</strong> All data is encrypted using HTTPS/TLS</li>
            <li style={liStyle}><strong>Secure storage:</strong> Personal data stored in secure, access-controlled databases</li>
            <li style={liStyle}><strong>Payment security:</strong> Handled by Stripe (PCI DSS compliant). We never store your credit card details</li>
            <li style={liStyle}><strong>Access controls:</strong> We limit access to personal information to authorized personnel only</li>
          </ul>
          <p style={pStyle}>No method of transmission over the Internet is 100% secure. While we strive to protect your personal information, we cannot guarantee its absolute security.</p>

          <h2 style={h2Style}>6. Your Privacy Rights</h2>
          <h3 style={h3Style}>Access and Portability</h3>
          <p style={pStyle}>You can request a copy of the personal information we hold about you.</p>
          <h3 style={h3Style}>Correction</h3>
          <p style={pStyle}>You can update or correct your information at any time through your dashboard or by contacting us.</p>
          <h3 style={h3Style}>Deletion</h3>
          <p style={pStyle}>You can request deletion of your personal information. We may retain certain information for legal purposes.</p>
          <h3 style={h3Style}>Unsubscribe from Emails</h3>
          <ul style={ulStyle}>
            <li style={liStyle}>Click the &quot;Unsubscribe&quot; link in any email we send you</li>
            <li style={liStyle}>Contact us at {brand.email.support}</li>
          </ul>
          <p style={pStyle}>To exercise any of these rights, contact us at {brand.email.support}. We will respond within 30 days.</p>

          <h2 style={h2Style}>7. Third-Party Links</h2>
          <p style={pStyle}>Our Service may contain links to third-party websites. We are not responsible for their privacy practices. When you click &quot;Apply Now&quot;, you may be directed to the employer&apos;s website, governed by their privacy policy.</p>

          <h2 style={h2Style}>8. Children&apos;s Privacy</h2>
          <p style={pStyle}>Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children under 18.</p>

          <h2 style={h2Style}>9. Changes to This Privacy Policy</h2>
          <p style={pStyle}>We may update our Privacy Policy from time to time. We will notify you by updating the &quot;Last updated&quot; date, sending email notifications, and posting a notice on our homepage.</p>

          <h2 style={h2Style}>10. Contact Us</h2>
          <p style={pStyle}>If you have questions about this Privacy Policy or wish to exercise your privacy rights, please contact us:</p>
          <ul style={{ ...ulStyle, listStyleType: 'none', paddingLeft: 0 }}>
            <li style={liStyle}><strong>Email:</strong> {brand.email.support}</li>
            <li style={liStyle}><strong>Subject line:</strong> &quot;Privacy Inquiry&quot;</li>
          </ul>
          <p style={pStyle}>For general questions, visit our <Link href="/faq" style={{ color: '#0D9488', textDecoration: 'none' }}>FAQ page</Link> or <Link href="/contact" style={{ color: '#0D9488', textDecoration: 'none' }}>Contact page</Link>.</p>

          <h2 style={h2Style}>11. Data Retention</h2>
          <p style={pStyle}>We keep personal data only as long as necessary for the purpose for which it was collected, plus any retention required by law:</p>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Active job seeker profile:</strong> retained while your account is active. Inactive accounts (no login for 24 months) are anonymized and resumes purged.</li>
            <li style={liStyle}><strong>Job applications:</strong> retained while the employer&apos;s job posting is active, plus 90 days for dispute resolution, then archived.</li>
            <li style={liStyle}><strong>Employer postings &amp; billing records:</strong> retained 7 years to satisfy US tax and audit obligations.</li>
            <li style={liStyle}><strong>Email logs (deliverability):</strong> 90 days.</li>
            <li style={liStyle}><strong>Analytics events (Google Analytics):</strong> 14 months (the shortest retention setting GA4 allows).</li>
            <li style={liStyle}><strong>Account deletion:</strong> on request, we soft-delete immediately and hard-purge after a 30-day grace period during which the deletion can be reversed.</li>
          </ul>

          <h2 style={h2Style}>12. Automated Decision-Making and AI</h2>
          <p style={pStyle}>We use a candidate-matching algorithm (an AI model) to suggest jobs that may be a good fit and to surface relevant applicants to employers. The output is a non-binding score; a human (the employer) makes the final hiring decision.</p>
          <p style={pStyle}>Under GDPR Article 22 you have the right to obtain human review of any decision that is based solely on automated processing. Because our matching is decision-support, not decision-making, this rarely applies — but if you believe the algorithm has produced an unfair outcome, contact <a href={`mailto:${brand.email.privacy}`} style={{ color: '#0D9488', textDecoration: 'underline' }}>{brand.email.privacy}</a> and we will review.</p>

          <h2 style={h2Style}>13. Sensitive Information</h2>
          <p style={pStyle}>Some fields in your profile are sensitive under GDPR Article 9 or treated as &quot;sensitive personal information&quot; under CPRA. We collect them only when you choose to provide them and only for the specific purpose described:</p>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Race / ethnicity, gender, disability status, veteran status (EEO data):</strong> entirely optional; provided to help employers meet voluntary diversity-reporting goals. Hidden from employer-facing views by default. You can clear these fields at any time from your profile.</li>
            <li style={liStyle}><strong>NPI and DEA numbers:</strong> credentialing identifiers used to verify clinical licensure. Visible only to employers you apply to.</li>
            <li style={liStyle}><strong>Resume content:</strong> health-history items you choose to disclose are visible to any employer you apply to. We do not parse or infer health-condition data.</li>
          </ul>
          <p style={pStyle}>We never use sensitive fields for advertising or to train AI models, and we never share them with sub-processors beyond what is required to display them in the application form.</p>

          <h2 style={h2Style}>14. California Privacy Rights (CCPA / CPRA)</h2>
          <ul style={ulStyle}>
            <li style={liStyle}>The right to know what personal information we collect, use, and disclose.</li>
            <li style={liStyle}>The right to delete personal information.</li>
            <li style={liStyle}>The right to correct inaccurate personal information.</li>
            <li style={liStyle}>The right to opt-out of the &quot;sale&quot; or &quot;sharing&quot; of personal information for cross-context behavioral advertising.</li>
            <li style={liStyle}>The right to limit the use of sensitive personal information.</li>
            <li style={liStyle}>The right to non-discrimination for exercising any of these rights.</li>
          </ul>
          <p style={pStyle}>
            We do not sell personal information for money. Loading analytics or advertising scripts may meet the
            broader CPRA definition of &quot;sharing&quot;. To opt out, click{' '}
            <Link href="/do-not-sell" style={{ color: '#0D9488', textDecoration: 'underline', fontWeight: 600 }}>Do Not Sell or Share My Personal Information</Link>{' '}
            or send a Global Privacy Control signal from your browser — we honor both.
          </p>
          <p style={pStyle}>To exercise any other CCPA right, file a request through our <Link href="/data-request" style={{ color: '#0D9488', textDecoration: 'underline' }}>Data Request form</Link> or email <a href={`mailto:${brand.email.privacy}`} style={{ color: '#0D9488', textDecoration: 'underline' }}>{brand.email.privacy}</a> with &quot;CCPA Request&quot; in the subject. We respond within 45 days.</p>

          <h2 style={h2Style}>15. European Privacy Rights (GDPR / UK GDPR)</h2>
          <ul style={ulStyle}>
            <li style={liStyle}>Access, rectification, erasure, restriction, data portability, and objection.</li>
            <li style={liStyle}>Withdrawal of consent at any time without affecting the lawfulness of processing carried out before withdrawal.</li>
            <li style={liStyle}>The right to lodge a complaint with your supervisory authority — for the EU, find yours at <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488', textDecoration: 'underline' }}>edpb.europa.eu</a>; for the UK, the Information Commissioner&apos;s Office at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488', textDecoration: 'underline' }}>ico.org.uk</a>.</li>
          </ul>
          <p style={pStyle}>File requests through our <Link href="/data-request" style={{ color: '#0D9488', textDecoration: 'underline' }}>Data Request form</Link>. We respond within 30 days.</p>

          <h2 style={h2Style}>16. Cross-Border Transfers</h2>
          <p style={pStyle}>Most of our sub-processors are based in the United States. Where personal data of EEA, UK, or Swiss residents is transferred outside its country of origin, the transfer relies on Standard Contractual Clauses (SCCs) included in each sub-processor&apos;s DPA, supplemented by encryption in transit and at rest.</p>
        </div>

        {/* Footer Nav */}
        <footer style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Terms of Service', href: '/terms' },
            { label: 'FAQ', href: '/faq' },
            { label: 'About Us', href: '/about' },
            { label: 'Contact', href: '/contact' },
          ].map(link => (
            <Link key={link.href} href={link.href} style={{ fontSize: '13px', color: '#0D9488', textDecoration: 'none' }}>{link.label}</Link>
          ))}
        </footer>
      </article>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 600px) {
          .legal-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
          .legal-hero-grid > div:last-child { display: none; } /* Hide 3D icon on super small screens to save space */
        }
      `}} />
    </div>
  );
}
