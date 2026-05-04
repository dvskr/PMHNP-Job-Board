import { brand } from '@/config/brand';
import { Metadata } from 'next';
import Link from 'next/link';
import { Scale, DollarSign, Calculator, CheckCircle, AlertTriangle, TrendingUp, Building2 } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: '1099 vs W2 for PMHNPs — Complete Compensation Comparison 2026',
  description: 'Compare 1099 independent contractor vs W2 employee PMHNP compensation. Tax strategies, benefits comparison, income calculator, and which model maximizes your psychiatric nurse practitioner earnings.',
  keywords: ['1099 vs W2 PMHNP', '1099 psychiatric nurse practitioner', 'PMHNP independent contractor taxes', 'contractor vs employee NP', '1099 PMHNP telehealth pay', 'psych NP compensation comparison'],
  openGraph: {
    title: '1099 vs W2 for PMHNPs — Compensation Guide',
    description: 'Which pays more? Complete comparison of independent contractor vs employee compensation for psychiatric nurse practitioners.',
    type: 'article',
  },
  alternates: { canonical: `${brand.baseUrl}/resources/1099-vs-w2` },
};

export default function CompensationGuidePage() {
  const compFaqs = [
    {
      question: "Is 1099 or W2 better for PMHNPs?",
      answer: "It depends on your priorities. 1099 offers higher gross pay ($75-$150+/hr), schedule flexibility, and tax deductions but requires self-management of taxes, insurance, and retirement. W2 offers stability, employer benefits (health, 401k, PTO, malpractice), and simpler taxes. Most PMHNPs who value income maximization prefer 1099 after gaining 2-3 years of experience."
    },
    {
      question: "How much more do 1099 PMHNPs make than W2?",
      answer: "1099 PMHNPs earn 20-40% higher GROSS hourly rates than W2 ($75-$150/hr vs $55-$100/hr). However, after accounting for self-employment tax (15.3%), individual health insurance ($6K-$18K/year), malpractice ($1.5-3K/year), and no employer 401k match, the NET take-home difference is typically 10-20% higher for 1099 — IF you manage expenses and deductions well."
    },
    {
      question: "What tax deductions can 1099 PMHNPs claim?",
      answer: "Key deductions include: home office (dedicated space), mileage/travel, health insurance premiums (100% deductible), SEP-IRA/Solo 401k contributions (up to $66K/year), CME and professional development, malpractice insurance, professional memberships (AANP, APNA), technology/equipment, phone and internet, and professional attire like scrubs."
    },
    {
      question: "Should new grad PMHNPs take 1099 positions?",
      answer: "Generally, no. New grads benefit from W2 positions that offer mentorship, structured onboarding, employer-paid malpractice, and benefits. 1099 work requires clinical confidence and business management skills. Most PMHNPs transition to 1099 after 2-3 years when they can command higher rates and handle the business aspects independently."
    },
    {
      question: "Can you do both 1099 and W2 as a PMHNP?",
      answer: "Yes, many PMHNPs work a W2 job for stability and benefits while taking 1099 side contracts for extra income. This 'hybrid' approach gives you employer benefits while earning premium 1099 rates for additional hours. Check your W2 employment contract for non-compete clauses or moonlighting restrictions."
    },
    {
      question: "What retirement accounts should 1099 PMHNPs use?",
      answer: "1099 PMHNPs have access to powerful retirement options: SEP-IRA (contribute up to 25% of net earnings, max $66,000/year in 2024), Solo 401k ($23,000 employee + 25% employer contributions = up to $69,000 total), or Traditional/Roth IRA ($7,000/year). The Solo 401k offers the most flexibility with both employee and employer contribution tiers."
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Resources", url: "https://pmhnphiring.com/resources" },
        { name: "1099 vs W2 Guide", url: "https://pmhnphiring.com/resources/1099-vs-w2" }
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: compFaqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: '1099 vs W2 for PMHNPs — Complete Compensation Comparison 2026',
            description: 'Compare independent contractor vs employee compensation for psychiatric nurse practitioners.',
            datePublished: '2026-03-19',
            dateModified: '2026-03-19',
            author: { '@type': 'Organization', name: 'PMHNP Hiring' },
            publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: 'https://pmhnphiring.com' },
          }),
        }}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-teal-600 to-blue-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-6">
              <Scale className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              1099 vs W2 for PMHNPs
            </h1>
            <p className="text-sm text-blue-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | Complete compensation comparison
            </p>
            <p className="text-lg md:text-xl text-blue-100 mb-6">
              Which pays more? Independent contractor vs employee — taxes, benefits, and take-home pay compared
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">

          {/* Quick Summary */}
          <div className="mb-8 md:mb-12 grid md:grid-cols-2 gap-6">
            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid #0d9488' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center"><DollarSign className="h-4 w-4 text-teal-700" /></div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>1099 / Independent Contractor</h2>
              </div>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong>Higher gross pay:</strong> $75-$150+/hour</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong>Schedule flexibility:</strong> Choose hours & clients</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong>Tax deductions:</strong> Home office, SEP-IRA, expenses</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span><strong>Self-employment tax:</strong> 15.3% on net earnings</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span><strong>No employer benefits:</strong> Self-fund health, retirement</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span><strong>Admin burden:</strong> Quarterly taxes, bookkeeping</span></li>
              </ul>
              <p className="mt-4 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>Best for: Experienced PMHNPs who want maximum control and income</p>
            </div>
            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid #6366f1' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center"><Building2 className="h-4 w-4 text-indigo-700" /></div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>W2 / Employee</h2>
              </div>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong>Stability:</strong> Predictable paycheck & schedule</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong>Employer benefits:</strong> Health, 401k match, PTO</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong>Malpractice included:</strong> Employer-paid coverage</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong>Simple taxes:</strong> Employer handles withholding</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span><strong>Lower gross pay:</strong> $55-$100/hour</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span><strong>Less flexibility:</strong> Employer-defined schedule</span></li>
              </ul>
              <p className="mt-4 text-xs font-medium text-indigo-600">Best for: New grads, PMHNPs wanting stability and mentorship</p>
            </div>
          </div>

          {/* Detailed Comparison Table */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Side-by-Side Comparison: $160K W2 vs $200K Gross 1099
              </h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Real-world comparison of a typical PMHNP earning $160K W2 vs $200K gross as a 1099 contractor:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th className="text-left py-3 pr-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Line Item</th>
                      <th className="text-right py-3 px-4 font-semibold text-indigo-600">W2 ($160K)</th>
                      <th className="text-right py-3 pl-4 font-semibold" style={{ color: 'var(--color-primary)' }}>1099 ($200K Gross)</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--text-secondary)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Gross Income</td>
                      <td className="py-3 px-4 text-right">$160,000</td>
                      <td className="py-3 pl-4 text-right">$200,000</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Business Deductions</td>
                      <td className="py-3 px-4 text-right">—</td>
                      <td className="py-3 pl-4 text-right text-green-600">-$15,000</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Self-Employment Tax (15.3%)</td>
                      <td className="py-3 px-4 text-right">Employer pays half</td>
                      <td className="py-3 pl-4 text-right text-red-500">-$28,300</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Federal Income Tax (~24%)</td>
                      <td className="py-3 px-4 text-right text-red-500">-$30,500</td>
                      <td className="py-3 pl-4 text-right text-red-500">-$37,700</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>FICA (Employee Share 7.65%)</td>
                      <td className="py-3 px-4 text-right text-red-500">-$12,240</td>
                      <td className="py-3 pl-4 text-right">Included above</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Health Insurance</td>
                      <td className="py-3 px-4 text-right">Employer subsidized (~$3K/yr)</td>
                      <td className="py-3 pl-4 text-right text-red-500">-$12,000 (deductible)</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Malpractice Insurance</td>
                      <td className="py-3 px-4 text-right">Employer-paid</td>
                      <td className="py-3 pl-4 text-right text-red-500">-$2,500 (deductible)</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Retirement (Employer Match)</td>
                      <td className="py-3 px-4 text-right text-green-600">+$6,400 (4% match)</td>
                      <td className="py-3 pl-4 text-right">Self-funded SEP-IRA</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>PTO Value (4 weeks)</td>
                      <td className="py-3 px-4 text-right text-green-600">+$12,300</td>
                      <td className="py-3 pl-4 text-right">Unpaid time off</td>
                    </tr>
                    <tr className="font-bold" style={{ borderTop: '2px solid var(--border-color)' }}>
                      <td className="py-3 pr-4" style={{ color: 'var(--text-primary)' }}>Estimated Net Value</td>
                      <td className="py-3 px-4 text-right text-indigo-600">~$133,000</td>
                      <td className="py-3 pl-4 text-right" style={{ color: 'var(--color-primary)' }}>~$119,500*</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                *1099 net does not include SEP-IRA tax savings (contributing $40K = ~$9,600 tax savings at 24% bracket), which narrows the gap significantly. Also, 1099 earners who contribute maximally to SEP-IRA build retirement wealth faster. At $250K+ gross 1099 income, the 1099 model becomes clearly advantageous.
              </p>
            </div>
          </div>

          {/* Tax Tips */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3 mb-4">
                <Calculator className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Tax Optimization for 1099 PMHNPs</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Common Deductions</h3>
                  <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Home office (dedicated space = $1,500 simplified deduction)</span></li>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Mileage ($0.67/mile for 2024) or actual vehicle expenses</span></li>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Health insurance premiums (100% deductible)</span></li>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Professional liability/malpractice insurance</span></li>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>CME courses, conferences, and subscriptions</span></li>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Professional memberships (AANP, APNA, ISPN)</span></li>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Technology: laptop, phone, EHR software</span></li>
                    <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>QBI deduction (20% pass-through — consult CPA for eligibility)</span></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Retirement Savings Comparison</h3>
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>SEP-IRA</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Up to 25% of net earnings (max $66,000/yr). Simple to set up. One contribution tier.</div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Solo 401(k) ⭐</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>$23,000 employee + 25% employer = up to $69,000 total. Roth option available. Best for maximizing contributions.</div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>W2 Employer 401(k)</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>$23,000 employee + 3-6% employer match. Less total capacity but guaranteed match is free money.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* When to Choose Each */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>When to Choose 1099 vs W2</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Choose 1099 If You:</h3>
                  <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <li className="flex gap-2"><TrendingUp className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /><span>Have 2+ years of clinical experience</span></li>
                    <li className="flex gap-2"><TrendingUp className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /><span>Want maximum income potential</span></li>
                    <li className="flex gap-2"><TrendingUp className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /><span>Value schedule flexibility and autonomy</span></li>
                    <li className="flex gap-2"><TrendingUp className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /><span>Are comfortable managing business finances</span></li>
                    <li className="flex gap-2"><TrendingUp className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /><span>Have a spouse with health insurance</span></li>
                    <li className="flex gap-2"><TrendingUp className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /><span>Are planning to open a private practice</span></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-3 text-indigo-600">Choose W2 If You:</h3>
                  <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <li className="flex gap-2"><Building2 className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" /><span>Are a new graduate seeking mentorship</span></li>
                    <li className="flex gap-2"><Building2 className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" /><span>Need employer-sponsored health insurance</span></li>
                    <li className="flex gap-2"><Building2 className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" /><span>Prefer predictable income and schedule</span></li>
                    <li className="flex gap-2"><Building2 className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" /><span>Want employer-paid malpractice coverage</span></li>
                    <li className="flex gap-2"><Building2 className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" /><span>Value PTO, CME allowance, and retirement match</span></li>
                    <li className="flex gap-2"><Building2 className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" /><span>Qualify for employer loan repayment programs</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>1099 vs W2 FAQs</h2>
              {compFaqs.map((faq, idx) => (
                <div key={idx} className="mb-6 last:mb-0">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{faq.question}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Related Resources */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Link href="/jobs/1099" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📋 Browse 1099 PMHNP Jobs</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Independent contractor positions updated daily.</p>
            </Link>
            <Link href="/resources/private-practice-guide" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🏥 Private Practice Guide</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Start your own PMHNP practice step by step.</p>
            </Link>
            <Link href="/salary-guide" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💰 2026 Salary Guide</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Full salary data by state, setting, and experience.</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
