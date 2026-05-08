import { brand } from '@/config/brand';
import { Metadata } from 'next';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import VideoJsonLd from '@/components/VideoJsonLd';
import { prisma } from '@/lib/prisma';
import AboutClient from './AboutClient';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'About Us - The #1 Job Board for Psychiatric NPs',
  description: 'Learn about PMHNP Hiring - the #1 dedicated job board for Psychiatric Mental Health Nurse Practitioners. Thousands of jobs from thousands of companies across all 50 states.',
  openGraph: {
    images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/about-pmhnp-hiring-platform.webp', width: 1280, height: 900, alt: 'About PMHNP Hiring' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/about-pmhnp-hiring-platform.webp'] },
  alternates: { canonical: `${brand.baseUrl}/about` },
};

export default async function AboutPage() {
  // SEO Fix M16: stop hardcoding About-page diorama numbers ("320 cohorts /
  // 1,240 roles / 2,105 listings / 885 openings"). Pull live counts from
  // Prisma so the page never lies when the catalog shifts. Buckets are
  // approximate text-search heuristics, sufficient for editorial labeling
  // and consistent with how other pSEO surfaces classify roles.
  const baseWhere = {
    isPublished: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  } as const;

  const [
    totalJobs,
    totalEmployers,
    newGradCount,
    inpatientCount,
    remoteOrTelehealthCount,
    outpatientCount,
  ] = await Promise.all([
    prisma.job.count({ where: { isPublished: true } }),
    prisma.job.findMany({ where: { isPublished: true }, select: { companyId: true }, distinct: ['companyId'] }).then(r => r.length),
    prisma.job.count({ where: { ...baseWhere, OR: [{ title: { contains: 'new grad', mode: 'insensitive' } }, { description: { contains: 'new graduate', mode: 'insensitive' } }, { experienceLevel: 'Entry-Level' }] } }),
    prisma.job.count({ where: { ...baseWhere, OR: [{ title: { contains: 'inpatient', mode: 'insensitive' } }, { setting: { contains: 'inpatient', mode: 'insensitive' } }] } }),
    prisma.job.count({ where: { ...baseWhere, OR: [{ isRemote: true }, { title: { contains: 'telehealth', mode: 'insensitive' } }, { setting: { contains: 'telehealth', mode: 'insensitive' } }] } }),
    prisma.job.count({ where: { ...baseWhere, OR: [{ title: { contains: 'outpatient', mode: 'insensitive' } }, { setting: { contains: 'outpatient', mode: 'insensitive' } }] } }),
  ]);

  return (
    <>
      <VideoJsonLd pathname="/about" />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'About', url: 'https://pmhnphiring.com/about' },
      ]} />
      <AboutClient
        totalJobs={totalJobs}
        totalEmployers={totalEmployers}
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
