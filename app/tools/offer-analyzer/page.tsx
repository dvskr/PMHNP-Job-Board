import { Metadata } from 'next';
import Link from 'next/link';
import { BadgeDollarSign, ScanSearch, Scale } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import OfferAnalyzer from '@/components/tools/OfferAnalyzer';
import { jsonLdString } from '@/lib/seo/json-ld';
import { getOfferMarketData } from '@/lib/salary-report/market-data';
import { summarizeMidpoints } from '@/lib/salary-report/stats';
import { brand } from '@/config/brand';

// Advertised-pay data changes with the job set; one refresh per day is plenty.
export const revalidate = 86400;

// Same base-URL source as the sitemap and the other tools pages, so
// canonicals can never diverge from the URLs we advertise.
const BASE_URL = brand.baseUrl;

export const metadata: Metadata = {
  title: 'PMHNP Offer Analyzer: Is Your Salary Offer Competitive?',
  description:
    'Paste your PMHNP job offer and see where it lands against advertised pay in live psychiatric nurse practitioner postings: percentile, p25/median/p75 by state. Free, no signup, analyzed in your browser.',
  keywords: [
    'pmhnp offer analyzer',
    'is my pmhnp offer competitive',
    'pmhnp salary percentile',
    'psychiatric nurse practitioner salary comparison',
    'pmhnp salary by state',
  ],
  alternates: { canonical: `${BASE_URL}/tools/offer-analyzer` },
  openGraph: {
    title: 'PMHNP Offer Analyzer: Is Your Offer Competitive?',
    description:
      'See where your offer lands against advertised pay in live PMHNP postings. Free, in your browser.',
    type: 'website',
    url: `${BASE_URL}/tools/offer-analyzer`,
  },
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export default async function OfferAnalyzerPage() {
  const data = await getOfferMarketData();
  const national = summarizeMidpoints(data.national);
  const stateCount = Object.keys(data.states).length;

  return (
    <div style={{ backgroundColor: '#FDFBF7', minHeight: '100vh' }}>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: BASE_URL },
          { name: 'Tools', url: `${BASE_URL}/tools` },
          { name: 'Offer Analyzer', url: `${BASE_URL}/tools/offer-analyzer` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'PMHNP Offer Analyzer',
            url: `${BASE_URL}/tools/offer-analyzer`,
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Compare a PMHNP job offer against advertised salary ranges in live psychiatric nurse practitioner postings, by state.',
            publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: BASE_URL },
          }),
        }}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <h1
          className="text-3xl sm:text-4xl font-extrabold"
          style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)' }}
        >
          PMHNP Offer Analyzer
        </h1>
        <p className="mt-3 text-base max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Type in an offer and see where it lands against the pay ranges employers are advertising in
          live PMHNP postings right now: {national.tier === 'full' ? `${national.n.toLocaleString()} postings` : 'live postings'}{' '}
          across {stateCount} states with disclosed ranges.
        </p>

        <div className="mt-8">
          <OfferAnalyzer data={data} />
        </div>

        {/* How it works */}
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: <BadgeDollarSign className="w-5 h-5" aria-hidden="true" />,
              title: 'Advertised pay, not surveys',
              body: 'Every figure comes from salary ranges employers publish in live postings on this site, not self-reported survey data with unknown provenance.',
            },
            {
              icon: <ScanSearch className="w-5 h-5" aria-hidden="true" />,
              title: 'Honest sample sizes',
              body: 'Percentiles only appear where at least 10 postings disclose a range; 5 to 9 postings show a median only; fewer than 5 and we say so instead of guessing.',
            },
            {
              icon: <Scale className="w-5 h-5" aria-hidden="true" />,
              title: 'Quarantined outliers',
              body: 'Ranges with parsing defects (implausible bounds, max more than 3× min, midpoints outside $50k to $500k) are excluded before any math runs.',
            },
          ].map((f) => (
            <div key={f.title} style={{ ...clayCard, padding: '20px' }}>
              <div className="flex items-center gap-2 font-semibold" style={{ color: '#0D9488' }}>
                {f.icon}
                <span style={{ color: 'var(--text-primary)' }}>{f.title}</span>
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>

        {/* Methodology + cross-links */}
        <div style={{ ...clayCard, padding: '24px', marginTop: '28px' }}>
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)' }}
          >
            Methodology
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            We take the midpoint of each posting&apos;s advertised salary range (annualized).
            Employer-estimated ranges are excluded up front and never counted; ranges with parsing
            defects (inverted or implausible bounds, max more than 3× min) are additionally
            quarantined{data.quarantined > 0 ? ` (${data.quarantined} in the current data set)` : ''}.
            Your offer is compared against the distribution of the remaining midpoints. This measures
            what employers are <em>offering</em>, which is not the same as what every working PMHNP{' '}
            <em>earns</em>. Figures refresh daily as postings change.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
            <Link href="/salary-guide" className="hover:underline" style={{ color: '#0D9488' }}>
              Full salary guide →
            </Link>
            <Link href="/tools" className="hover:underline" style={{ color: '#0D9488' }}>
              All free tools →
            </Link>
            <Link href="/jobs" className="hover:underline" style={{ color: '#0D9488' }}>
              Browse PMHNP jobs →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
