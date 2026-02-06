import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';

import GoogleAnalytics from '@/components/GoogleAnalytics';
import ExitIntentPopup from '@/components/ExitIntentPopup';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'),

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
    siteName: 'PMHNP Hiring',
    title: 'PMHNP Hiring - Find Psychiatric Nurse Practitioner Positions',
    description: 'The #1 job board for PMHNPs. Browse 1000+ remote and in-person psychiatric NP jobs with salary transparency.',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'PMHNP Hiring - Psychiatric Nurse Practitioner Job Board',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'PMHNP Hiring - Psychiatric Nurse Practitioner Job Board',
    description: 'Find your next PMHNP position. 1000+ remote and in-person jobs updated daily.',
    images: ['/api/og'],
  },

  icons: {
    icon: [
      { url: '/favicon.ico?v=4', sizes: '32x32' },
      { url: '/favicon-16x16.png?v=4', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=4', sizes: '32x32', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png?v=4', sizes: '180x180', type: 'image/png' }
    ],
    other: [
      {
        rel: 'manifest',
        url: '/site.webmanifest?v=4',
      },
      {
        rel: 'android-chrome-192x192',
        url: '/android-chrome-192x192.png?v=4', // Explicitly managed in manifest but good to have link consistency if used
      },
      {
        rel: 'android-chrome-512x512',
        url: '/android-chrome-512x512.png?v=4',
      }
    ],
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

  verification: {
    google: 'google4912b114c3b602cd',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Performance: Preconnect to external domains */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        {/* Organization and WebSite Schema Markup */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://pmhnphiring.com/#organization",
                  "name": "PMHNP Hiring",
                  "alternateName": "PMHNP Jobs",
                  "url": "https://pmhnphiring.com",
                  "logo": {
                    "@type": "ImageObject",
                    "url": "https://pmhnphiring.com/pmhnp_logo.png"
                  },
                  "image": "https://pmhnphiring.com/pmhnp_logo.png",
                  "description": "The #1 job board for psychiatric mental health nurse practitioners. Browse 8,500+ PMHNP jobs with salary data.",
                  "foundingDate": "2024",
                  "sameAs": [
                    "https://x.com/pmhnphiring",
                    "https://www.facebook.com/profile.php?id=61585484949012",
                    "https://www.instagram.com/pmhnphiring",
                    "https://www.linkedin.com/company/pmhnp-hiring",
                    "https://www.threads.net/@pmhnphiring"
                  ]
                },
                {
                  "@type": "WebSite",
                  "@id": "https://pmhnphiring.com/#website",
                  "url": "https://pmhnphiring.com",
                  "name": "PMHNP Hiring",
                  "description": "Find psychiatric mental health nurse practitioner jobs",
                  "publisher": {
                    "@id": "https://pmhnphiring.com/#organization"
                  },
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": "https://pmhnphiring.com/jobs?q={search_term_string}"
                    },
                    "query-input": "required name=search_term_string"
                  }
                }
              ]
            })
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleAnalytics />
        <Header />
        <main className="min-h-screen pb-20 md:pb-0">{children}</main>
        <Footer />
        <ExitIntentPopup />
        <BottomNav />
        <ExitIntentPopup />
      </body>
    </html>
  );
}
