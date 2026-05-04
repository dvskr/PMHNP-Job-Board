import { brand } from '@/config/brand';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | PMHNP Jobs',
  description: 'Get in touch with the PMHNP Hiring team. Contact us for job seeker support, employer inquiries, technical help, or general feedback. We respond within 24-48 hours.',
  alternates: {
    canonical: `${brand.baseUrl}/contact`,
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

