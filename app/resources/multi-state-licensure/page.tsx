import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { siteAsset } from '@/lib/asset-url';
import { Metadata } from 'next';
import Link from 'next/link';
import { Globe2, CheckCircle, AlertTriangle, MapPin, Stethoscope, BookOpen } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

// Bump on each editorial review pass — Article.dateModified should reflect
// real freshness, not be permanently frozen at the original publish date.
// Review at least quarterly; sooner if NLC membership changes or the APRN
// Compact reaches operational status (that event rewrites this page).
const PUBLISHED_AT = '2026-08-04';
const LAST_REVIEWED = '2026-08-04';
const HERO_IMAGE = siteAsset('images/pages/pmhnp-career-resources-guides.webp');

export const metadata: Metadata = {
  title: 'Multi-State Licensure for PMHNPs: NLC, APRN Compact & Telehealth',
  description: 'How multi-state practice actually works for psychiatric nurse practitioners: what the Nurse Licensure Compact does and does not cover, the status of the APRN Compact, telehealth licensure rules, and a practical playbook for licensing in additional states.',
  keywords: ['PMHNP multi-state licensure', 'nurse licensure compact APRN', 'APRN compact status', 'PMHNP telehealth licensure', 'nurse practitioner license multiple states', 'compact license psychiatric NP'],
  openGraph: {
    title: 'Multi-State Licensure for PMHNPs: What the Compacts Do and Do Not Cover',
    description: 'The NLC covers RN licensure, not your APRN role. A precise, practical guide to practicing in multiple states as a PMHNP.',
    type: 'article',
    images: [{ url: HERO_IMAGE, width: 1280, height: 900, alt: 'Multi-state licensure guide for PMHNPs' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Multi-State Licensure for PMHNPs',
    images: [HERO_IMAGE],
  },
  alternates: { canonical: `${brand.baseUrl}/resources/multi-state-licensure` },
};

export default function MultiStateLicensurePage() {
  // Deliberately qualitative: compact membership rosters change, so this
  // page names NO membership counts it would have to keep current. The
  // one safe, load-bearing fact is the layer distinction (RN compact vs
  // state-by-state APRN licensure), which is what readers get wrong.
  const faqs = [
    {
      question: 'Can I practice as a PMHNP in multiple states with one license?',
      answer: 'Not with one license today. APRN licensure is issued state by state, so you need an APRN license (or equivalent recognition) in each state where your patients are located. The Nurse Licensure Compact can cover the RN layer of your credential across member states, but your PMHNP scope comes from each state\'s APRN license, which the NLC does not grant.',
    },
    {
      question: 'Does the Nurse Licensure Compact (NLC) cover nurse practitioners?',
      answer: 'No. The NLC is an RN and LPN/VN compact. If your primary state of residence is an NLC member state, your multistate RN license lets you practice as an RN in other member states. It does not authorize advanced practice: diagnosing, prescribing, and the rest of the PMHNP role still require a separate APRN license in each state of practice. An NLC RN license can still help, because many boards require an active RN license as part of the APRN application.',
    },
    {
      question: 'What is the APRN Compact, and is it in effect?',
      answer: 'The APRN Compact is a separate interstate agreement, modeled on the NLC, that would create a multistate APRN license. Only a small number of states have enacted it and it is not broadly operational, so you should not plan a multi-state career around it today. Check the state boards involved or NCSBN for the current status before relying on it.',
    },
    {
      question: 'What do I need to see patients in another state via telehealth?',
      answer: 'Licensure follows the patient. For a telehealth visit, the rules of the state where the patient is physically located at the time of the visit apply, so you generally need an APRN license in that state, plus any collaborative or supervisory arrangement that state requires, before the first appointment. Pandemic-era waivers that relaxed this have largely expired.',
    },
    {
      question: 'Do I need a separate DEA registration for each state?',
      answer: 'Plan on it if you prescribe controlled substances. DEA registration is tied to a practice location within a state, and prescribing for patients in an additional state generally means registering there as well. Some states also require their own controlled substance registration on top of the DEA registration. Confirm the requirements of each state before prescribing.',
    },
    {
      question: 'How long does it take to add a license in another state?',
      answer: 'It varies widely by board and by season, from a few weeks to several months. Endorsement applications typically involve license verification, education and certification verification, background checks, and fees. If you are targeting a telehealth or locum role, start the licensure process before you need the state, and ask employers whether they sponsor and pay for multi-state licensing, because many telehealth companies do.',
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Resources', url: 'https://pmhnphiring.com/resources' },
        { name: 'Multi-State Licensure', url: 'https://pmhnphiring.com/resources/multi-state-licensure' },
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((faq) => ({
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
            headline: 'Multi-State Licensure for PMHNPs: NLC, APRN Compact, and Telehealth',
            description: 'How multi-state practice actually works for psychiatric nurse practitioners: the RN compact vs state-by-state APRN licensure, the APRN Compact status, and a practical playbook.',
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
              <Globe2 className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Multi-State Licensure for PMHNPs
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Reviewed: {new Date(LAST_REVIEWED + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6">
              What the Nurse Licensure Compact actually covers, where the APRN Compact stands, and how to build a multi-state practice the correct way
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">

          {/* The two layers */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Your Credential Has Two Layers, and Only One Travels
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                Every PMHNP holds two distinct authorizations: an <strong>RN license</strong> and an <strong>APRN license</strong> built on top of it. The single most common multi-state misunderstanding is assuming that a &quot;compact license&quot; covers both. It does not.
              </p>
              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-green-800">RN layer: the NLC can travel</h3>
                  </div>
                  <p className="text-sm text-green-700">
                    The Nurse Licensure Compact (NLC) lets nurses whose primary state of residence is a member state hold one multistate RN license and practice as an RN in other member states. Most states participate, but membership changes, so verify your states with NCSBN or the state boards.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <h3 className="font-semibold text-yellow-800">APRN layer: state by state, today</h3>
                  </div>
                  <p className="text-sm text-yellow-700">
                    Everything that makes you a PMHNP (diagnosing, prescribing, managing treatment) comes from each state&apos;s APRN license. The NLC does not grant any of it. To see patients in another state, you need that state&apos;s APRN license first, plus whatever collaboration or supervision that state requires.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* APRN Compact status */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                The APRN Compact Is Not the NLC, and It Is Not Here Yet
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                There <em>is</em> a proposed multistate answer for the APRN layer: the <strong>APRN Compact</strong>, a separate interstate agreement modeled on the NLC. The honest status report: only a small number of states have enacted it, and it is <strong>not broadly operational</strong>. No PMHNP should plan a career today on the assumption of a multistate APRN license.
              </p>
              <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span>Enactment is not activation: a state passing the compact does not mean multistate APRN privileges exist yet.</span></li>
                <li className="flex gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" /><span>Recruiters and job posts sometimes say &quot;compact license accepted&quot; loosely. Clarify whether they mean the RN-layer NLC (common) or actual APRN privileges (not broadly available).</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Check NCSBN and the boards of the specific states you care about for the current status. Compact rosters change, which is exactly why this page names no counts.</span></li>
              </ul>
            </div>
          </div>

          {/* Practical playbook */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3 mb-4">
                <MapPin className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  The Playbook: Adding a State the Correct Way
                </h2>
              </div>
              <ol className="space-y-4 text-sm list-decimal list-inside" style={{ color: 'var(--text-secondary)' }}>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>Secure the RN layer.</strong> If your primary state of residence is an NLC member, your multistate RN license usually satisfies the RN prerequisite in other member states. If not, apply for RN licensure by endorsement in the target state first or in parallel.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>Apply for APRN licensure by endorsement.</strong> Expect license, education, and national certification (ANCC) verification, a background check, and fees. Timelines vary from weeks to months by board, so start before you need the state.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>Check the practice authority model.</strong> In Full Practice Authority states you can practice independently once licensed. Reduced and restricted states require a collaborative agreement or physician supervision in that state, which takes time and sometimes money to arrange. See the <Link href="/resources/fpa-guide" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Full Practice Authority guide</Link> and the <Link href="/tools/practice-authority-map" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>interactive map</Link>.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>Sort out prescribing.</strong> Plan on a DEA registration tied to each state where you prescribe controlled substances, plus any state-level controlled substance registration that state requires.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>For telehealth, license where the patients are.</strong> The patient&apos;s physical location at the time of the visit governs. Many telehealth employers sponsor multi-state licensing; ask before paying out of pocket.
                </li>
              </ol>
            </div>
          </div>

          {/* Where it pays off */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3 mb-4">
                <Stethoscope className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Where Multi-State Licensure Pays Off
                </h2>
              </div>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                Every additional state license widens your job pool, and the roles that value it most are the ones hiring nationally:
              </p>
              <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><Link href="/jobs/telehealth" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Telehealth positions</Link>, where a multi-state license portfolio is often the hiring differentiator</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><Link href="/jobs/remote" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Remote roles</Link> that assign patient panels by the states you hold</span></li>
                <li className="flex gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><Link href="/jobs/travel" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Travel and locum tenens assignments</Link>, where a ready license shortens the start date</span></li>
              </ul>
              <p className="text-sm mt-4" style={{ color: 'var(--text-secondary)' }}>
                For state-specific requirements, boards, and timelines, use the <Link href="/resources" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>state licensure guides</Link>, and compare what postings advertise per state in the <Link href="/salary-guide" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>salary guide</Link>.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Frequently Asked Questions</h2>
              {faqs.map((faq, idx) => (
                <div key={idx} className="mb-6 last:mb-0">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{faq.question}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{faq.answer}</p>
                </div>
              ))}
              <p className="text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
                This page is career guidance, not legal advice. Compact membership and board rules change; always verify current requirements with the state board of nursing or NCSBN before making licensure decisions.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <BookOpen className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            </div>
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Put Those Licenses to Work
            </h2>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
              Browse PMHNP roles that hire across state lines, updated daily.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/jobs/telehealth" className="inline-block bg-teal-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-teal-700 transition-colors">Telehealth Jobs</Link>
              <Link href="/jobs/remote" className="inline-block bg-white px-8 py-3 rounded-lg font-medium border border-teal-200 hover:bg-teal-50 transition-colors" style={{ color: 'var(--color-primary)' }}>Remote Jobs</Link>
              <Link href="/resources/fpa-guide" className="inline-block bg-white px-8 py-3 rounded-lg font-medium border border-teal-200 hover:bg-teal-50 transition-colors" style={{ color: 'var(--color-primary)' }}>Practice Authority Guide</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
