import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | PMHNP Jobs',
  description: 'Get in touch with the PMHNP Hiring team. Contact us for job seeker support, employer inquiries, technical help, or general feedback. We respond within 24-48 hours.',
  alternates: {
    canonical: 'https://pmhnphiring.com/contact',
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

