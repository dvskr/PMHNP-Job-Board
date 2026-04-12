import type { Metadata } from "next";
import { headers } from 'next/headers';
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import dynamic from 'next/dynamic';
import ProfileNudgeBanner from '@/components/profile/ProfileNudgeWrapper';
const BottomNav = dynamic(() => import('@/components/BottomNav'));
const FloatingSocial = dynamic(() => import('@/components/FloatingSocial'));
import { ThemeProvider } from '@/components/ThemeProvider';
import LayoutShell from '@/components/LayoutShell';
import MainContent from '@/components/MainContent';
import MobileHideOnAppRoutes from '@/components/MobileHideOnAppRoutes';

import GoogleAnalytics from '@/components/GoogleAnalytics';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ToastProvider } from '@/components/ui/ToastProvider';
const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'));
const ExitIntentPopup = dynamic(() => import('@/components/ExitIntentPopup'));
const PushNotificationPrompt = dynamic(() => import('@/components/PushNotificationPrompt'));
const CookieConsent = dynamic(() => import('@/components/CookieConsent'));
const PWAInstallBanner = dynamic(() => import('@/components/PWAInstallBanner'));

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: 'swap',
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'),

  title: {
    default: 'PMHNP Hiring - Psychiatric Nurse Practitioner Job Board',
    template: '%s | PMHNP Hiring',
  },

  description: 'Browse thousands of PMHNP jobs updated daily. Find remote, telehealth, and in-person psychiatric NP positions with salary transparency across all 50 states. Free for job seekers.',

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

  authors: [{ name: 'PMHNP Hiring' }],
  creator: 'PMHNP Hiring',
  publisher: 'PMHNP Hiring',

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'PMHNP Hiring',
    title: 'PMHNP Hiring - Find Psychiatric Nurse Practitioner Positions',
    description: 'The #1 job board for PMHNPs. Browse 10,000+ remote and in-person psychiatric NP jobs from 3,000+ companies across 50 states.',
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
    description: 'Find your next PMHNP position. 10,000+ remote and in-person jobs from 3,000+ companies across 50 states, updated daily.',
    images: ['/api/og'],
  },

  icons: {
    icon: [
      { url: '/favicon.ico?v=5', sizes: '32x32' },
      { url: '/favicon-16x16.png?v=5', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=5', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png?v=5', sizes: '48x48', type: 'image/png' },
      { url: '/icon-192x192.png?v=5', sizes: '192x192', type: 'image/png' }
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') || '';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Performance: Preconnect to external domains */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* AI & GEO Discovery Links */}
        <link rel="author" href="/humans.txt" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM Site Information" />
        <link rel="alternate" type="text/plain" href="/ai.txt" title="AI Permissions" />
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="PMHNP Hiring — Latest Jobs" />
        {/* Organization and WebSite Schema Markup */}
        <meta property="fb:app_id" content="940556045303701" />
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
                  "logo": "https://pmhnphiring.com/logo.png",
                  "image": "https://pmhnphiring.com/pmhnp_logo.png",
                  "description": "The #1 job board for Psychiatric Mental Health Nurse Practitioners",
                  "foundingDate": "2026",
                  "founder": {
                    "@type": "Person",
                    "name": "Pavan Kumar Reddy Daggula"
                  },
                  "sameAs": [
                    "https://www.linkedin.com/company/pmhnpjobs",
                    "https://www.facebook.com/pmhnphiring",
                    "https://www.crunchbase.com/organization/pmhnp-hiring",
                    "https://wellfound.com/company/pmhnp-hiring",
                    "https://www.producthunt.com/products/pmhnp-jobs",
                    "https://www.saashub.com/10000-pmhnp-jobs"
                  ],
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "email": "contact@pmhnphiring.com",
                    "contactType": "customer service"
                  }
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
        className={`${inter.variable} ${lora.variable} font-sans antialiased`}
        suppressHydrationWarning
        style={{
          backgroundColor: '#FAFBF8',
          color: '#2D3748',
        }}
      >
        <ThemeProvider>
          <ToastProvider>
            <div style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden' as const, position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              <GoogleAnalytics nonce={nonce} />
              <SpeedInsights />
              <LayoutShell>
                <Header />
                <ProfileNudgeBanner />
              </LayoutShell>
              <MainContent>{children}</MainContent>
              <LayoutShell>
                <MobileHideOnAppRoutes>
                  <Footer />
                  <FeedbackWidget />
                </MobileHideOnAppRoutes>
                <BottomNav />
                <ExitIntentPopup />
                <PushNotificationPrompt />
                <CookieConsent />
                <PWAInstallBanner />
              </LayoutShell>
            </div>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

