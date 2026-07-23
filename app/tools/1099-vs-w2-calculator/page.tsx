import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Briefcase, Info, Percent, ShieldCheck, Scale } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import ContractorComparisonCalculator from '@/components/tools/ContractorComparisonCalculator';
import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { TAX_CONSTANTS_2025 } from '@/lib/tools/contractor-comparison';

const PAGE_URL = `${brand.baseUrl}/tools/1099-vs-w2-calculator`;

export const metadata: Metadata = {
  title: '1099 vs W-2 Calculator for Nurse Practitioners: Take-Home Comparison',
  description:
    'Free calculator comparing a 1099 contract against a W-2 offer for PMHNPs and nurse practitioners. See self-employment tax, employer benefit value, and the break-even hourly rate. Uses 2025 tax constants.',
  keywords: [
    '1099 vs w2 calculator',
    '1099 vs w2 nurse practitioner',
    'pmhnp 1099 calculator',
    'self employment tax calculator nurse practitioner',
    'contractor vs employee take home pay',
    '1099 break even hourly rate',
  ],
  openGraph: {
    title: '1099 vs W-2 Calculator for Nurse Practitioners',
    description:
      'Compare a 1099 contract against a W-2 offer side by side: self-employment tax, benefit value, and the break-even hourly rate.',
    type: 'website',
    url: PAGE_URL,
  },
  twitter: {
    card: 'summary',
    title: '1099 vs W-2 Calculator for Nurse Practitioners',
    description:
      'Free take-home comparison tool for PMHNPs weighing a 1099 contract against a W-2 offer.',
  },
  alternates: { canonical: PAGE_URL },
};

/* ═══ Clay Design Tokens (matches app/salary-guide/page.tsx) ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const webApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: '1099 vs W-2 PMHNP Take-Home Calculator',
  url: PAGE_URL,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description:
    'Free calculator that compares a 1099 independent-contractor offer against a W-2 employee package for psychiatric nurse practitioners: self-employment tax, employer benefit value, and the break-even hourly rate.',
  provider: { '@type': 'Organization', name: brand.name, url: brand.baseUrl },
};

const differentialCards = [
  {
    icon: Percent,
    title: 'Self-Employment Tax',
    desc: 'As a 1099 contractor you pay both halves of Social Security and Medicare: 15.3% on 92.35% of net earnings. A W-2 employee pays only the 7.65% employee share; the employer covers the rest.',
  },
  {
    icon: ShieldCheck,
    title: 'Employer Benefits',
    desc: 'A W-2 package quietly includes money that never appears on the pay stub: the 401(k) match, employer-paid health premiums, and paid time off. A 1099 contractor funds all of these alone.',
  },
  {
    icon: Scale,
    title: 'What Actually Cancels Out',
    desc: 'Federal and state income tax apply to both sides, so brackets mostly wash out of the decision. This tool deliberately excludes them and isolates what truly differs: payroll tax and benefits.',
  },
];

export default function ContractorCalculatorPage() {
  const { SOCIAL_SECURITY_WAGE_BASE, WORKDAYS_PER_YEAR } = TAX_CONSTANTS_2025;

  return (
    <>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Tools', url: 'https://pmhnphiring.com/tools' },
        { name: '1099 vs W-2 Calculator', url: PAGE_URL },
      ]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(webApplicationSchema) }} />

      <div style={{ background: '#FDFBF7' }}>
        {/* ═══ HERO ═══ */}
        {/* Layout's <main> already pads 64px below the header — keep hero
            top padding small so the page doesn't open on a void. */}
        <section style={{ maxWidth: '900px', margin: '0 auto', padding: '16px 20px 40px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
              Free Tool · 2025 Tax Constants
            </p>
            <h1 className="font-lora" style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
              color: '#1A2E35', marginBottom: '16px',
            }}>
              1099 vs W-2 Take-Home Calculator
            </h1>
            <p style={{ fontSize: '17px', color: '#5A4A42', maxWidth: '620px', margin: '0 auto', lineHeight: 1.6 }}>
              Weighing a contract offer against an employee package? Compare them side by side:
              self-employment tax, employer benefit value, and the hourly rate a 1099 contract
              must pay to break even.
            </p>
          </div>
        </section>

        {/* ═══ WHY THE TWO OFFERS AREN'T COMPARABLE AT FACE VALUE ═══ */}
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px 48px' }}>
          <div className="ccp-diff-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {differentialCards.map(card => (
              <div key={card.title} className="ccp-card" style={{ ...clayCard, padding: '26px 24px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '14px',
                  background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px',
                }}>
                  <card.icon size={20} color="#0D9488" />
                </div>
                <h2 className="font-lora" style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>{card.title}</h2>
                <p style={{ fontSize: '13.5px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ CALCULATOR ═══ */}
        <section style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px 56px' }}>
          <ContractorComparisonCalculator />
        </section>

        {/* ═══ METHODOLOGY / DISCLAIMER ═══ */}
        <section style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px 56px' }}>
          <div style={{ ...clayCard, padding: '26px 28px', background: '#F0FDFA', border: '1px solid #99F6E4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Info size={18} color="#134E4A" />
              <h2 className="font-lora" style={{ fontSize: '17px', fontWeight: 800, color: '#134E4A', margin: 0 }}>
                Methodology &amp; Disclaimer
              </h2>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#134E4A', lineHeight: 1.6 }}>
              <li>
                • <strong>Educational estimate, not tax advice.</strong> Talk to a CPA before restructuring
                your compensation; everyone&apos;s deductions, filing status, and state rules differ.
              </li>
              <li>
                • <strong>Income tax brackets are excluded on purpose.</strong> Both W-2 employees and 1099
                contractors owe federal and state income tax, so brackets largely cancel out of the
                comparison. What differs is payroll tax and benefits, and that&apos;s what this tool isolates.
              </li>
              <li>
                • <strong>2025 tax constants.</strong> Self-employment tax is 15.3% (12.4% Social Security +
                2.9% Medicare) applied to 92.35% of net self-employment earnings, with the Social Security
                portion capped at the ${SOCIAL_SECURITY_WAGE_BASE.toLocaleString('en-US')} wage base. The
                0.9% Additional Medicare surtax is not modeled; it applies equally to high W-2 and 1099
                earnings.
              </li>
              <li>
                • <strong>W-2 side.</strong> Effective value = salary + 401(k) match + employer-paid health
                premiums + PTO (valued at salary ÷ {WORKDAYS_PER_YEAR} workdays per day) − the employee&apos;s
                7.65% FICA share.
              </li>
              <li>
                • <strong>1099 side.</strong> Effective value = gross income − full self-employment tax.
                Half of the SE tax is deductible against income tax; the calculator reports the amount but
                not its dollar value, which depends on your bracket. Business deductions (home office,
                malpractice, health premiums) are also not modeled and typically improve the 1099 picture.
              </li>
            </ul>
          </div>
        </section>

        {/* ═══ RELATED LINKS ═══ */}
        <section style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px 80px' }}>
          <div className="ccp-links-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <Link href="/resources/1099-vs-w2" className="ccp-card" style={{ ...clayCard, padding: '24px 26px', textDecoration: 'none', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <BookOpen size={18} color="#0D9488" />
                <h2 className="font-lora" style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                  Read the Full 1099 vs W-2 Guide
                </h2>
              </div>
              <p style={{ fontSize: '13.5px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 10px' }}>
                Tax deductions, retirement accounts, when to choose each model, and how experienced
                PMHNPs structure hybrid arrangements.
              </p>
              <span className="ccp-link-cta" style={{ fontSize: '13px', color: '#0D9488', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Read the guide <ArrowRight size={14} />
              </span>
            </Link>
            <Link href="/jobs/1099" className="ccp-card" style={{ ...clayCard, padding: '24px 26px', textDecoration: 'none', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Briefcase size={18} color="#0D9488" />
                <h2 className="font-lora" style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                  Browse 1099 PMHNP Jobs
                </h2>
              </div>
              <p style={{ fontSize: '13.5px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 10px' }}>
                Independent-contractor psychiatric NP positions updated daily: telehealth, locum, and
                private-practice contracts.
              </p>
              <span className="ccp-link-cta" style={{ fontSize: '13px', color: '#0D9488', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                See open contracts <ArrowRight size={14} />
              </span>
            </Link>
          </div>
        </section>
      </div>

      {/* ═══ Hover states (matches salary-guide idiom) ═══ */}
      <style>{`
        .ccp-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .ccp-card:hover {
          transform: translateY(-4px);
          box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important;
        }
        .ccp-link-cta {
          transition: color 0.2s ease;
        }
        .ccp-card:hover .ccp-link-cta {
          color: #2DD4BF;
        }
      `}</style>
    </>
  );
}
