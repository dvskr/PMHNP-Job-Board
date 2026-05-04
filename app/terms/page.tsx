import { brand } from '@/config/brand';
import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import Image from 'next/image';
import { FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read the Terms of Service for PMHNP Hiring, operated by Akari Labs LLC. Understand your rights, responsibilities, pricing, refunds, and platform policies for the #1 PMHNP job board.',
  openGraph: {
    images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-terms-of-service.webp', width: 1280, height: 900, alt: 'PMHNP Hiring terms of service page with user rights, employer responsibilities, and platform policies' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-terms-of-service.webp'] },
  alternates: { canonical: `${brand.baseUrl}/terms` },
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
              <p style={{ fontSize: '15px', color: '#6B7F8A', margin: 0, lineHeight: 1.6 }}>Last updated: May 1, 2026</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/clay_hero_terms.webp" alt="Terms of Service" width={140} height={140} style={{ objectFit: 'contain', filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.12))' }} priority />
            </div>
          </div>
        </header>

        <div>
          <h2 style={h2Style}>1. Introduction & Operating Entity</h2>
          <p style={pStyle}>PMHNP Hiring (the &quot;Service&quot;, &quot;our Service&quot;, &quot;the Platform&quot;) is operated by <strong>Akari Labs LLC</strong>, a Wyoming limited liability company with its registered office at 30 North Gould Street, Sheridan, WY 82801, United States (&quot;Akari Labs&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;).</p>
          <p style={pStyle}>These Terms of Service (&quot;Terms&quot;, &quot;Agreement&quot;) form a legally binding agreement between you (&quot;you&quot;, &quot;User&quot;) and Akari Labs LLC governing your access to and use of PMHNP Hiring at pmhnphiring.com and any related services, features, applications, and content.</p>

          <h2 style={h2Style}>2. Acceptance of Terms</h2>
          <p style={pStyle}>By accessing, registering for, or using PMHNP Hiring, you accept and agree to be bound by these Terms. If you do not agree, you must not use the Service.</p>
          <p style={pStyle}>These Terms apply to all visitors, registered users, and others who access or use the Service, including job seekers (Psychiatric Mental Health Nurse Practitioners and other candidates), employers, recruiters, and any third parties acting on their behalf.</p>
          <p style={pStyle}>If you are using the Service on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms, and references to &quot;you&quot; in this Agreement include both you individually and the organization.</p>

          <h2 style={h2Style}>3. Description of Service</h2>
          <p style={pStyle}>PMHNP Hiring is a job board platform connecting Psychiatric Mental Health Nurse Practitioners (&quot;PMHNPs&quot;) with employers seeking to hire them. The Service includes:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Aggregation of job listings from third-party sources</li>
            <li style={liStyle}>Direct job posting capabilities for verified employers</li>
            <li style={liStyle}>Job search, filtering, and alert functionality for candidates</li>
            <li style={liStyle}>Candidate profile and resume management</li>
            <li style={liStyle}>Application tracking and direct messaging between employers and candidates</li>
            <li style={liStyle}>Analytics, dashboard, and management tools for employers</li>
          </ul>
          <p style={pStyle}>We reserve the right to modify, add, suspend, or discontinue any feature of the Service at any time, with or without notice. We are not liable to you or to any third party for any modification, suspension, or discontinuation of the Service.</p>

          <h2 style={h2Style}>4. Eligibility & Accounts</h2>
          <p style={pStyle}>You must be at least 18 years old and able to form a legally binding contract to use the Service. By creating an account, you represent that you meet these requirements.</p>
          <p style={pStyle}>Employer accounts must be created using a legitimate company email address. Free email providers (such as Gmail, Yahoo, Outlook, iCloud) are not accepted for employer registrations to help us verify employer identity. Job seekers may use any valid email.</p>
          <p style={pStyle}>You are responsible for maintaining the confidentiality of your account credentials, dashboard tokens, and edit tokens. You must immediately notify us of any unauthorized use of your account. We are not liable for losses arising from your failure to safeguard your credentials.</p>

          <h2 style={h2Style}>5. User Responsibilities</h2>
          <p style={pStyle}>By using the Service, you agree to:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Provide accurate, current, and complete information</li>
            <li style={liStyle}>Maintain the security of your account credentials and tokens</li>
            <li style={liStyle}>Not post false, misleading, fraudulent, discriminatory, or unlawful content</li>
            <li style={liStyle}>Not use the Service for any illegal or unauthorized purpose</li>
            <li style={liStyle}>Not transmit viruses, malware, or other malicious code</li>
            <li style={liStyle}>Not attempt to gain unauthorized access to any portion of the Service or its underlying systems</li>
            <li style={liStyle}>Not scrape, crawl, or harvest data from the Service except through publicly documented APIs and within rate limits we set</li>
            <li style={liStyle}>Not use the Service to send unsolicited marketing communications to candidates or other users</li>
            <li style={liStyle}>Comply with all applicable local, state, federal, and international laws and regulations, including employment, privacy, and data-protection laws</li>
          </ul>
          <p style={pStyle}>Violation of any of these obligations may result in immediate suspension or termination of your account, removal of content, and legal action where appropriate.</p>

          <h2 style={h2Style}>6. Job Postings</h2>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Employer responsibilities:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Employers are solely responsible for the accuracy, legality, and content of their job listings</li>
            <li style={liStyle}>Job postings must comply with all applicable employment laws, including equal-employment-opportunity, anti-discrimination, wage-disclosure, and licensing requirements</li>
            <li style={liStyle}>Job postings must not contain discriminatory language based on race, color, religion, national origin, sex, age, disability, sexual orientation, gender identity, or any other protected characteristic</li>
            <li style={liStyle}>Employers must honor the terms stated in their job postings, including compensation, location, and role description</li>
            <li style={liStyle}>Employers may not use the Service to post jobs on behalf of other parties without disclosure or to misrepresent the hiring entity</li>
          </ul>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Our rights:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>We may review, edit, or remove any job posting at our sole discretion</li>
            <li style={liStyle}>We may reject or remove postings that violate these Terms or that we deem misleading, fraudulent, or inappropriate</li>
            <li style={liStyle}>We are not responsible for screening employers, verifying job listings, or vetting employer-candidate interactions</li>
            <li style={liStyle}>We may suspend or terminate employer accounts that repeatedly violate these Terms</li>
          </ul>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Listing duration & renewals:</p>
          <p style={pStyle}>All job postings — free or paid — are active for 60 days from the date of publication. After 60 days, postings expire automatically. Employers may renew paid postings through the employer dashboard. Renewals add 60 days to the current expiration date; renewing early does not forfeit any remaining time on the existing posting.</p>

          <h2 style={h2Style}>7. Pricing, Free Postings & Payments</h2>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Pricing schedule (current as of the &quot;Last updated&quot; date above):</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Each verified employer email domain is allowed up to 2 free job postings, lifetime, with no credit card required</li>
            <li style={liStyle}>Additional postings (after the free quota is exhausted) are $199 USD each, one-time</li>
            <li style={liStyle}>Renewals of paid postings are $179 USD, one-time, and add 60 days to the existing expiration</li>
            <li style={liStyle}>All postings — free, paid, or renewed — receive the same features: 60-day duration, Featured badge, top placement in search results, 25 candidate profile unlocks, 25 InMails, and full analytics</li>
            <li style={liStyle}>Free postings cannot be renewed at the discounted rate. Once a free posting expires, the employer may post a new listing at the standard $199 rate</li>
          </ul>
          <p style={pStyle}>Current pricing is also published at <Link href="/pricing" style={{ color: '#0D9488', textDecoration: 'none' }}>pmhnphiring.com/pricing</Link> and is incorporated into this Agreement by reference. We may change pricing at any time, and changes will be effective for postings created after the change date. Postings already paid for under prior pricing are not affected.</p>
          <p style={{ ...pStyle, fontWeight: 600, color: '#1A2E35' }}>Payment terms:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Job posting and renewal fees are due at the time of purchase</li>
            <li style={liStyle}>All payments are processed by Stripe, our third-party payment processor. Your card statement will show &quot;PMHNPHIRING&quot; as the merchant</li>
            <li style={liStyle}>All amounts are stated in US Dollars (USD) and are exclusive of any taxes that may apply in your jurisdiction</li>
            <li style={liStyle}>Payment must be completed before a paid posting goes live</li>
            <li style={liStyle}>You authorize us, through Stripe, to charge the payment method you provide</li>
            <li style={liStyle}>Invoices for paid postings and renewals are available from your employer dashboard</li>
          </ul>

          <h2 style={h2Style}>8. Refund Policy</h2>
          <ul style={ulStyle}>
            <li style={liStyle}>Job posting and renewal fees are generally non-refundable</li>
            <li style={liStyle}>Refund requests may be considered within 7 days of purchase on a case-by-case basis</li>
            <li style={liStyle}>To request a refund, email <a href="mailto:support@pmhnphiring.com" style={{ color: '#0D9488', textDecoration: 'none' }}>support@pmhnphiring.com</a> with your order details and the reason for the request</li>
            <li style={liStyle}>We reserve the right to grant or deny refund requests at our sole discretion</li>
            <li style={liStyle}>If we remove a posting for violation of these Terms, no refund will be issued</li>
            <li style={liStyle}>Free postings have no associated payment and are therefore not refundable</li>
            <li style={liStyle}>Refunds, if granted, will be issued to the original payment method through Stripe and may take 5-10 business days to appear on your statement</li>
          </ul>

          <h2 style={h2Style}>9. Candidate Data, Unlocks & Privacy</h2>
          <p style={pStyle}>When an employer with an active paid or free posting uses an unlock to view a candidate&apos;s full profile, that candidate&apos;s information (including name, email, resume, and other contact details) becomes accessible to the employer&apos;s account. This access is retained indefinitely, even after the underlying posting expires.</p>
          <p style={pStyle}>Employers receiving candidate data agree to:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Use candidate information only to evaluate the candidate for the role they applied to or are being recruited for</li>
            <li style={liStyle}>Not sell, license, redistribute, or share candidate information with third parties</li>
            <li style={liStyle}>Comply with all applicable privacy laws (including GDPR, CCPA, and HIPAA where relevant)</li>
            <li style={liStyle}>Honor candidate requests to delete or stop processing their information</li>
            <li style={liStyle}>Maintain reasonable security practices to protect candidate data from unauthorized disclosure</li>
          </ul>
          <p style={pStyle}>Candidates agree that, when they make their profile visible and indicate openness to opportunities, their profile may be discoverable by employers using the Service. Candidates may at any time make their profile non-visible or close their account. See our <Link href="/privacy" style={{ color: '#0D9488', textDecoration: 'none' }}>Privacy Policy</Link> for full details on how candidate data is collected, used, shared, and protected.</p>

          <h2 style={h2Style}>10. Intellectual Property</h2>
          <p style={pStyle}>All content provided by Akari Labs LLC on PMHNP Hiring — including text, graphics, logos, icons, images, audio clips, data compilations, software, design, and the &quot;PMHNP Hiring&quot; brand — is the property of Akari Labs LLC or its licensors and is protected by United States and international copyright, trademark, and other intellectual property laws.</p>
          <p style={pStyle}>You may not reproduce, distribute, modify, create derivative works of, publicly display, or otherwise exploit any content from the Service without our prior written permission, except for your personal, non-commercial use within the Service.</p>
          <p style={pStyle}>By submitting content to the Service (including job postings, candidate profiles, resumes, and messages), you grant Akari Labs LLC a worldwide, non-exclusive, royalty-free license to host, store, display, transmit, and use that content as necessary to operate, improve, and promote the Service. This license terminates when you delete the content, except where reasonably required for our backups, audit logs, or legal compliance.</p>

          <h2 style={h2Style}>11. Disclaimer of Warranties</h2>
          <p style={{ ...pStyle, fontWeight: 700, color: '#1A2E35' }}>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
          <ul style={ulStyle}>
            <li style={liStyle}>We do not guarantee job placement, interviews, hires, or any specific outcome from using the Service</li>
            <li style={liStyle}>We are not a party to interactions or transactions between employers and candidates and are not responsible for them</li>
            <li style={liStyle}>We do not verify the identity, credentials, employment history, licensure status, or background of users</li>
            <li style={liStyle}>We do not guarantee the accuracy, completeness, or timeliness of job listings or candidate profiles</li>
            <li style={liStyle}>We are not an employment agency, recruiter, or staffing firm</li>
            <li style={liStyle}>We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components</li>
          </ul>
          <p style={pStyle}>Job seekers and employers use the Service at their own risk. We strongly encourage all users to conduct their own due diligence — including license verification, reference checks, and background checks where appropriate — before extending or accepting any offer.</p>

          <h2 style={h2Style}>12. Limitation of Liability</h2>
          <p style={pStyle}>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, AKARI LABS LLC, ITS OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AGENTS, LICENSORS, AND SUPPLIERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, REVENUE, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO YOUR USE OF — OR INABILITY TO USE — THE SERVICE.</p>
          <p style={pStyle}>OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL AMOUNT YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED US DOLLARS ($100).</p>
          <p style={pStyle}>SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES OR THE LIMITATION OR EXCLUSION OF LIABILITY FOR INCIDENTAL OR CONSEQUENTIAL DAMAGES. ACCORDINGLY, SOME OF THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU.</p>

          <h2 style={h2Style}>13. Indemnification</h2>
          <p style={pStyle}>You agree to indemnify, defend, and hold harmless Akari Labs LLC and its officers, directors, employees, contractors, agents, licensors, and suppliers from and against any and all claims, liabilities, damages, losses, costs, expenses, and fees (including reasonable attorneys&apos; fees) arising out of or related to:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>Your use of, or inability to use, the Service</li>
            <li style={liStyle}>Your violation of these Terms or any applicable law</li>
            <li style={liStyle}>Your violation of any third-party right, including any intellectual property right or privacy right</li>
            <li style={liStyle}>Any content you post, transmit, or otherwise make available through the Service</li>
            <li style={liStyle}>Any dispute between you and any other user, including disputes between employers and candidates</li>
          </ul>

          <h2 style={h2Style}>14. Termination</h2>
          <p style={pStyle}>You may terminate your account at any time by following the account-deletion flow in your dashboard or by emailing <a href="mailto:support@pmhnphiring.com" style={{ color: '#0D9488', textDecoration: 'none' }}>support@pmhnphiring.com</a>. Account deletion is subject to a 30-day grace period during which the account may be restored, after which it is permanently purged.</p>
          <p style={pStyle}>We may suspend or terminate your access to the Service, or any portion of it, at any time, with or without notice, for any reason — including violation of these Terms, suspected fraud, or any other conduct we determine is harmful to the Service or other users.</p>
          <p style={pStyle}>Upon termination, your right to use the Service immediately ceases. Provisions that by their nature should survive termination — including intellectual property, disclaimers, limitation of liability, indemnification, and dispute resolution — shall survive.</p>

          <h2 style={h2Style}>15. Governing Law, Venue & Dispute Resolution</h2>
          <p style={pStyle}>These Terms and any dispute arising out of or related to them or the Service are governed by the laws of the State of Wyoming, United States, without regard to its conflict-of-laws principles. The United Nations Convention on Contracts for the International Sale of Goods does not apply.</p>
          <p style={pStyle}>You and Akari Labs LLC agree that any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved exclusively by binding individual arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules, except that either party may seek injunctive or other equitable relief in any court of competent jurisdiction to protect intellectual property or confidential information. The arbitration shall be conducted in English in Sheridan, Wyoming, or by remote means as the parties may agree. The arbitrator&apos;s decision shall be final and binding.</p>
          <p style={{ ...pStyle, fontWeight: 700, color: '#1A2E35' }}>YOU AND AKARI LABS LLC EACH WAIVE THE RIGHT TO PARTICIPATE IN A CLASS ACTION OR CLASS ARBITRATION. CLAIMS MAY ONLY BE BROUGHT IN AN INDIVIDUAL CAPACITY.</p>
          <p style={pStyle}>If for any reason a claim proceeds in court rather than in arbitration, you and Akari Labs LLC each consent to the exclusive personal jurisdiction and venue of the state and federal courts located in Sheridan County, Wyoming, and waive any objection to jurisdiction or venue in those courts.</p>

          <h2 style={h2Style}>16. Changes to These Terms</h2>
          <p style={pStyle}>We may modify these Terms at any time. The &quot;Last updated&quot; date at the top of this document will reflect the date of the most recent change. For material changes, we will use reasonable efforts to notify users by email or through prominent notice on the Service before the change takes effect.</p>
          <p style={pStyle}>Your continued use of the Service after changes become effective constitutes your acceptance of the updated Terms. If you do not agree to the updated Terms, you must stop using the Service.</p>

          <h2 style={h2Style}>17. Miscellaneous</h2>
          <p style={pStyle}><strong>Entire agreement.</strong> These Terms, together with our <Link href="/privacy" style={{ color: '#0D9488', textDecoration: 'none' }}>Privacy Policy</Link> and any other policies referenced here, constitute the entire agreement between you and Akari Labs LLC concerning the Service and supersede all prior agreements.</p>
          <p style={pStyle}><strong>Severability.</strong> If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions will remain in full force and effect.</p>
          <p style={pStyle}><strong>No waiver.</strong> Our failure to enforce any right or provision of these Terms is not a waiver of that right or provision.</p>
          <p style={pStyle}><strong>Assignment.</strong> You may not assign or transfer these Terms or your account without our prior written consent. We may assign these Terms freely, including to an affiliate or in connection with a merger, acquisition, or sale of assets.</p>
          <p style={pStyle}><strong>Force majeure.</strong> We are not liable for any failure or delay in performance caused by events beyond our reasonable control, including acts of God, natural disasters, war, terrorism, civil unrest, governmental action, labor disputes, or failures of the internet or third-party services.</p>
          <p style={pStyle}><strong>Notices.</strong> Notices to Akari Labs LLC must be sent to <a href="mailto:support@pmhnphiring.com" style={{ color: '#0D9488', textDecoration: 'none' }}>support@pmhnphiring.com</a> or by mail to 30 North Gould Street, Sheridan, WY 82801. Notices to you may be sent by email to the address associated with your account or by posting on the Service.</p>

          <h2 style={h2Style}>18. Contact</h2>
          <p style={pStyle}>If you have questions about these Terms, please contact us:</p>
          <ul style={{ ...ulStyle, listStyleType: 'none', paddingLeft: 0 }}>
            <li style={liStyle}><strong>Operator:</strong> Akari Labs LLC</li>
            <li style={liStyle}><strong>Mailing address:</strong> 30 North Gould Street, Sheridan, WY 82801, United States</li>
            <li style={liStyle}><strong>Email:</strong> <a href="mailto:support@pmhnphiring.com" style={{ color: '#0D9488', textDecoration: 'none' }}>support@pmhnphiring.com</a></li>
            <li style={liStyle}><strong>Website:</strong> <Link href="/" style={{ color: '#0D9488', textDecoration: 'none' }}>pmhnphiring.com</Link></li>
          </ul>
          <p style={pStyle}>For general questions, see our <Link href="/faq" style={{ color: '#0D9488', textDecoration: 'none' }}>FAQ page</Link> or our <Link href="/contact" style={{ color: '#0D9488', textDecoration: 'none' }}>Contact page</Link>.</p>
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
