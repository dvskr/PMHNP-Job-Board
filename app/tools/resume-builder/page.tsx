import { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  FileDown,
  Gauge,
  Layers,
  PenLine,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';

// Same base-URL source as the sitemap and the other tools pages, so
// canonicals can never diverge from the URLs we advertise.
const BASE_URL = brand.baseUrl;

export const metadata: Metadata = {
  title: 'PMHNP Resume Builder: Licensure-First Templates & AI Review',
  description:
    'Build a PMHNP resume from your PMHNP Hiring profile with the sections employers screen for: RN and APRN licensure by state, ANCC certification, DEA, EMR systems, and patient populations. Instant rubric score, AI review, and PDF export.',
  keywords: [
    'pmhnp resume builder',
    'nurse practitioner resume builder',
    'pmhnp resume template',
    'psychiatric nurse practitioner resume',
    'pmhnp resume example',
  ],
  alternates: { canonical: `${BASE_URL}/tools/resume-builder` },
  openGraph: {
    title: 'PMHNP Resume Builder: Licensure-First Templates & AI Review',
    description:
      'Resume sections PMHNP employers actually screen for, instant rubric scoring, AI review, and PDF export. Free to start.',
    type: 'website',
    url: `${BASE_URL}/tools/resume-builder`,
  },
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const SCREENING_SECTIONS = [
  'RN and APRN licensure by state',
  'ANCC certification',
  'DEA registration',
  'EMR systems',
  'Patient populations',
];

const FEATURES = [
  {
    icon: <Layers className="w-5 h-5" aria-hidden="true" />,
    title: 'Multiple versions',
    body: 'Keep separate versions for telehealth, inpatient, and private practice roles, and switch between them without retyping anything.',
  },
  {
    icon: <FileDown className="w-5 h-5" aria-hidden="true" />,
    title: 'PDF export',
    body: 'Export a clean, ATS-friendly PDF whenever a posting asks for an upload.',
  },
  {
    icon: <Gauge className="w-5 h-5" aria-hidden="true" />,
    title: 'Instant rubric score',
    body: 'Every version is scored against the same 8-dimension PMHNP rubric as the free checker, so you can watch the number climb as you edit.',
  },
  {
    icon: <Sparkles className="w-5 h-5" aria-hidden="true" />,
    title: 'AI deep review',
    body: 'A detailed AI review of your resume with specific rewrite suggestions, 3 per day free.',
  },
  {
    icon: <Target className="w-5 h-5" aria-hidden="true" />,
    title: 'AI tailoring',
    body: 'Point the studio at a specific posting and get your resume tailored to that exact role, 3 per day free.',
  },
  {
    icon: <PenLine className="w-5 h-5" aria-hidden="true" />,
    title: 'Cover letters',
    body: 'Generate a matching cover letter for any posting you are applying to, 2 per day free.',
  },
];

const STEPS = [
  {
    title: 'Start from your profile',
    body: 'Your licensure, certification, and experience from your PMHNP Hiring profile prefill the builder, so you never start from a blank page.',
  },
  {
    title: 'Build and score',
    body: 'Edit each section, watch the rubric score update as you go, and run an AI deep review when you want line-level feedback.',
  },
  {
    title: 'Export and apply',
    body: 'Download a polished PDF, or apply directly to live PMHNP postings without leaving the site.',
  },
];

export default function ResumeBuilderPage() {
  return (
    <div style={{ backgroundColor: '#FDFBF7', minHeight: '100vh' }}>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: BASE_URL },
          { name: 'Tools', url: `${BASE_URL}/tools` },
          { name: 'Resume Builder', url: `${BASE_URL}/tools/resume-builder` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'PMHNP Resume Builder',
            url: `${BASE_URL}/tools/resume-builder`,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Build a psychiatric mental health nurse practitioner resume with licensure-first sections, instant rubric scoring, AI review and tailoring, cover letters, and PDF export.',
            publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: BASE_URL },
          }),
        }}
      />

      {/* Layout's <main> already pads below the fixed header, so keep our own
          top padding small so the page doesn't open on a void. */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        {/* Hero */}
        <h1
          className="text-3xl sm:text-4xl font-extrabold"
          style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
        >
          PMHNP Resume Builder
        </h1>
        <p className="mt-3 text-base max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Build your resume from your PMHNP Hiring profile, structured around the sections
          psychiatric employers actually screen for instead of a generic template that buries your
          credentials below a hobbies section.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {SCREENING_SECTIONS.map((section) => (
            <li
              key={section}
              className="inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              <BadgeCheck className="w-4 h-4 shrink-0" style={{ color: '#0D9488' }} aria-hidden="true" />
              {section}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/resume-studio"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: '#0D9488' }}
          >
            Open the resume studio
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold"
            style={{ color: '#0D9488', border: '1px solid #0D9488' }}
          >
            Create a free account
          </Link>
        </div>

        {/* Feature grid */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} style={{ ...clayCard, padding: '20px' }}>
              <div className="flex items-center gap-2 font-semibold" style={{ color: '#0D9488' }}>
                {feature.icon}
                <span style={{ color: 'var(--text-primary)' }}>{feature.title}</span>
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {feature.body}
              </p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={{ ...clayCard, padding: '24px', marginTop: '28px' }}>
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
          >
            How it works
          </h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: '#0D9488' }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Privacy */}
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
            <strong style={{ color: '#1A2E35' }}>Your data stays in your account.</strong> Resume
            content is only shared with an employer when you choose to apply, and you can delete
            any version, or your whole account, at any time.
          </p>
        </div>

        {/* Cross-link to the checker */}
        <div style={{ ...clayCard, padding: '24px', marginTop: '28px' }}>
          <div className="flex items-start gap-3">
            <div
              className="inline-flex shrink-0 items-center justify-center rounded-2xl p-3"
              style={{ background: '#F0FDFA', color: '#0D9488' }}
            >
              <ScanSearch className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}
              >
                Already have a resume? Score it first.
              </h2>
              <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
                The free resume checker grades the file you already have against the same
                8-dimension PMHNP rubric, scored in memory and never stored. Check it, see where it
                falls short, then fix it here.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
                <Link
                  href="/tools/resume-checker"
                  className="hover:underline"
                  style={{ color: '#0D9488' }}
                >
                  Try the free resume checker →
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
      </div>
    </div>
  );
}
