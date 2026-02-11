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
  const jobCountDisplay = totalJobs > 1000
    ? `${Math.floor(totalJobs / 100) * 100}+`
    : totalJobs.toLocaleString();

  return {
    title: `${jobCountDisplay} PMHNP Jobs | Psychiatric Nurse Practitioner Job Board`,
    description: `Find ${jobCountDisplay} PMHNP jobs across the United States. The #1 job board for psychiatric mental health nurse practitioners. Remote and in-person positions updated daily.`,
    openGraph: {
      title: `${jobCountDisplay} PMHNP Jobs - Find Your Next Position`,
      description: `Browse ${jobCountDisplay} psychiatric nurse practitioner jobs. Remote, hybrid, and in-person positions with salary transparency.`,
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
