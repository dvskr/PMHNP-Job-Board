import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import ProfileNudgeBanner from '@/components/profile/ProfileNudgeWrapper';
import FloatingSocial from '@/components/FloatingSocial';
import { ThemeProvider } from '@/components/ThemeProvider';
import LayoutShell from '@/components/LayoutShell';
import MainContent from '@/components/MainContent';

import GoogleAnalytics from '@/components/GoogleAnalytics';
import StickyEmailBar from '@/components/StickyEmailBar';

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
    default: 'PMHNP Hiring - Psychiatric Nurse Practitioner Job Board',
    template: '%s | PMHNP Hiring',
  },

  description: 'The #1 job board for Psychiatric Mental Health Nurse Practitioners. 10,000+ PMHNP jobs from 3,000+ companies across 50 states. Remote and in-person positions with salary transparency, updated daily.',

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
      { url: '/favicon.ico?v=4', sizes: '32x32' },
      { url: '/favicon-16x16.png?v=4', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=4', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png?v=4', sizes: '192x192', type: 'image/png' }
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
    <html lang="en" className="dark" suppressHydrationWarning style={{ backgroundColor: '#060E18', color: '#F1F5F9' } as React.CSSProperties}>
      <head>
        {/* Critical: Dark mode defaults for initial render — scoped to html.dark so theme switching works */}
        <style dangerouslySetInnerHTML={{ __html: `html.dark{color-scheme:dark}html.dark,html.dark body{background-color:#060E18!important;color:#F1F5F9!important}html.dark input,html.dark textarea,html.dark select{background-color:#162231!important;color:#F1F5F9!important;-webkit-text-fill-color:#F1F5F9!important}html.dark input:-webkit-autofill,html.dark input:-webkit-autofill:hover,html.dark input:-webkit-autofill:focus,html.dark input:-webkit-autofill:active{-webkit-box-shadow:0 0 0 1000px #162231 inset!important;box-shadow:0 0 0 1000px #162231 inset!important;-webkit-text-fill-color:#F1F5F9!important}html.dark .bg-white{background-color:#0F172A!important}html.dark .bg-gray-50{background-color:#060E18!important}html.dark .bg-gray-100,html.dark .bg-slate-100{background-color:#111827!important}html.dark .text-gray-900{color:#F1F5F9!important}html.dark .text-gray-800{color:#E2E8F0!important}html.dark .text-gray-700{color:#CBD5E1!important}html.dark .text-gray-600{color:#94A3B8!important}html.dark .text-gray-500{color:#64748B!important}html.dark .border-gray-200,html.dark .border-gray-100{border-color:#1E293B!important}html.dark .border-gray-300{border-color:#334155!important}html.dark .shadow-sm,html.dark .shadow-md,html.dark .shadow-lg{box-shadow:0 1px 3px rgba(0,0,0,0.4)!important}html.dark .divide-gray-200>:not(:first-child){border-color:#1E293B!important}` }} />
        {/* Theme init script — runs before React hydrates to prevent FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)||(!t&&!window.matchMedia);var h=document.documentElement;var s=h.style;if(d){h.classList.add('dark');h.classList.remove('light');s.backgroundColor='#060E18';s.color='#F1F5F9';s.colorScheme='dark';s.setProperty('--bg-primary','#060E18');s.setProperty('--bg-secondary','#0F1923');s.setProperty('--bg-secondary-rgb','15,25,35');s.setProperty('--bg-tertiary','#162231');s.setProperty('--text-primary','#F1F5F9');s.setProperty('--text-primary-rgb','241,245,249');s.setProperty('--text-secondary','#E2E8F0');s.setProperty('--text-tertiary','#CBD5E1');s.setProperty('--text-muted','#94A3B8');s.setProperty('--border-color','#334155');s.setProperty('--border-color-dark','#475569');s.setProperty('--shadow-color','rgba(0,0,0,0.3)');s.setProperty('--header-bg','#0F1923');s.setProperty('--mobile-menu-bg','#0F1923');s.setProperty('--nav-btn-bg','#1E293B');s.setProperty('--nav-btn-text','#F1F5F9');s.setProperty('--nav-btn-hover-bg','#334155');s.setProperty('--input-text','#F1F5F9');s.setProperty('--input-placeholder','#64748B');s.setProperty('--color-primary','#2DD4BF');s.setProperty('--color-primary-dark','#14B8A6');s.setProperty('--color-primary-light','#5EEAD4');s.setProperty('--salary-color','#2DD4BF');s.setProperty('--shimmer-from','#162231');s.setProperty('--shimmer-via','#1E293B')}else{h.classList.add('light');h.classList.remove('dark');s.backgroundColor='#FFFFFF';s.color='#111827';var st=document.createElement('style');st.textContent='html,body{background-color:#FFFFFF!important;color:#111827!important}body{opacity:1!important}';document.head.appendChild(st);s.setProperty('--bg-primary','#FFFFFF');s.setProperty('--bg-secondary','#F9FAFB');s.setProperty('--bg-secondary-rgb','249,250,251');s.setProperty('--bg-tertiary','#F3F4F6');s.setProperty('--text-primary','#111827');s.setProperty('--text-primary-rgb','17,24,39');s.setProperty('--text-secondary','#374151');s.setProperty('--text-tertiary','#6B7280');s.setProperty('--border-color','#E5E7EB');s.setProperty('--border-color-dark','#D1D5DB');s.setProperty('--shadow-color','rgba(0,0,0,0.1)');s.setProperty('--header-bg','#FFFFFF');s.setProperty('--mobile-menu-bg','#FFFFFF');s.setProperty('--nav-btn-bg','#F3F4F6');s.setProperty('--nav-btn-text','#111827');s.setProperty('--nav-btn-hover-bg','#E5E7EB');s.setProperty('--input-text','#111827');s.setProperty('--input-placeholder','#6B7280');s.setProperty('--selection-bg','#CCFBF1');s.setProperty('--selection-text','#134E4A');s.setProperty('--shimmer-from','#f0f0f0');s.setProperty('--shimmer-via','#e0e0e0');s.setProperty('--color-primary','#0D9488');s.setProperty('--color-primary-dark','#0F766E');s.setProperty('--color-primary-light','#14B8A6');s.setProperty('--salary-color','#1d4ed8')}}catch(e){document.documentElement.classList.add('dark');document.documentElement.style.backgroundColor='#060E18';document.documentElement.style.color='#F1F5F9'}})();`,
          }}
        />
        {/* Performance: Preconnect to external domains */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
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
                  "logo": {
                    "@type": "ImageObject",
                    "url": "https://pmhnphiring.com/pmhnp_logo.png"
                  },
                  "image": "https://pmhnphiring.com/pmhnp_logo.png",
                  "description": "The #1 job board for psychiatric mental health nurse practitioners. Browse 10,000+ PMHNP jobs with salary data.",
                  "foundingDate": "2024",
                  "sameAs": [
                    "https://x.com/pmhnphiring",
                    "https://www.facebook.com/profile.php?id=61585484949012",
                    "https://www.instagram.com/pmhnphiring",
                    "https://www.linkedin.com/company/pmhnp-hiring",
                    "https://www.youtube.com/@pmhnphiring"
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
        suppressHydrationWarning
        style={{
          backgroundColor: '#060E18',
          color: '#F1F5F9',
        }}
      >
        <ThemeProvider>
          <div className="site-wrapper" style={{ width: '100%', minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
            <LayoutShell>
              <div>
                <GoogleAnalytics />
                <Header />
                <ProfileNudgeBanner />
              </div>
            </LayoutShell>
            <MainContent>{children}</MainContent>
            <LayoutShell>
              <div>
                <Footer />
                <FloatingSocial />
                <BottomNav />
                <StickyEmailBar />
              </div>
            </LayoutShell>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
