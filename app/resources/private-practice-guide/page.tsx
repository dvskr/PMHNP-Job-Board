import { Metadata } from 'next';
import Link from 'next/link';
import { Building2, DollarSign, FileText, CheckCircle, Shield, Users, BookOpen, Landmark } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: 'How to Start a PMHNP Private Practice — Step-by-Step Guide 2026',
  description: 'Complete guide to starting your own psychiatric NP private practice. LLC formation, insurance credentialing (CAQH, NPI), EHR setup, malpractice insurance, billing, overhead costs, and income projections ($200K-$300K+).',
  keywords: ['PMHNP private practice', 'how to start psychiatric NP private practice', 'PMHNP private practice income', 'psychiatric nurse practitioner own practice', 'PMHNP business startup', 'psych NP private practice'],
  openGraph: {
    title: 'How to Start a PMHNP Private Practice — 2026 Guide',
    description: 'Step-by-step guide to launching your own psychiatric nurse practitioner private practice.',
    type: 'article',
  },
  alternates: { canonical: 'https://pmhnphiring.com/resources/private-practice-guide' },
};

export default function PrivatePracticeGuidePage() {
  const steps = [
    {
      number: 1,
      title: 'Verify Your State Requirements',
      icon: Shield,
      content: 'Check your state\'s practice authority laws. In 34 Full Practice Authority states + DC, you can practice independently. In reduced/restricted states, you\'ll need a collaborative agreement with a physician. See our Full Practice Authority Guide for details.',
      link: { href: '/resources/fpa-guide', text: 'View FPA Guide →' },
    },
    {
      number: 2,
      title: 'Form Your Business Entity',
      icon: Landmark,
      content: 'Most PMHNPs choose a Professional Limited Liability Company (PLLC) for liability protection and tax flexibility. Key steps: choose a business name, file with your Secretary of State ($100-$500), get an EIN from the IRS (free), and open a business bank account.',
      details: [
        'LLC/PLLC: Best for most solo practitioners ($100-$500 to form)',
        'S-Corp election: Consider when income exceeds $80K+ for tax savings',
        'Professional liability: PLLC protects personal assets from business debts',
        'Consult a healthcare attorney for state-specific requirements',
      ],
    },
    {
      number: 3,
      title: 'Get Insurance Credentialing',
      icon: FileText,
      content: 'Insurance credentialing allows you to bill insurance companies directly. This process takes 90-180 days, so start early.',
      details: [
        'Create your CAQH ProView profile (universal credentialing application)',
        'Apply for an individual NPI number (Type 1) and organizational NPI (Type 2)',
        'Credential with major payers: Aetna, BCBS, Cigna, UnitedHealthcare, Medicare',
        'Consider Medicaid credentialing for your state',
        'Typical timeline: 90-180 days from application to approval',
      ],
    },
    {
      number: 4,
      title: 'Set Up Your EHR & Billing',
      icon: BookOpen,
      content: 'Choose an EHR (Electronic Health Records) system with integrated billing. Popular options for psychiatric private practices include:',
      details: [
        'SimplePractice: $69-$99/month — Popular for psych practices, includes telehealth',
        'TherapyNotes: $49-$59/month — Designed for mental health, excellent documentation',
        'Valant: Custom pricing — Built specifically for behavioral health practices',
        'DrChrono: $200+/month — Full-featured, good for larger practices',
        'Consider outsourcing billing ($500-$1,500/month or 6-8% of collections)',
      ],
    },
    {
      number: 5,
      title: 'Secure Malpractice Insurance',
      icon: Shield,
      content: 'Individual malpractice (professional liability) insurance is essential. Most private practice PMHNPs need:',
      details: [
        'Occurrence-based policy (preferred): $1,500-$3,000/year',
        'Coverage: Minimum $1M per occurrence / $3M aggregate',
        'Popular carriers: NSO, HPSO, CM&F, Berxi',
        'Consider cyber liability insurance if using telehealth',
        'General liability insurance: $300-$800/year for office space',
      ],
    },
    {
      number: 6,
      title: 'Launch & Build Your Caseload',
      icon: Users,
      content: 'Plan for 3-6 months to build a full caseload. A typical full-time private practice PMHNP sees 20-30 patients per week.',
      details: [
        'Create a professional website with online scheduling',
        'Register on Psychology Today ($29.95/month) and Zocdoc',
        'Network with local therapists, PCPs, and psychiatrists for referrals',
        'Consider contract work initially to maintain income while building',
        'Set competitive rates: $150-$300 for initial evaluations, $100-$200 for follow-ups',
      ],
    },
  ];

  const ppFaqs = [
    {
      question: "How much does it cost to start a PMHNP private practice?",
      answer: "Startup costs range from $5,000-$20,000 for a lean telehealth practice to $30,000-$75,000 for a brick-and-mortar office. Core costs include PLLC formation ($100-500), EHR ($50-200/month), malpractice insurance ($1,500-3,000/year), credentialing fees, and marketing. Many PMHNPs start with a virtual practice to minimize overhead."
    },
    {
      question: "How much can a PMHNP private practice owner earn?",
      answer: "After building a full caseload (20-30 patients/week), private practice PMHNPs typically earn $200,000-$300,000+ gross revenue. After overhead (25-40%), net income is $120,000-$225,000+. Top earners seeing 30+ patients/week with efficient overhead can net $250,000+. Telehealth practices generally have lower overhead (15-25%)."
    },
    {
      question: "How long does it take to build a full private practice caseload?",
      answer: "Most PMHNPs reach a full caseload within 6-12 months. Factors that speed this up include accepting insurance (vs cash-only), being in an underserved area, Psychology Today listing, networking with local therapists, and having a specialty niche. Many PMHNPs maintain part-time employment while building their practice."
    },
    {
      question: "Should I accept insurance or go cash-pay only?",
      answer: "Insurance-based practices fill caseloads faster and serve more patients, but involve lower reimbursement rates ($100-$200/visit) and administrative burden. Cash-pay practices offer higher rates ($200-$400/visit) and less paperwork, but take longer to fill. Many successful practices accept a mix of both."
    },
    {
      question: "Can new grad PMHNPs open a private practice?",
      answer: "It is possible but not recommended. Most experts suggest gaining 2-3 years of clinical experience in structured settings (community mental health, group practices) before opening a private practice. This builds clinical confidence, medication management skills, and a professional network for referrals."
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Resources", url: "https://pmhnphiring.com/resources" },
        { name: "Private Practice Guide", url: "https://pmhnphiring.com/resources/private-practice-guide" }
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: ppFaqs.map((faq) => ({
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
            '@type': 'HowTo',
            name: 'How to Start a PMHNP Private Practice',
            description: 'Step-by-step guide to launching your own psychiatric nurse practitioner private practice.',
            step: steps.map((s) => ({
              '@type': 'HowToStep',
              name: s.title,
              text: s.content,
              position: s.number,
            })),
          }),
        }}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-6">
              <Building2 className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              How to Start a PMHNP Private Practice
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | Step-by-step startup guide
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              From LLC formation to full caseload — everything you need to launch your psychiatric NP practice
            </p>
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">$200-300K+</div>
                <div className="text-sm text-teal-100">Annual Revenue Potential</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">6-12 mo</div>
                <div className="text-sm text-teal-100">Time to Full Caseload</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">$5-20K</div>
                <div className="text-sm text-teal-100">Lean Startup Cost</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">

          {/* Step-by-Step Guide */}
          <div className="space-y-6 mb-12">
            {steps.map((step) => (
              <div key={step.number} className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-lg">
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                      {step.title}
                    </h2>
                    <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {step.content}
                    </p>
                    {step.details && (
                      <ul className="space-y-2">
                        {step.details.map((detail, idx) => (
                          <li key={idx} className="flex gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {step.link && (
                      <Link href={step.link.href} className="inline-block mt-3 text-sm font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
                        {step.link.text}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Income Projections */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3 mb-4">
                <DollarSign className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Income Projections</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th className="text-left py-3 pr-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Scenario</th>
                      <th className="text-right py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Patients/Week</th>
                      <th className="text-right py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Gross Revenue</th>
                      <th className="text-right py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Overhead</th>
                      <th className="text-right py-3 pl-4 font-semibold" style={{ color: 'var(--color-primary)' }}>Net Income</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--text-secondary)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Part-Time (Telehealth)</td>
                      <td className="py-3 px-4 text-right">12-15</td>
                      <td className="py-3 px-4 text-right">$100,000-$130,000</td>
                      <td className="py-3 px-4 text-right">15-20%</td>
                      <td className="py-3 pl-4 text-right font-semibold" style={{ color: 'var(--color-primary)' }}>$80,000-$110,000</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Full-Time (Telehealth)</td>
                      <td className="py-3 px-4 text-right">22-28</td>
                      <td className="py-3 px-4 text-right">$200,000-$280,000</td>
                      <td className="py-3 px-4 text-right">15-25%</td>
                      <td className="py-3 pl-4 text-right font-semibold" style={{ color: 'var(--color-primary)' }}>$150,000-$240,000</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Full-Time (Office)</td>
                      <td className="py-3 px-4 text-right">22-28</td>
                      <td className="py-3 px-4 text-right">$220,000-$300,000</td>
                      <td className="py-3 px-4 text-right">30-40%</td>
                      <td className="py-3 pl-4 text-right font-semibold" style={{ color: 'var(--color-primary)' }}>$130,000-$210,000</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>Cash-Pay Premium</td>
                      <td className="py-3 px-4 text-right">18-25</td>
                      <td className="py-3 px-4 text-right">$250,000-$400,000</td>
                      <td className="py-3 px-4 text-right">15-25%</td>
                      <td className="py-3 pl-4 text-right font-semibold" style={{ color: 'var(--color-primary)' }}>$190,000-$340,000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                *Income projections based on industry averages. Actual results vary by location, payer mix, and specialty. See our <Link href="/salary-guide" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>salary guide</Link> for regional data.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Private Practice FAQs</h2>
              {ppFaqs.map((faq, idx) => (
                <div key={idx} className="mb-6 last:mb-0">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{faq.question}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Related Resources */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Link href="/resources/fpa-guide" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🛡️ Full Practice Authority</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Check if your state allows independent practice.</p>
            </Link>
            <Link href="/resources/1099-vs-w2" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📊 1099 vs W2 Guide</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Compare compensation models for your practice.</p>
            </Link>
            <Link href="/jobs/private-practice" className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💼 Private Practice Jobs</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Browse private practice PMHNP positions.</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
