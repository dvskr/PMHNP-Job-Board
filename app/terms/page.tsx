import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import Image from 'next/image';
import { FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read the Terms of Service for PMHNP Hiring. Understand your rights, responsibilities, and our policies for using the #1 PMHNP job board.',
  openGraph: {
    images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-terms-of-service.webp', width: 1280, height: 900, alt: 'PMHNP Hiring terms of service page with user rights, employer responsibilities, and platform policies' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-terms-of-service.webp'] },
  alternates: { canonical: 'https://pmhnphiring.com/terms' },
};

/* ═══ Clay Tokens ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
};
const h2Style: React.CSSProperties = { fontSize: '20px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px', marginTop: '40px' };
const pStyle: React.CSSProperties = { fontSize: '14px', color: '#4A5568', lineHeight: 1.75, marginBottom: '14px' };
const ulStyle: React.CSSProperties = { listStyleType: 'disc', paddingLeft: '24px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' };
const liStyle: React.CSSProperties = { fontSize: '14px', color: '#4A5568', lineHeight: 1.65 };

const clayIconWrap: React.CSSProperties = {
  width: '48px', height: '48px', borderRadius: '16px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(145deg, #0D9488, #10B981)',
  boxShadow: '4px 4px 10px rgba(13,148,136,0.15), inset 1px 1px 2px rgba(255,255,255,0.2)',
};

export default function TermsPage() {
  return (
    <div style={{ background: '#F5F6F8', minHeight: '100vh', padding: '48px 16px 80px' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Terms of Service', url: 'https://pmhnphiring.com/terms' },
      ]} />
      <article style={{ ...clayCard, maxWidth: '760px', margin: '0 auto', padding: '48px 40px' }}>

        {/* Header */}
        <header style={{ marginBottom: '40px', paddingBottom: '32px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px', gap: '24px', alignItems: 'center' }} className="legal-hero-grid">
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: '#F0F9FF', color: '#0284C7', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
                  <FileText size={14} /> Legal Documentation
              </div>
              <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 12px 0', lineHeight: 1.15 }}>
                Terms of <span style={{ color: '#0284C7' }}>Service</span>
              </h1>
              <p style={{ fontSize: '15px', color: '#6B7F8A', margin: 0, lineHeight: 1.6 }}>Last updated: January 1, 2026</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/clay_hero_terms.webp" alt="Terms of Service" width={140} height={140} style={{ objectFit: 'contain', filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.12))' }} priority />
            </div>
          </div>
        </header>

        <div>
          <h2 style={h2Style}>1. Acceptance of Terms</h2>
          <p style={pStyle}>By accessing and using PMHNP Jobs (&quot;the Service&quot;, &quot;our Service&quot;), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to abide by these Terms of Service, please do not use this Service.</p>
          <p style={pStyle}>These terms apply to all visitors, users, and others who access or use the Service, including but not limited to job seekers, employers, and recruiters.</p>

          <h2 style={h2Style}>2. Description of Service</h2>
          <p style={pStyle}>PMHNP Jobs is a job board platform that connects Psychiatric Mental Health Nurse Practitioners (PMHNPs) with employers seeking to hire qualified candidates. Our Service includes:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Job listing aggregation from multiple sources</li>
            <li style={liStyle}>Direct employer job posting capabilities</li>
            <li style={liStyle}>Job search and filtering functionality</li>
            <li style={liStyle}>Job alerts and notifications</li>
            <li style={liStyle}>Application tracking for job seekers</li>
            <li style={liStyle}>Analytics and management tools for employers</li>
          </ul>
          <p style={pStyle}>We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time without prior notice.</p>

          <h2 style={h2Style}>3. User Responsibilities</h2>
          <p style={pStyle}>By using our Service, you agree to:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Provide accurate, current, and complete information when creating job postings or using our Service</li>
            <li style={liStyle}>Maintain the security of any access credentials or dashboard tokens</li>
            <li style={liStyle}>Not post false, misleading, or fraudulent content</li>
            <li style={liStyle}>Not use the Service for any illegal or unauthorized purpose</li>
            <li style={liStyle}>Not transmit any viruses, malware, or other malicious code</li>
            <li style={liStyle}>Not attempt to gain unauthorized access to any part of the Service</li>
            <li style={liStyle}>Comply with all applicable local, state, national, and international laws and regulations</li>
          </ul>
          <p style={pStyle}>Violation of any of these terms may result in immediate termination of your access to the Service.</p>

          <h2 style={h2Style}>4. Job Postings</h2>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Employer Responsibilities:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Employers are solely responsible for the accuracy, legality, and content of their job listings</li>
            <li style={liStyle}>Job postings must comply with all applicable employment laws and regulations</li>
            <li style={liStyle}>Job postings must not contain discriminatory language or violate equal employment opportunity laws</li>
            <li style={liStyle}>Employers must honor the terms stated in their job postings</li>
          </ul>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Our Rights:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>We reserve the right to review, edit, or remove any job posting at our sole discretion</li>
            <li style={liStyle}>We may reject or remove postings that violate these terms or are deemed inappropriate</li>
            <li style={liStyle}>We are not responsible for screening employers or verifying the accuracy of job listings</li>
          </ul>
          <p style={pStyle}>Job postings expire after the stated duration (30 days for Starter, 60 days for Growth, 90 days for Premium). Renewal options may be available through the employer dashboard.</p>

          <h2 style={h2Style}>5. Payments and Refunds</h2>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Payment Terms:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Job posting fees are due at the time of purchase</li>
            <li style={liStyle}>All payments are processed securely through Stripe, our third-party payment processor</li>
            <li style={liStyle}>Prices are stated in US Dollars (USD)</li>
            <li style={liStyle}>Payment is required before your job posting goes live</li>
          </ul>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Refund Policy:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Job posting fees are generally non-refundable</li>
            <li style={liStyle}>Refund requests may be considered within 7 days of purchase on a case-by-case basis</li>
            <li style={liStyle}>Contact us at support@pmhnphiring.com to request a refund</li>
            <li style={liStyle}>We reserve the right to issue refunds at our sole discretion</li>
          </ul>
          <p style={pStyle}>If we remove your job posting due to violation of these terms, no refund will be issued.</p>

          <h2 style={h2Style}>6. Intellectual Property</h2>
          <p style={pStyle}>All content on PMHNP Jobs, including but not limited to text, graphics, logos, icons, images, audio clips, digital downloads, data compilations, and software, is the property of PMHNP Jobs or its content suppliers and is protected by United States and international copyright laws.</p>
          <p style={pStyle}>You may not reproduce, distribute, modify, create derivative works of, publicly display, or otherwise use any content from this Service without our express written permission, except for your personal, non-commercial use.</p>

          <h2 style={h2Style}>7. Disclaimer</h2>
          <p style={{ ...pStyle, fontWeight: 700, color: '#1A2E35' }}>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.</p>
          <ul style={ulStyle}>
            <li style={liStyle}>We do not guarantee job placement, interviews, or employment outcomes</li>
            <li style={liStyle}>We are not responsible for interactions between employers and candidates</li>
            <li style={liStyle}>We do not verify the identity, credentials, or background of users</li>
            <li style={liStyle}>We do not guarantee the accuracy, completeness, or timeliness of job listings</li>
            <li style={liStyle}>We are not an employment agency or recruiter</li>
          </ul>
          <p style={pStyle}>Job seekers and employers use this Service at their own risk. We strongly encourage all users to conduct their own due diligence when evaluating opportunities or candidates.</p>

          <h2 style={h2Style}>8. Limitation of Liability</h2>
          <p style={pStyle}>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL PMHNP JOBS, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.</p>
          <p style={pStyle}>Our total liability to you for all claims arising from or related to the Service shall not exceed the amount you paid us in the twelve (12) months prior to the claim, or $100, whichever is greater.</p>

          <h2 style={h2Style}>9. Changes to Terms</h2>
          <p style={pStyle}>We reserve the right to modify or replace these Terms of Service at any time at our sole discretion. We will make reasonable efforts to notify users of material changes by updating the &quot;Last updated&quot; date, sending email notifications, and posting a notice on our homepage.</p>
          <p style={pStyle}>Your continued use of the Service after any changes to these Terms constitutes acceptance of those changes.</p>

          <h2 style={h2Style}>10. Contact</h2>
          <p style={pStyle}>If you have any questions about these Terms of Service, please contact us:</p>
          <ul style={{ ...ulStyle, listStyleType: 'none', paddingLeft: 0 }}>
            <li style={liStyle}><strong>Email:</strong> support@pmhnphiring.com</li>
            <li style={liStyle}><strong>Website:</strong> <Link href="/" style={{ color: '#0D9488', textDecoration: 'none' }}>pmhnphiring.com</Link></li>
          </ul>
          <p style={pStyle}>For general inquiries, visit our <Link href="/faq" style={{ color: '#0D9488', textDecoration: 'none' }}>FAQ page</Link> or <Link href="/contact" style={{ color: '#0D9488', textDecoration: 'none' }}>Contact page</Link>.</p>
        </div>

        {/* Footer Nav */}
        <footer style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Privacy Policy', href: '/privacy' },
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
