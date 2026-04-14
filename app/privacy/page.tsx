import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for PMHNP Hiring. Learn how we collect, use, and protect your information.',
  openGraph: {
    images: [{ url: '/images/pages/pmhnp-hiring-privacy-policy.webp', width: 1280, height: 900, alt: 'PMHNP Hiring privacy policy page detailing data collection, security measures, and user privacy rights' }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-hiring-privacy-policy.webp'] },
  alternates: { canonical: 'https://pmhnphiring.com/privacy' },
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
    <div style={{ background: '#F5F6F8', minHeight: '100vh', padding: '48px 16px 80px' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Privacy Policy', url: 'https://pmhnphiring.com/privacy' },
      ]} />
      <article style={{ ...clayCard, maxWidth: '760px', margin: '0 auto', padding: '48px 40px' }}>

        {/* Header */}
        <header style={{ marginBottom: '40px', paddingBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
            <div style={clayIconWrap}><Shield size={22} color="#fff" /></div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: 0 }}>Privacy Policy</h1>
          </div>
          <p style={{ fontSize: '13px', color: '#B0BEC5', margin: 0 }}>Last updated: January 1, 2026</p>
        </header>

        <div>
          <p style={pStyle}>At PMHNP Hiring, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.</p>
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
          <h3 style={h3Style}>Service Providers</h3>
          <ul style={ulStyle}>
            <li style={liStyle}><strong>Stripe:</strong> Payment processing for job postings</li>
            <li style={liStyle}><strong>Resend:</strong> Email delivery service for job alerts and notifications</li>
            <li style={liStyle}><strong>Hosting providers:</strong> Services that host our website and database</li>
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
            <li style={liStyle}>Contact us at support@pmhnphiring.com</li>
          </ul>
          <p style={pStyle}>To exercise any of these rights, contact us at support@pmhnphiring.com. We will respond within 30 days.</p>

          <h2 style={h2Style}>7. Third-Party Links</h2>
          <p style={pStyle}>Our Service may contain links to third-party websites. We are not responsible for their privacy practices. When you click &quot;Apply Now&quot;, you may be directed to the employer&apos;s website, governed by their privacy policy.</p>

          <h2 style={h2Style}>8. Children&apos;s Privacy</h2>
          <p style={pStyle}>Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children under 18.</p>

          <h2 style={h2Style}>9. Changes to This Privacy Policy</h2>
          <p style={pStyle}>We may update our Privacy Policy from time to time. We will notify you by updating the &quot;Last updated&quot; date, sending email notifications, and posting a notice on our homepage.</p>

          <h2 style={h2Style}>10. Contact Us</h2>
          <p style={pStyle}>If you have questions about this Privacy Policy or wish to exercise your privacy rights, please contact us:</p>
          <ul style={{ ...ulStyle, listStyleType: 'none', paddingLeft: 0 }}>
            <li style={liStyle}><strong>Email:</strong> support@pmhnphiring.com</li>
            <li style={liStyle}><strong>Subject line:</strong> &quot;Privacy Inquiry&quot;</li>
          </ul>
          <p style={pStyle}>For general questions, visit our <Link href="/faq" style={{ color: '#0D9488', textDecoration: 'none' }}>FAQ page</Link> or <Link href="/contact" style={{ color: '#0D9488', textDecoration: 'none' }}>Contact page</Link>.</p>

          <h2 style={h2Style}>California Privacy Rights (CCPA)</h2>
          <ul style={ulStyle}>
            <li style={liStyle}>The right to know what personal information we collect, use, disclose, and sell</li>
            <li style={liStyle}>The right to request deletion of your personal information</li>
            <li style={liStyle}>The right to opt-out of the sale of your personal information (Note: We do not sell personal information)</li>
            <li style={liStyle}>The right to non-discrimination for exercising your CCPA rights</li>
          </ul>
          <p style={pStyle}>To exercise these rights, contact us at support@pmhnphiring.com with &quot;CCPA Request&quot; in the subject line.</p>

          <h2 style={h2Style}>European Privacy Rights (GDPR)</h2>
          <ul style={ulStyle}>
            <li style={liStyle}>The right to access, update, or delete your personal information</li>
            <li style={liStyle}>The right to rectification if your information is inaccurate or incomplete</li>
            <li style={liStyle}>The right to object to processing of your personal information</li>
            <li style={liStyle}>The right to data portability</li>
            <li style={liStyle}>The right to withdraw consent at any time</li>
          </ul>
          <p style={pStyle}>To exercise these rights, contact us at support@pmhnphiring.com with &quot;GDPR Request&quot; in the subject line.</p>
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
    </div>
  );
}
