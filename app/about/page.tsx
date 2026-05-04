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
  const [totalJobs, totalEmployers] = await Promise.all([
    prisma.job.count({ where: { isPublished: true } }),
    prisma.job.findMany({ where: { isPublished: true }, select: { companyId: true }, distinct: ['companyId'] }).then(r => r.length),
  ]);

  return (
    <>
      <VideoJsonLd pathname="/about" />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'About', url: 'https://pmhnphiring.com/about' },
      ]} />
      <AboutClient totalJobs={totalJobs} totalEmployers={totalEmployers} />
    </>
  );
}
