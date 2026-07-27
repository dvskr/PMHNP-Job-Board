import { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  AtSign,
  Award,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  LayoutList,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import ResumeCheckerUpload from '@/components/tools/ResumeCheckerUpload';
import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { getCurrentUser } from '@/lib/auth/protect';

// Same base-URL source as the sitemap and the other tools pages, so
// canonicals can never diverge from the URLs we advertise.
const BASE_URL = brand.baseUrl;

export const metadata: Metadata = {
  title: 'Free PMHNP Resume Checker: Instant ATS-Style Score',
  description:
    'Upload your PMHNP resume and get an instant score across the 8 dimensions employers screen for: licensure, ANCC certification, DEA, clinical scope, quantified impact, structure, contact, and recency. Free with a PMHNP Hiring account, scored in memory and never stored.',
  keywords: [
    'pmhnp resume checker',
    'pmhnp resume score',
    'psychiatric nurse practitioner resume',
    'pmhnp resume ats check',
    'nurse practitioner resume checker',
  ],
  alternates: { canonical: `${BASE_URL}/tools/resume-checker` },
  openGraph: {
    title: 'Free PMHNP Resume Checker: Instant ATS-Style Score',
    description:
      'Instant score across the 8 dimensions PMHNP employers screen for. Free with an account, scored in memory and never stored.',
    type: 'website',
    url: `${BASE_URL}/tools/resume-checker`,
  },
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const DIMENSIONS = [
  {
    icon: <BadgeCheck className="w-5 h-5" aria-hidden="true" />,
    name: 'Licensure',
    body: 'RN and APRN licensure with states listed, because state eligibility is the first thing screeners check.',
  },
  {
    icon: <Award className="w-5 h-5" aria-hidden="true" />,
    name: 'ANCC certification',
    body: 'The PMHNP-BC credential, spelled out where both parsing software and human reviewers can find it.',
  },
  {
    icon: <Pill className="w-5 h-5" aria-hidden="true" />,
    name: 'DEA registration',
    body: 'Active DEA registration, which most prescribing roles require before an interview is even scheduled.',
  },
  {
    icon: <Stethoscope className="w-5 h-5" aria-hidden="true" />,
    name: 'Clinical scope',
    body: 'Patient populations, care settings, and medication management experience that show the breadth of your practice.',
  },
  {
    icon: <BarChart3 className="w-5 h-5" aria-hidden="true" />,
    name: 'Quantified impact',
    body: 'Caseload sizes, outcomes, and other concrete numbers that turn a list of duties into evidence.',
  },
  {
    icon: <LayoutList className="w-5 h-5" aria-hidden="true" />,
    name: 'Structure',
    body: 'Clean sections and ordering that applicant tracking systems can parse without mangling your history.',
  },
  {
    icon: <AtSign className="w-5 h-5" aria-hidden="true" />,
    name: 'Contact details',
    body: 'Name, credentials, phone, and email present and easy to find at the top of the document.',
  },
  {
    icon: <CalendarClock className="w-5 h-5" aria-hidden="true" />,
    name: 'Recency',
    body: 'Dates and a clearly marked current role that make your recent experience obvious at a glance.',
  },
];

export default async function ResumeCheckerPage() {
  // Non-redirecting check: the page stays fully readable for anonymous
  // visitors; only running a check requires an account.
  const authed = await getCurrentUser();
  const isAuthenticated = !!authed;
  return (
    <div style={{ backgroundColor: '#FDFBF7', minHeight: '100vh' }}>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: BASE_URL },
          { name: 'Tools', url: `${BASE_URL}/tools` },
          { name: 'Resume Checker', url: `${BASE_URL}/tools/resume-checker` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'PMHNP Resume Checker',
            url: `${BASE_URL}/tools/resume-checker`,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Upload a psychiatric mental health nurse practitioner resume and get an instant ATS-style score across 8 dimensions: licensure, ANCC certification, DEA, clinical scope, quantified impact, structure, contact, and recency.',
            publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: BASE_URL },
          }),
        }}
      />

      {/* Layout's <main> already pads below the fixed header, so keep our own
          top padding small so the page doesn't open on a void. */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <h1
          className="text-3xl sm:text-4xl font-extrabold"
          style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
        >
          Free PMHNP Resume Checker
        </h1>
        <p className="mt-3 text-base max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Upload your resume and get an instant ATS-style score built on an 8-dimension PMHNP
          rubric: RN and APRN licensure, ANCC certification, DEA registration, clinical scope,
          quantified impact, structure, contact details, and recency. The same things a
          psychiatric hiring screener checks in the first thirty seconds.
        </p>

        <div className="mt-8">
          <ResumeCheckerUpload isAuthenticated={isAuthenticated} />
        </div>

        {/* Privacy strip */}
        <div
          className="mt-6 flex items-start gap-3 rounded-2xl px-5 py-4"
          style={{ background: '#F0FDFA', border: '1px solid #CCFBF1' }}
        >
          <ShieldCheck
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: '#0D9488' }}
            aria-hidden="true"
          />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: '#1A2E35' }}>Private by default.</strong> Your file is scored
            in memory and never stored: no copy is written to disk and nothing about its contents is
            saved. Once your score comes back, the file is gone. Signing in ties the checker and the
            AI resume tools to your account; it does not change what happens to your file.
          </p>
        </div>

        {/* Methodology */}
        <div style={{ ...clayCard, padding: '24px', marginTop: '28px' }}>
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
          >
            How the 8-dimension rubric works
          </h2>
          <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            Generic resume checkers grade you like a software engineer. This one grades you like a
            PMHNP: each dimension below reflects something psychiatric employers actually screen
            for, and together they add up to a score out of 100.
          </p>
          <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {DIMENSIONS.map((dimension) => (
              <div key={dimension.name} className="flex items-start gap-3">
                <div
                  className="inline-flex shrink-0 items-center justify-center rounded-xl p-2"
                  style={{ background: '#F0FDFA', color: '#0D9488' }}
                >
                  {dimension.icon}
                </div>
                <div>
                  <h3
                    className="text-sm font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {dimension.name}
                  </h3>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {dimension.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA cards */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div style={{ ...clayCard, padding: '24px' }}>
            <div
              className="inline-flex items-center justify-center rounded-2xl p-3"
              style={{ background: '#F0FDFA', color: '#0D9488' }}
            >
              <Sparkles className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2
              className="mt-4 text-xl font-bold"
              style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
            >
              Keep going in the resume studio
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Save your resume, build separate versions for different roles, and get an AI deep
              review with specific rewrite suggestions. Free with your account.
            </p>
            <Link
              href="/dashboard/resume-studio"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ background: '#0D9488' }}
            >
              Open the resume studio
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <p className="mt-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No account yet?{' '}
              <Link href="/signup" className="font-semibold hover:underline" style={{ color: '#0D9488' }}>
                Create one free
              </Link>
              , or start from scratch with the{' '}
              <Link
                href="/tools/resume-builder"
                className="font-semibold hover:underline"
                style={{ color: '#0D9488' }}
              >
                resume builder
              </Link>
              .
            </p>
          </div>

          <div style={{ ...clayCard, padding: '24px' }}>
            <div
              className="inline-flex items-center justify-center rounded-2xl p-3"
              style={{ background: '#F0FDFA', color: '#0D9488' }}
            >
              <Wrench className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2
              className="mt-4 text-xl font-bold"
              style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
            >
              More free PMHNP tools
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Offer analyzer, 1099 vs W-2 calculator, salary converter, and the practice authority
              map. All free, all built on live posting data, none behind a signup.
            </p>
            <Link
              href="/tools"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
              style={{ color: '#0D9488', border: '1px solid #0D9488' }}
            >
              Browse all tools
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
