import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | PMHNP Jobs',
  description: 'Contact PMHNP Jobs for support, feedback, or questions about our job board.',
  alternates: {
    canonical: '/contact',
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

