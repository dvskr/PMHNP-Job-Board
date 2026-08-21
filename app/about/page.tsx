import { brand } from '@/config/brand';
import { Metadata } from 'next';
import { Prisma } from '@prisma/client';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import VideoJsonLd from '@/components/VideoJsonLd';
import { prisma } from '@/lib/prisma';
import { getSiteStats } from '@/lib/site-stats';
import { newGradWhereClause, publicJobsWhere } from '@/lib/filters';
import AboutClient from './AboutClient';

export const revalidate = 3600;

const ABOUT_OG_IMAGE = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/about-pmhnp-hiring-platform.webp';

export const metadata: Metadata = {
  title: 'About Us - The Dedicated Job Board for Psychiatric NPs',
  description: 'Learn about PMHNP Hiring - the dedicated job board for Psychiatric Mental Health Nurse Practitioners. Thousands of jobs from thousands of companies across all 50 states.',
  openGraph: {
    // OG block was previously images-only — when a non-overriding child page
    // inherits this layout's defaults the social card pulled the wrong title
    // and description (audit 09 M-22). Spelled-out fields ensure the share
    // card matches the page identity.
    title: 'About PMHNP Hiring: The PMHNP-Only Job Board',
    description: 'Built for the PMHNP community — thousands of psychiatric nurse practitioner jobs across all 50 states, free for job seekers, transparent for employers.',
    type: 'website',
    url: `${brand.baseUrl}/about`,
    siteName: 'PMHNP Hiring',
    images: [{ url: ABOUT_OG_IMAGE, width: 1280, height: 900, alt: 'About PMHNP Hiring' }],
  },
  twitter: { card: 'summary_large_image', title: 'About PMHNP Hiring', images: [ABOUT_OG_IMAGE] },
  alternates: { canonical: `${brand.baseUrl}/about` },
};

export default async function AboutPage() {
  // Headline totals come from the SAME getSiteStats() snapshot the homepage
  // renders, so About can never disagree with the hero (it previously ran
  // its own bare-isPublished count and a distinct-companyId employer count,
  // both diverging from the homepage's numbers). Diorama buckets stay
  // approximate text-search heuristics, but each is AND-combined with the
  // canonical publicJobsWhere() base — the old spread put the bucket OR on
  // the same level as the base's own OR, silently overwriting the expiry
  // clause — and the new-grad bucket now reuses newGradWhereClause(), the
  // predicate the /jobs/new-grad page counts with.
  const bucketWhere = (bucket: Prisma.JobWhereInput): Prisma.JobWhereInput => ({
    AND: [
      publicJobsWhere(),
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      bucket,
    ],
  });

  const [
    stats,
    newGradCount,
    inpatientCount,
    remoteOrTelehealthCount,
    outpatientCount,
  ] = await Promise.all([
    getSiteStats(),
    prisma.job.count({ where: bucketWhere(newGradWhereClause()) }),
    prisma.job.count({ where: bucketWhere({ OR: [{ title: { contains: 'inpatient', mode: 'insensitive' } }, { setting: { contains: 'inpatient', mode: 'insensitive' } }] }) }),
    prisma.job.count({ where: bucketWhere({ OR: [{ isRemote: true }, { title: { contains: 'telehealth', mode: 'insensitive' } }, { setting: { contains: 'telehealth', mode: 'insensitive' } }] }) }),
    prisma.job.count({ where: bucketWhere({ OR: [{ title: { contains: 'outpatient', mode: 'insensitive' } }, { setting: { contains: 'outpatient', mode: 'insensitive' } }] }) }),
  ]);

  return (
    <>
      <VideoJsonLd pathname="/about" />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'About', url: 'https://pmhnphiring.com/about' },
      ]} />
      <AboutClient
        totalJobs={stats.totalJobs}
        totalEmployers={stats.totalCompanies}
        dioramaCounts={{
          newGrad: newGradCount,
          inpatient: inpatientCount,
          telehealth: remoteOrTelehealthCount,
          outpatient: outpatientCount,
        }}
      />
    </>
  );
}
