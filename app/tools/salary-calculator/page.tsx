import { Metadata } from 'next';
import { brand } from '@/config/brand';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import SalaryCalculator from './SalaryCalculator';

export const metadata: Metadata = {
  title: 'PMHNP Salary Calculator 2026 — Estimate Your Earning Potential',
  description: 'Calculate your PMHNP salary by state, setting, and experience level. Compare telehealth, private practice, hospital, and VA compensation with real market data.',
  keywords: ['PMHNP salary calculator', 'psychiatric nurse practitioner salary', 'PMHNP pay estimator', 'psych NP salary by state'],
  openGraph: {
    title: 'PMHNP Salary Calculator 2026',
    description: 'Estimate your psychiatric nurse practitioner salary based on state, practice setting, and experience.',
    type: 'website',
  },
  alternates: {
    canonical: `${brand.baseUrl}/tools/salary-calculator`,
  },
};

const faqs = [
  {
    q: 'How accurate is this PMHNP salary calculator?',
    a: 'This calculator uses aggregated data from job postings on pmhnphiring.com and industry salary surveys. Actual salaries vary based on employer, benefits, patient volume, and negotiation. Use this as a starting point for salary research and negotiation.',
  },
  {
    q: 'What is the average PMHNP salary in 2026?',
    a: 'The national average PMHNP salary in 2026 ranges from $139,000 to $175,000, depending on experience, location, and practice setting. Entry-level PMHNPs earn $115,000-$140,000, while experienced PMHNPs in high-demand states can earn $180,000-$250,000+.',
  },
  {
    q: 'Which state pays PMHNPs the most?',
    a: 'California, New York, New Jersey, Washington, and Massachusetts consistently rank as the highest-paying states for PMHNPs, with average salaries exceeding $170,000. However, cost of living should be factored into your comparison.',
  },
  {
    q: 'Do telehealth PMHNPs earn less than in-person?',
    a: 'No — telehealth PMHNPs earn comparable salaries to in-person roles, averaging $130,000-$200,000. Some telehealth positions pay more because providers can see patients across multiple states, increasing patient volume.',
  },
  {
    q: 'How much can a PMHNP make in private practice?',
    a: 'Private practice PMHNPs can earn $180,000-$300,000+ annually. Income depends on patient volume, payer mix, geographic location, and whether you accept insurance. Solo practitioners who are paneled with insurance and see 20-25 patients per week often exceed $200,000.',
  },
];

export default function SalaryCalculatorPage() {
  return (
    <div style={{ backgroundColor: '#FDFBF7', minHeight: '100vh' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Tools', url: 'https://pmhnphiring.com/tools' },
        { name: 'Salary Calculator', url: 'https://pmhnphiring.com/tools/salary-calculator' },
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'PMHNP Salary Calculator',
            url: 'https://pmhnphiring.com/tools/salary-calculator',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Any',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            creator: {
              '@type': 'Organization',
              name: 'PMHNP Hiring',
              url: 'https://pmhnphiring.com',
            },
          }),
        }}
      />

      <SalaryCalculator faqs={faqs} />
    </div>
  );
}
