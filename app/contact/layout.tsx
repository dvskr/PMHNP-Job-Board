import { brand } from '@/config/brand';
import { Metadata } from 'next';

// Title is bare ("Contact Us") because the root layout's title.template
// (`%s | ${brand.name}`) already appends the brand suffix. Including the
// suffix here would render "Contact Us | PMHNP Jobs | PMHNP Hiring" — a
// duplicated and inconsistent brand reference.
export const metadata: Metadata = {
  title: 'Contact Us',
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

