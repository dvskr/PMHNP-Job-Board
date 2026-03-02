import { Metadata } from 'next';
import Link from 'next/link';

import { prisma } from '@/lib/prisma';
import StatsSection from '@/components/StatsSection';
import EmployerMarqueeSection from '@/components/EmployerMarqueeSection';
import FeaturedJobsSection from '@/components/FeaturedJobsSection';
import WhyUs from '@/components/WhyUs';
import Testimonial from '@/components/Testimonial';
import StayConnected from '@/components/StayConnected';
import EmployerCTA from '@/components/EmployerCTA';
import BrowseByStateSection from '@/components/BrowseByStateSection';
import Comparison from '@/components/Comparison';
import ScrollReveal from '@/components/ScrollReveal';
import HomepageHero from '@/components/HomepageHero';
import VideoJsonLd from '@/components/VideoJsonLd';






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
 * Generate dynamic metadata with job count
 */
export async function generateMetadata(): Promise<Metadata> {
  const totalJobs = await getTotalJobCount();
  const jobCountDisplay = totalJobs > 10000
    ? `${Math.floor(totalJobs / 1000).toLocaleString()},000+`
    : '10,000+';

  return {
    title: `${jobCountDisplay} PMHNP Jobs Near Me | Psych NP & Psychiatric Nurse Practitioner Job Board`,
    description: `Browse ${jobCountDisplay} PMHNP & Psych NP jobs near me, updated daily. Find remote, telehealth, and in-person psychiatric nurse practitioner positions with salary transparency across all 50 states. Free for job seekers.`,
    openGraph: {
      title: `${jobCountDisplay} PMHNP Jobs - Find Your Next Position`,
      description: `Browse ${jobCountDisplay} psychiatric nurse practitioner jobs. Remote, hybrid, and in-person positions with salary transparency.`,
      images: [
        {
          url: '/images/pages/pmhnp-job-board-homepage.webp',
          width: 1280,
          height: 900,
          alt: 'PMHNP Hiring job board homepage showing 10,000 plus psychiatric nurse practitioner jobs from 3,000 plus companies across 50 states',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/images/pages/pmhnp-job-board-homepage.webp'],
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
    <div>
      <VideoJsonLd pathname="/" />
      {/* Homepage FAQ Schema for featured snippets */}
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
                  text: "A PMHNP (Psychiatric Mental Health Nurse Practitioner) is an advanced practice registered nurse (APRN) who specializes in mental health care. PMHNPs can diagnose and treat mental health conditions, prescribe medications, and provide psychotherapy. They hold a Master's or Doctoral degree in psychiatric nursing and are certified by the ANCC.",
                },
              },
              {
                "@type": "Question",
                name: "How much do PMHNPs make?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "PMHNPs earn an average salary of $155,000-$165,000 per year in 2026. Salaries range from $120,000 for new graduates to $200,000+ for experienced PMHNPs in high-demand areas. Remote and telehealth positions pay $130,000-$200,000, while private practice PMHNPs can earn $200,000-$300,000+.",
                },
              },
              {
                "@type": "Question",
                name: "What is the PMHNP job outlook?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The PMHNP job outlook is exceptional, with the Bureau of Labor Statistics projecting 40%+ growth through 2031 — much faster than average. The mental health provider shortage, expanded telehealth access, and growing awareness of mental health needs drive sustained demand nationwide.",
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
                  text: "Yes, PMHNPs can prescribe medications including controlled substances in all 50 states. In states with full practice authority (28 states plus DC), PMHNPs prescribe independently. In reduced or restricted practice states, a collaborative agreement with a physician may be required. PMHNPs commonly prescribe antidepressants, anxiolytics, antipsychotics, mood stabilizers, and stimulants.",
                },
              },
            ],
          }),
        }}
      />
      {/* 1. Hero Section — no scroll reveal (above the fold) */}
      <HomepageHero jobCountDisplay={jobCountDisplay} />

      {/* 2. Stats Counter (animated numbers) */}
      <ScrollReveal>
        <StatsSection />
      </ScrollReveal>

      {/* 3. Employer Marquee (scrolling company names) */}
      <ScrollReveal>
        <EmployerMarqueeSection />
      </ScrollReveal>



      {/* 5. Featured Jobs (6 latest job cards) */}
      <ScrollReveal>
        <FeaturedJobsSection />
      </ScrollReveal>

      {/* 6. Why PMHNPs Choose Us (3 cards: Shield, Zap, DollarSign) */}
      <ScrollReveal>
        <WhyUs />
      </ScrollReveal>

      {/* 7. Testimonial (Sarah M. quote) */}
      <ScrollReveal>
        <Testimonial />
      </ScrollReveal>

      {/* 8. Browse by Location (state cards with job counts) */}
      <ScrollReveal>
        <BrowseByStateSection />
      </ScrollReveal>

      {/* 9. Comparison Cards (Us vs Indeed vs LinkedIn vs ZipRecruiter) */}
      <ScrollReveal>
        <Comparison />
      </ScrollReveal>

      {/* 10. Salary Guide + Job Alerts (side-by-side) */}
      <ScrollReveal>
        <StayConnected />
      </ScrollReveal>

      {/* 12. Employer CTA (new design) */}
      <ScrollReveal>
        <EmployerCTA />
      </ScrollReveal>
    </div>
  );
}
