import { Metadata } from 'next';
import JobsPageClient from './JobsPageClient';

export const metadata: Metadata = {
  title: 'Browse PMHNP Jobs - Psychiatric Nurse Practitioner Positions',
  description: 'Search and filter hundreds of PMHNP jobs. Find remote, full-time, part-time, and contract psychiatric nurse practitioner positions updated daily.',
  openGraph: {
    title: 'Browse PMHNP Jobs - Find Your Next Position',
    description: 'Search and filter hundreds of psychiatric nurse practitioner jobs. Remote, full-time, part-time, and contract positions updated daily.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse PMHNP Jobs',
    description: 'Search and filter hundreds of psychiatric nurse practitioner jobs. Updated daily.',
  },
};

export default function JobsPage() {
  return <JobsPageClient />;
}

