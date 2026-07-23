import { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import SalaryConverter from '@/components/tools/SalaryConverter';
import { jsonLdString } from '@/lib/seo/json-ld';
import { getOfferMarketData } from '@/lib/salary-report/market-data';
import { summarizeMidpoints, roundDisplayDollars } from '@/lib/salary-report/stats';
import { brand } from '@/config/brand';

export const revalidate = 86400;

const BASE_URL = brand.baseUrl;

export const metadata: Metadata = {
  title: 'PMHNP Salary Converter: Hourly to Annual (and Back)',
  description:
    'Convert PMHNP pay between hourly, daily, weekly, biweekly, monthly, and annual, with editable hours-per-week and weeks-per-year assumptions, benchmarked against live advertised pay.',
  keywords: [
    'pmhnp hourly to salary',
    'nurse practitioner hourly to annual calculator',
    'pmhnp salary converter',
    'hourly to annual salary nurse practitioner',
  ],
  alternates: { canonical: `${BASE_URL}/tools/salary-converter` },
  openGraph: {
    title: 'PMHNP Salary Converter: Hourly ↔ Annual',
    description: 'Convert PMHNP pay across every pay period with honest, editable assumptions.',
    type: 'website',
    url: `${BASE_URL}/tools/salary-converter`,
  },
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export default async function SalaryConverterPage() {
  const data = await getOfferMarketData();
  const national = summarizeMidpoints(data.national);
  const nationalMedian =
    national.tier === 'full' || national.tier === 'median'
      ? roundDisplayDollars(national.median)
      : null;

  return (
    <div style={{ backgroundColor: '#FDFBF7', minHeight: '100vh' }}>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: BASE_URL },
          { name: 'Tools', url: `${BASE_URL}/tools` },
          { name: 'Salary Converter', url: `${BASE_URL}/tools/salary-converter` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'PMHNP Salary Converter',
            url: `${BASE_URL}/tools/salary-converter`,
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Convert psychiatric nurse practitioner pay between hourly, weekly, monthly, and annual periods.',
            publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: BASE_URL },
          }),
        }}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <h1
          className="text-3xl sm:text-4xl font-extrabold"
          style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)' }}
        >
          PMHNP Salary Converter
        </h1>
        <p className="mt-3 text-base max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Hourly rate to annual salary and back, with the assumptions in the open. Change hours per
          week or weeks per year and every figure updates; nothing is hidden behind a &ldquo;2,080
          hours&rdquo; default you can&apos;t see.
        </p>

        <div className="mt-8">
          <SalaryConverter nationalMedian={nationalMedian} nationalN={national.n} />
        </div>

        <div style={{ ...clayCard, padding: '24px', marginTop: '28px' }}>
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)' }}
          >
            Why the assumptions matter
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            An $85/hr offer is ~$176,800/yr at 40 hours and 52 weeks, but only ~$142,800 at 35
            hours and 48 weeks, which is a realistic schedule for many outpatient and 1099 roles.
            When comparing an hourly contract against a salaried W-2 offer, also account for
            self-employment tax and benefits. Our{' '}
            <Link href="/tools/1099-vs-w2-calculator" className="font-semibold hover:underline" style={{ color: '#0D9488' }}>
              1099 vs W-2 calculator
            </Link>{' '}
            does that math.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
            <Link href="/tools/offer-analyzer" className="hover:underline" style={{ color: '#0D9488' }}>
              Check your offer&apos;s percentile →
            </Link>
            <Link href="/salary-guide" className="hover:underline" style={{ color: '#0D9488' }}>
              Salary guide →
            </Link>
            <Link href="/tools" className="hover:underline" style={{ color: '#0D9488' }}>
              All free tools →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
