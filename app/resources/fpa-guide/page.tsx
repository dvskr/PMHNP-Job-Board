import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { Metadata } from 'next';
import Link from 'next/link';
import { Shield, MapPin, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { STATE_PRACTICE_AUTHORITY, getStatesByAuthority, getAuthorityColor, type PracticeAuthority } from '@/lib/state-practice-authority';

// Bump on each editorial review pass — Article.dateModified should reflect
// real freshness, not be permanently frozen at the original publish date.
// Update at least quarterly; sooner if NLC membership or state authority
// classifications change.
const PUBLISHED_AT = '2026-03-19';
const LAST_REVIEWED = '2026-03-19';
const HERO_IMAGE = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-career-resources-guides.webp';

export const metadata: Metadata = {
  title: 'PMHNP Full Practice Authority Guide 2026 — All 50 States',
  description: 'Complete state-by-state Full Practice Authority (FPA) guide for psychiatric nurse practitioners. See which states allow independent PMHNP practice, prescriptive authority rules, Nurse Licensure Compact states, and how FPA impacts salary (+12-15% premium).',
  keywords: ['PMHNP full practice authority', 'nurse practitioner independent practice states', 'FPA states 2026', 'PMHNP prescriptive authority by state', 'psych NP scope of practice', 'NLC compact states for NP'],
  openGraph: {
    title: 'Full Practice Authority Guide for PMHNPs — 2026',
    description: 'State-by-state FPA classifications. See where psychiatric nurse practitioners can practice independently.',
    type: 'article',
    images: [{ url: HERO_IMAGE, width: 1280, height: 900, alt: 'PMHNP Full Practice Authority Guide 2026' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PMHNP Full Practice Authority Guide 2026',
    images: [HERO_IMAGE],
  },
  alternates: { canonical: `${brand.baseUrl}/resources/fpa-guide` },
};

export default function FPAGuidePage() {
  const fullStates = getStatesByAuthority('full');
  const reducedStates = getStatesByAuthority('reduced');
  const restrictedStates = getStatesByAuthority('restricted');

  const allStates = Object.entries(STATE_PRACTICE_AUTHORITY).sort(([a], [b]) => a.localeCompare(b));

  const fpaFaqs = [
    {
      question: "What is Full Practice Authority for PMHNPs?",
      answer: "Full Practice Authority (FPA) means a PMHNP can evaluate patients, diagnose conditions, order and interpret tests, prescribe medications (including controlled substances), and manage treatment plans without physician oversight or a collaborative agreement. FPA states grant PMHNPs the same level of autonomy as physicians in their scope of practice."
    },
    {
      question: "How many states have Full Practice Authority for nurse practitioners?",
      answer: `As of 2026, ${fullStates.length} states (plus Washington D.C.) grant Full Practice Authority to PMHNPs. ${reducedStates.length} states have Reduced Practice (requiring collaborative agreements), and ${restrictedStates.length} states have Restricted Practice (requiring physician supervision).`
    },
    {
      question: "Does Full Practice Authority affect PMHNP salary?",
      answer: "Yes. PMHNPs in Full Practice Authority states earn 12-15% more on average than those in restricted states, due to increased autonomy, private practice opportunities, and higher demand. FPA states also have more job openings per capita."
    },
    {
      question: "Can PMHNPs prescribe controlled substances in all states?",
      answer: "PMHNPs can prescribe controlled substances in all 50 states, but the requirements differ. In FPA states, prescribing is independent. In reduced practice states, a collaborative agreement is needed. In restricted states, a supervisory protocol with a physician is required. All PMHNPs need DEA registration."
    },
    {
      question: "What is the Nurse Licensure Compact (NLC) and how does it help PMHNPs?",
      answer: "The NLC allows registered nurses to hold one multistate license and practice in all member states. While the NLC covers RN licensure, PMHNPs still need individual state APRN licenses. However, having an NLC RN license simplifies the APRN application process in many compact states. As of 2026, 41 states are NLC members."
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Resources", url: "https://pmhnphiring.com/resources" },
        { name: "Full Practice Authority Guide", url: "https://pmhnphiring.com/resources/fpa-guide" }
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: fpaFaqs.map((faq) => ({
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
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'PMHNP Full Practice Authority Guide 2026 — All 50 States',
            description: 'Complete state-by-state guide to Full Practice Authority for psychiatric nurse practitioners.',
            datePublished: PUBLISHED_AT,
            dateModified: LAST_REVIEWED,
            image: HERO_IMAGE,
            author: { '@type': 'Organization', name: 'PMHNP Hiring' },
            publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: 'https://pmhnphiring.com' },
          }),
        }}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-teal-600 to-teal-700 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-6">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              PMHNP Full Practice Authority Guide 2026
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              State-by-state practice authority classifications for psychiatric nurse practitioners
            </p>
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{fullStates.length}</div>
                <div className="text-sm text-teal-100">Full Practice Authority</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{reducedStates.length}</div>
                <div className="text-sm text-teal-100">Reduced Practice</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{restrictedStates.length}</div>
                <div className="text-sm text-teal-100">Restricted Practice</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">

          {/* What is FPA */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                What is Full Practice Authority (FPA)?
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                Full Practice Authority allows PMHNPs — also known as Psych NPs or psychiatric nurse practitioners — to evaluate patients, diagnose conditions, order and interpret diagnostic tests, prescribe medications (including controlled substances), and manage treatment plans <strong>without physician oversight</strong> or a collaborative agreement.
              </p>
              <div className="grid md:grid-cols-3 gap-4 mt-6">
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-green-800">Full Practice Authority</h3>
                  </div>
                  <p className="text-sm text-green-700">Independent practice. No physician oversight. Full prescriptive authority including Schedule II-V.</p>
                  <p className="text-xs text-green-600 mt-2 font-semibold">{fullStates.length} states + DC</p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <h3 className="font-semibold text-yellow-800">Reduced Practice</h3>
                  </div>
                  <p className="text-sm text-yellow-700">Requires a collaborative agreement with a physician. Physician does not need to be on-site.</p>
                  <p className="text-xs text-yellow-600 mt-2 font-semibold">{reducedStates.length} states</p>
                </div>
                <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-5 w-5 text-orange-600" />
                    <h3 className="font-semibold text-orange-800">Restricted Practice</h3>
                  </div>
                  <p className="text-sm text-orange-700">Requires physician supervision. Must practice under a supervisory protocol or agreement.</p>
                  <p className="text-xs text-orange-600 mt-2 font-semibold">{restrictedStates.length} states</p>
                </div>
              </div>
            </div>
          </div>

          {/* State-by-State Table */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                All 50 States + DC: Practice Authority Classification
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th className="text-left py-3 pr-4 font-semibold" style={{ color: 'var(--text-primary)' }}>State</th>
                      <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Practice Authority</th>
                      <th className="text-left py-3 pl-4 font-semibold hidden md:table-cell" style={{ color: 'var(--text-primary)' }}>Details</th>
                      <th className="text-right py-3 pl-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Jobs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStates.map(([stateName, info]) => {
                      const colors = getAuthorityColor(info.authority);
                      const stateSlug = stateName.toLowerCase().replace(/\s+/g, '-');
                      return (
                        <tr key={stateName} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td className="py-3 pr-4">
                            <Link href={`/jobs/state/${stateSlug}`} className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
                              {stateName}
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${colors.border} border`}>
                              {info.description}
                            </span>
                          </td>
                          <td className="py-3 pl-4 hidden md:table-cell text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {info.details}
                          </td>
                          <td className="py-3 pl-4 text-right">
                            <Link href={`/jobs/state/${stateSlug}`} className="text-xs font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
                              View →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Salary Impact */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                How Practice Authority Impacts PMHNP Salary
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                Practice authority directly impacts earning potential. PMHNPs in Full Practice Authority states benefit from:
              </p>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div className="text-2xl font-bold mb-1" style={{ color: 'var(--color-primary)' }}>+12-15%</div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Salary Premium</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>FPA states pay more due to higher demand and independent practice opportunities</div>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div className="text-2xl font-bold mb-1" style={{ color: 'var(--color-primary)' }}>2-3x</div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>More Private Practice Owners</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>FPA states enable easier private practice startup without physician partnership</div>
                </div>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                See our full <Link href="/salary-guide" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>2026 PMHNP Salary Guide</Link> for state-by-state salary data and our <Link href="/resources/private-practice-guide" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Private Practice Startup Guide</Link> for step-by-step instructions.
              </p>
            </div>
          </div>

          {/* Telehealth & Cross-State Practice */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3 mb-4">
                <MapPin className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Cross-State Telehealth &amp; Prescriptive Authority
                </h2>
              </div>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                For remote and telehealth PMHNPs, practice authority in the <strong>patient&apos;s state</strong> determines your scope — not your home state. Key considerations:
              </p>
              <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>You must hold an APRN license in each state where your patients are located</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>DEA registration is required in each state where you prescribe controlled substances</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Some telehealth companies handle multi-state licensing and credentialing for you</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span>Restricted practice states may require a collaborative physician in that specific state</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span>Pandemic-era telehealth waivers have mostly expired — verify current requirements</span></li>
              </ul>
              <p className="text-sm mt-4" style={{ color: 'var(--text-secondary)' }}>
                Browse <Link href="/jobs/remote" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>remote PMHNP jobs</Link> or <Link href="/jobs/telehealth" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>telehealth positions</Link> that handle multi-state licensing.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Frequently Asked Questions</h2>
              {fpaFaqs.map((faq, idx) => (
                <div key={idx} className="mb-6 last:mb-0">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{faq.question}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center py-8">
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Find PMHNP Jobs in Your State
            </h2>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
              Browse thousands of psychiatric nurse practitioner positions updated daily.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/jobs" className="inline-block bg-teal-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-teal-700 transition-colors">Browse All Jobs</Link>
              <Link href="/salary-guide" className="inline-block bg-white px-8 py-3 rounded-lg font-medium border border-teal-200 hover:bg-teal-50 transition-colors" style={{ color: 'var(--color-primary)' }}>View Salary Guide</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
