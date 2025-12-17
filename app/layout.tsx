import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import OrganizationStructuredData from '@/components/OrganizationStructuredData';
import GoogleAnalytics from '@/components/GoogleAnalytics';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnpjobs.com'),
  
  title: {
    default: 'PMHNP Jobs - Psychiatric Nurse Practitioner Job Board',
    template: '%s | PMHNP Jobs',
  },
  
  description: 'The #1 job board for Psychiatric Mental Health Nurse Practitioners. Find remote and in-person PMHNP jobs with salary transparency. 200+ jobs updated daily.',
  
  keywords: [
    'PMHNP jobs',
    'psychiatric nurse practitioner jobs',
    'mental health NP jobs',
    'telepsychiatry jobs',
    'remote PMHNP positions',
    'psychiatric nursing jobs',
    'PMHNP career',
    'nurse practitioner psychiatry',
  ],
  
  authors: [{ name: 'PMHNP Jobs' }],
  creator: 'PMHNP Jobs',
  publisher: 'PMHNP Jobs',
  
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'PMHNP Jobs',
    title: 'PMHNP Jobs - Find Psychiatric Nurse Practitioner Positions',
    description: 'The #1 job board for PMHNPs. Browse 200+ remote and in-person psychiatric NP jobs with salary transparency.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PMHNP Jobs - Psychiatric Nurse Practitioner Job Board',
      },
    ],
  },
  
  twitter: {
    card: 'summary_large_image',
    title: 'PMHNP Jobs - Psychiatric Nurse Practitioner Job Board',
    description: 'Find your next PMHNP position. 200+ remote and in-person jobs updated daily.',
    images: ['/og-image.png'],
  },
  
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleAnalytics />
        <OrganizationStructuredData baseUrl={process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnpjobs.com'} />
        <Header />
        <main className="min-h-screen pb-20 md:pb-0">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
