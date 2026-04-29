import { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import EmployerTrustSection from '@/components/EmployerTrustSection';
import FeaturedJobsSection from '@/components/FeaturedJobsSection';
import TopStatesSection from '@/components/TopStatesSection';
import HomepageHero from '@/components/HomepageHero';
import VideoJsonLd from '@/components/VideoJsonLd';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import StickyEmailBar from '@/components/StickyEmailBar';
import HomepageBlogSection from '@/components/HomepageBlogSection';
import EmployerHowItWorks from '@/components/EmployerHowItWorks';






// Revalidate every 60 seconds
export const revalidate = 60;

/**
 * Get total job count for dynamic metadata
 */
async function getTotalJobCount(): Promise<number> {
  try {
    const count = await prisma.job.count({
      where: { isPublished: true },
    });
    return count;
  } catch {
    return 200; // Fallback
  }
}

/**
 * Get unique employer count for dynamic metadata
 */
async function getUniqueEmployerCount(): Promise<number> {
  try {
    const result = await prisma.job.findMany({
      where: { isPublished: true },
      distinct: ['employer'],
      select: { employer: true },
    });
    return result.length;
  } catch {
    return 500; // Fallback
  }
}

/**
 * Generate dynamic metadata with job count
 */
export async function generateMetadata(): Promise<Metadata> {
  const [totalJobs, uniqueEmployerCount] = await Promise.all([
    getTotalJobCount(),
    getUniqueEmployerCount(),
  ]);
  const jobCountDisplay = totalJobs > 1000
    ? `${(Math.floor(totalJobs / 100) * 100).toLocaleString()}+`
    : totalJobs.toLocaleString();

  return {
    title: `${jobCountDisplay} PMHNP Jobs Near Me | Psych NP & Psychiatric Nurse Practitioner Job Board`,
    description: `Browse ${jobCountDisplay} PMHNP & Psych NP jobs near me, updated daily. Find remote, telehealth, and in-person psychiatric nurse practitioner positions with salary transparency across all 50 states. Free for job seekers.`,
    openGraph: {
      title: `${jobCountDisplay} PMHNP Jobs - Find Your Next Position`,
      description: `Browse ${jobCountDisplay} psychiatric nurse practitioner jobs. Remote, hybrid, and in-person positions with salary transparency.`,
      images: [
        {
          url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp',
          width: 1280,
          height: 900,
          alt: `PMHNP Hiring job board homepage showing ${jobCountDisplay} psychiatric nurse practitioner jobs from ${uniqueEmployerCount}+ companies across 50 states`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp'],
    },
    alternates: {
      canonical: 'https://pmhnphiring.com',
    },
  };
}

export default async function Home() {
  const totalJobs = await getTotalJobCount();
  const jobCountDisplay = totalJobs > 1000
    ? `${Math.floor(totalJobs / 100) * 100}+`
    : totalJobs.toLocaleString();

  return (
    <>
      {/* Structured data — outside content div to prevent hydration mismatch */}
      <VideoJsonLd pathname="/" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'PMHNP Hiring',
            url: 'https://pmhnphiring.com',
            logo: 'https://pmhnphiring.com/pmhnp_logo.png',
            description: 'The #1 job board for Psychiatric Mental Health Nurse Practitioners. Browse thousands of PMHNP jobs updated daily across all 50 states.',
            sameAs: [
              'https://x.com/pmhnphiring',
              'https://www.facebook.com/pmhnphiring',
              'https://www.instagram.com/pmhnphiring',
              'https://www.linkedin.com/company/pmhnpjobs',
              'https://www.youtube.com/@pmhnphiring',
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What is a PMHNP?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "A PMHNP (Psychiatric Mental Health Nurse Practitioner) is an advanced practice registered nurse (APRN) who specializes in mental health care. PMHNPs — also called Psych NPs or behavioral health nurse practitioners — can diagnose and treat mental health conditions, prescribe medications, and provide psychotherapy. They hold a Master's or Doctoral degree in psychiatric nursing and are certified by the ANCC as PMHNP-BC.",
                },
              },
              {
                "@type": "Question",
                name: "How much do PMHNPs make?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "PMHNPs earn an average salary of $155,000-$165,000 per year in 2026. Salaries range from $120,000 for new graduates to $200,000+ for experienced PMHNPs in high-demand areas. Remote and telehealth positions pay $130,000-$200,000, while private practice PMHNPs can earn $200,000-$300,000+. The highest paying states include California, New York, and New Jersey.",
                },
              },
              {
                "@type": "Question",
                name: "What is the PMHNP job outlook?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The PMHNP job outlook is exceptional, with the Bureau of Labor Statistics projecting 45% growth through 2032 — much faster than average. The mental health provider shortage (123 million Americans in designated shortage areas), expanded telehealth access, and growing awareness of mental health needs drive sustained demand nationwide.",
                },
              },
              {
                "@type": "Question",
                name: "How long does it take to become a PMHNP?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Becoming a PMHNP typically takes 6-8 years total: 4 years for a BSN, 1-2 years of RN experience (recommended), and 2-3 years for a MSN or DNP with PMHNP specialization. Accelerated BSN-to-DNP programs can shorten this timeline. After graduation, you must pass the ANCC PMHNP-BC certification exam.",
                },
              },
              {
                "@type": "Question",
                name: "Can PMHNPs prescribe medication?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, PMHNPs can prescribe medications including controlled substances in all 50 states. In states with full practice authority (34 states plus DC), PMHNPs prescribe independently. In reduced or restricted practice states, a collaborative agreement with a physician may be required. PMHNPs commonly prescribe antidepressants, anxiolytics, antipsychotics, mood stabilizers, and stimulants.",
                },
              },
              {
                "@type": "Question",
                name: "What is the difference between a PMHNP and a psychiatrist?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "PMHNPs hold a Master's or Doctoral degree in nursing with psychiatric specialization (2-4 years of graduate school), while psychiatrists complete medical school plus a 4-year residency. Both can diagnose mental health conditions and prescribe medications. In full practice authority states, PMHNPs practice independently. PMHNPs often earn $155,000-$200,000+ compared to psychiatrists' $250,000-$350,000+, but PMHNPs reach full practice much faster with less educational debt.",
                },
              },
              {
                "@type": "Question",
                name: "What does a psychiatric nurse practitioner do on a typical workday?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "A typical PMHNP workday includes conducting psychiatric evaluations, diagnosing mental health conditions (depression, anxiety, PTSD, bipolar disorder, schizophrenia), prescribing and managing psychotropic medications, providing psychotherapy (CBT, motivational interviewing), collaborating with interdisciplinary teams, and documenting in EHR systems. Outpatient PMHNPs typically see 8-16 patients per day, while inpatient roles involve rounding on hospitalized patients.",
                },
              },
              {
                "@type": "Question",
                name: "Are there remote psych NP jobs?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, remote PMHNP jobs are rapidly growing — approximately 62% of psychiatric NP positions now offer remote or telehealth options. Remote psych NP roles include telehealth patient care, medication management via video, utilization review, and clinical documentation. Salaries for remote PMHNPs range from $130,000 to $200,000+, with companies like Talkiatry, Cerebral, and Lyra Health actively hiring.",
                },
              },
              {
                "@type": "Question",
                name: "Can PMHNPs own a private practice?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, PMHNPs can own a private practice in all 50 states, though the level of independence varies. In the 34 states with Full Practice Authority, PMHNPs can practice and prescribe without physician oversight. In restricted states, a collaborative agreement with a physician may be required. Private practice PMHNPs can earn $180,000-$300,000+ annually, though they must manage business operations, insurance credentialing, and overhead costs.",
                },
              },
              {
                "@type": "Question",
                name: "Which states have the highest demand for psychiatric nurse practitioners?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The states with the highest demand for PMHNPs in 2026 are California (2,500+ openings), Texas (2,240+), Florida (2,190+), New York (1,640+), and Tennessee (1,570+). Other high-demand states include Ohio, North Carolina, Georgia, Arizona, and Illinois. Full Practice Authority states generally have more job openings due to fewer practice restrictions.",
                },
              },
              {
                "@type": "Question",
                name: "What are the most in-demand PMHNP specializations?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The most in-demand PMHNP specializations include addiction/substance abuse (MAT certification, +15-20% salary premium), child and adolescent psychiatry (+10-15% premium), forensic psychiatry in correctional settings (+15-25% premium), geriatric psychiatry, crisis/emergency psychiatry, and telehealth-focused medication management. Dual certification (PMHNP + FNP) is also increasingly valuable.",
                },
              },
              {
                "@type": "Question",
                name: "Are PMHNPs eligible for loan forgiveness or incentive programs?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, PMHNPs working in designated Health Professional Shortage Areas (HPSAs) may qualify for HRSA's National Health Service Corps (NHSC) loan repayment, which offers up to $50,000 for a 2-year commitment. VA psychiatric NPs may qualify for the Education Debt Reduction Program (EDRP). PMHNPs in community mental health centers and rural areas often have additional state-level loan forgiveness programs available.",
                },
              },
            ],
          }),
        }}
      />

      {/* Main content */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #F5D5C4 15%, #F0C4AF 50%, #FDFBF7 100%)' }}>
        {/* 1. Hero — above the fold */}
        <HomepageHero jobCountDisplay={jobCountDisplay} />

        {/* 2. Employer Clay Dough Strip */}
        <EmployerTrustSection />


        {/* ── Remaining sections (being redesigned) ── */}
        <FeaturedJobsSection />

        {/* 4. Top States */}
        <TopStatesSection />

        {/* 5. Employer How It Works */}
        <EmployerHowItWorks />

        <HomepageBlogSection />

        <ExitIntentPopup />
        <StickyEmailBar />
      </div>
    </>
  );
}
