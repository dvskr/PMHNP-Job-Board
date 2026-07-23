import { Metadata } from 'next';
import Link from 'next/link';
import { BadgeDollarSign, Calculator, Map, ArrowLeftRight, ArrowRight } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';

const BASE_URL = brand.baseUrl;

export const metadata: Metadata = {
  title: 'Free PMHNP Career Tools: Offer Analyzer, Calculators & Maps',
  description:
    'Free tools for psychiatric nurse practitioners: check if your offer is competitive against live advertised pay, compare 1099 vs W-2 take-home, convert hourly to annual, and see practice authority by state.',
  keywords: [
    'pmhnp tools',
    'pmhnp salary calculator',
    'pmhnp offer analyzer',
    '1099 vs w2 nurse practitioner',
    'pmhnp practice authority map',
  ],
  alternates: { canonical: `${BASE_URL}/tools` },
  openGraph: {
    title: 'Free PMHNP Career Tools',
    description:
      'Offer analyzer, 1099 vs W-2 calculator, salary converter, and practice authority map. Free, no signup.',
    type: 'website',
    url: `${BASE_URL}/tools`,
  },
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const TOOLS = [
  {
    href: '/tools/offer-analyzer',
    name: 'Offer Analyzer',
    tagline: 'Is your offer competitive?',
    description:
      'See where your salary offer lands against advertised pay in live PMHNP postings: percentile, p25/median/p75, by state. Analyzed in your browser; your number never leaves the page.',
    icon: <BadgeDollarSign className="w-6 h-6" aria-hidden="true" />,
  },
  {
    href: '/tools/1099-vs-w2-calculator',
    name: '1099 vs W-2 Calculator',
    tagline: 'Contract or employee: which pays more?',
    description:
      'Side-by-side take-home comparison: self-employment tax, employer benefits value, and the break-even hourly rate a 1099 contract needs to match a W-2 package.',
    icon: <Calculator className="w-6 h-6" aria-hidden="true" />,
  },
  {
    href: '/tools/salary-converter',
    name: 'Salary Converter',
    tagline: 'Hourly ↔ annual, honestly',
    description:
      'Convert pay across hourly, daily, weekly, biweekly, monthly, and annual, with the hours-per-week and weeks-per-year assumptions editable and in the open.',
    icon: <ArrowLeftRight className="w-6 h-6" aria-hidden="true" />,
  },
  {
    href: '/tools/practice-authority-map',
    name: 'Practice Authority Map',
    tagline: 'Where can PMHNPs practice independently?',
    description:
      'Interactive map of Full, Reduced, and Restricted practice states. Tap a state for what the level means and jump straight to its jobs and salary data.',
    icon: <Map className="w-6 h-6" aria-hidden="true" />,
  },
];

export default function ToolsIndexPage() {
  return (
    <div style={{ backgroundColor: '#FDFBF7', minHeight: '100vh' }}>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: BASE_URL },
          { name: 'Tools', url: `${BASE_URL}/tools` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Free PMHNP Career Tools',
            itemListElement: TOOLS.map((t, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: t.name,
              url: `${BASE_URL}${t.href}`,
            })),
          }),
        }}
      />

      {/* Layout's <main> already pads 64px below the header — keep our own
          top padding small so the page doesn't open on a void. */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
        <h1
          className="text-3xl sm:text-4xl font-extrabold"
          style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)' }}
        >
          Free PMHNP Career Tools
        </h1>
        <p className="mt-3 text-base max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Built on the same live posting data that powers this job board. No signup, no
          survey-data guesswork, and every figure ships with its sample size.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} className="group block h-full">
              <div
                style={{ ...clayCard, padding: '24px' }}
                className="h-full transition-transform group-hover:-translate-y-0.5"
              >
                <div
                  className="inline-flex items-center justify-center rounded-2xl p-3"
                  style={{ background: '#F0FDFA', color: '#0D9488' }}
                >
                  {tool.icon}
                </div>
                <h2
                  className="mt-4 text-xl font-bold"
                  style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)' }}
                >
                  {tool.name}
                </h2>
                <div className="text-sm font-semibold" style={{ color: '#0D9488' }}>
                  {tool.tagline}
                </div>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {tool.description}
                </p>
                <div
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
                  style={{ color: '#0D9488' }}
                >
                  Open tool
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Looking for the data behind these tools? See the{' '}
          <Link href="/salary-guide" className="font-semibold hover:underline" style={{ color: '#0D9488' }}>
            PMHNP salary guide
          </Link>{' '}
          and{' '}
          <Link href="/resources" className="font-semibold hover:underline" style={{ color: '#0D9488' }}>
            career resources
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
