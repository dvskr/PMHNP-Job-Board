import type { Metadata } from "next";
import { headers, cookies } from 'next/headers';
import { CONSENT_COOKIE, parseConsentCookie } from '@/lib/consent';
import { brand } from '@/config/brand';
import { Inter, Lora, Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import dynamic from 'next/dynamic';
import ProfileNudgeBanner from '@/components/profile/ProfileNudgeWrapper';
const BottomNav = dynamic(() => import('@/components/BottomNav'));

import { ThemeProvider } from '@/components/ThemeProvider';
import LayoutShell from '@/components/LayoutShell';
import MainContent from '@/components/MainContent';
import MobileHideOnAppRoutes from '@/components/MobileHideOnAppRoutes';

import GoogleAnalytics from '@/components/GoogleAnalytics';
import ConsentGatedTelemetry from '@/components/ConsentGatedTelemetry';
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

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl),

  title: {
    default: `${brand.name} - ${brand.niche.long} Job Board`,
    template: `%s | ${brand.name}`,
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

  authors: [{ name: brand.name }],
  creator: brand.name,
  publisher: brand.name,

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: brand.name,
    title: `${brand.name} - Find ${brand.niche.long} Positions`,
    description: `The #1 job board for ${brand.niche.short}s. Browse remote and in-person ${brand.niche.descriptor} jobs across all 50 states.`,
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: `${brand.name} - ${brand.niche.long} Job Board`,
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${brand.name} - ${brand.niche.long} Job Board`,
    description: `Find your next ${brand.niche.short} position. Remote and in-person jobs across 50 states, updated daily.`,
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
  // Read the HttpOnly consent cookie at SSR time so we can initialize
  // GA, Speed Insights, and the banner with the right state without
  // exposing the value to client JavaScript (closes audit gap #19).
  const initialConsent = parseConsentCookie((await cookies()).get(CONSENT_COOKIE)?.value);

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
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title={`${brand.name} — Latest Jobs`} />
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
                  "@id": `${brand.baseUrl}/#organization`,
                  "name": brand.name,
                  "alternateName": `${brand.niche.short} Jobs`,
                  "url": brand.baseUrl,
                  "logo": `${brand.baseUrl}/logo.png`,
                  "image": `${brand.baseUrl}/pmhnp_logo.png`,
                  "description": `The #1 job board for ${brand.niche.long}s`,
                  "foundingDate": brand.legal.foundingYear,
                  "founder": {
                    "@type": "Person",
                    "name": brand.legal.founderName
                  },
                  "sameAs": [
                    brand.social.linkedin,
                    brand.social.facebook,
                    brand.social.x,
                    brand.social.instagram,
                    brand.social.youtube,
                  ],
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "email": brand.email.contact,
                    "contactType": "customer service"
                  }
                },
                {
                  "@type": "WebSite",
                  "@id": `${brand.baseUrl}/#website`,
                  "url": brand.baseUrl,
                  "name": brand.name,
                  "description": `Find ${brand.niche.descriptor} jobs`,
                  "publisher": {
                    "@id": `${brand.baseUrl}/#organization`
                  },
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": `${brand.baseUrl}/jobs?q={search_term_string}`
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
        className={`${inter.variable} ${lora.variable} ${newsreader.variable} ${jetbrainsMono.variable} font-sans antialiased`}
        suppressHydrationWarning
        style={{
          backgroundColor: '#F5F0EB',
          color: '#2D3748',
        }}
      >
        <ThemeProvider>
          <ToastProvider>
            <div style={{ width: '100%', maxWidth: '100vw', position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              <GoogleAnalytics nonce={nonce} initialConsent={initialConsent} />
              <ConsentGatedTelemetry initialConsent={initialConsent} />
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
                <CookieConsent initialConsent={initialConsent} />
                <PWAInstallBanner />
              </LayoutShell>
            </div>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

