import type { Metadata } from "next";
import { headers, cookies } from 'next/headers';
import { CONSENT_COOKIE, parseConsentCookie } from '@/lib/consent';
import { brand } from '@/config/brand';
// Newsreader is loaded only in app/blog/layout.tsx (scoped to /blog/*) so
// non-blog pages don't pay the cost of a font that's only used by editorial
// body typography.
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import dynamic from 'next/dynamic';
// BottomNav was previously dynamic() with no SSR, which meant the 56px
// fixed bar was injected after hydration -- causing a CLS spike on every
// mobile route. Static-render it: the component only uses usePathname()
// which is SSR-safe.
import BottomNav from '@/components/BottomNav';

import { ThemeProvider } from '@/components/ThemeProvider';
import LayoutShell from '@/components/LayoutShell';
import MainContent from '@/components/MainContent';
import MobileHideOnAppRoutes from '@/components/MobileHideOnAppRoutes';

import GoogleAnalytics from '@/components/GoogleAnalytics';
import ConsentGatedTelemetry from '@/components/ConsentGatedTelemetry';
import ScrollIndicator from '@/components/ScrollIndicator';
import { ToastProvider } from '@/components/ui/ToastProvider';
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

// SEO Fix H3 / Mobile L2: JetBrains_Mono dropped from the web-font set, and
// Newsreader has been moved to app/blog/layout.tsx where it's actually used
// (editorial body typography). The audit flagged 4 Google Font families on
// every page; the rule is max 2. Inter + Lora cover sans + display globally;
// Newsreader loads only on /blog/* routes; JetBrains_Mono was only in use
// for incidental `font-mono` Tailwind classes on code blocks and debugging
// UIs -- those now fall back to system monospace, saving a network roundtrip
// + ~30 KB of font payload on every page load.

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl),

  title: {
    default: `${brand.name} - ${brand.niche.long} Job Board`,
    template: `%s | ${brand.name}`,
  },

  description: 'Browse thousands of PMHNP jobs updated daily. Remote, telehealth & in-person psychiatric NP positions with salary transparency. Free for job seekers.',

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
    // Bing Webmaster verification — env-driven so the token can rotate
    // without a code change. Set BING_WEBMASTER_VERIFICATION in Vercel
    // (Bing Webmaster Tools → Settings → Site verification → HTML meta tag).
    // Without this, the IndexNow + BING_WEBMASTER_API_KEY pipeline runs blind
    // (no dashboard visibility into submission success / coverage / errors).
    ...(process.env.BING_WEBMASTER_VERIFICATION
      ? { other: { 'msvalidate.01': process.env.BING_WEBMASTER_VERIFICATION } }
      : {}),
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
        {/* Preconnect to Supabase CDN for hero/LCP image */}
        <link rel="preconnect" href="https://sggccmqjzuimwlahocmy.supabase.co" crossOrigin="" />
        <link rel="dns-prefetch" href="https://sggccmqjzuimwlahocmy.supabase.co" />
        {/* AI & GEO Discovery Links */}
        <link rel="author" href="/humans.txt" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM Site Information" />
        <link rel="alternate" type="text/plain" href="/ai.txt" title="AI Permissions" />
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title={`${brand.name} — Latest Jobs`} />
        {/* Organization and WebSite Schema Markup */}
        {/* fb:app_id removed (audit 27 M-1): no Meta Pixel, CAPI, or Facebook
            Login integration exists in the codebase, so the tag was inert
            HTML weight on every page response. Restore only when an active
            Meta integration is shipped alongside it. */}
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
                  "alternateName": [`${brand.niche.short} Jobs`, brand.legal.entityName],
                  "legalName": brand.legal.entityName,
                  "url": brand.baseUrl,
                  "logo": `${brand.baseUrl}/logo.png`,
                  "image": `${brand.baseUrl}/pmhnp_logo.png`,
                  "description": `The #1 job board for ${brand.niche.long}s`,
                  "foundingDate": brand.legal.foundingYear,
                  // Per attribution rules: do NOT emit a `founder` Person on
                  // the public Organization schema. The legal LLC member is
                  // tracked in brand.legal.founderName for legal contexts only.
                  "address": {
                    "@type": "PostalAddress",
                    "streetAddress": brand.legal.addressLine,
                    "addressLocality": brand.legal.addressCity,
                    "addressRegion": brand.legal.addressRegion,
                    "postalCode": brand.legal.addressPostalCode,
                    "addressCountry": brand.legal.addressCountry,
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
        className={`${inter.variable} ${lora.variable} font-sans antialiased`}
        suppressHydrationWarning
        style={{
          backgroundColor: '#F5F0EB',
          color: '#2D3748',
        }}
      >
        {/* SEO Fix H6: skip-to-content link (WCAG 2.4.1 Bypass Blocks).
            Visually hidden until focused; jumps keyboard users straight past
            the header nav to <main id="main-content"> in MainContent.tsx. */}
        <a
          href="#main-content"
          className="skip-to-content"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '0',
            zIndex: 100000,
            padding: '12px 18px',
            background: '#0D9488',
            color: '#FFFFFF',
            fontWeight: 600,
            textDecoration: 'none',
            borderRadius: '0 0 8px 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <ToastProvider>
            <div style={{ width: '100%', maxWidth: '100vw', position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              <GoogleAnalytics nonce={nonce} initialConsent={initialConsent} />
              <ConsentGatedTelemetry initialConsent={initialConsent} />
              <LayoutShell>
                <Header />
              </LayoutShell>
              <MainContent>{children}</MainContent>
              <LayoutShell>
                <MobileHideOnAppRoutes>
                  <Footer />
                </MobileHideOnAppRoutes>
                <BottomNav />
                <ScrollIndicator />
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

