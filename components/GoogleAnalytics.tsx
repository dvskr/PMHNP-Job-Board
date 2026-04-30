'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useCallback } from 'react';
import {
  trackPageView,
  setUserId,
  setUserProperties,
  type UserProperties,
} from '@/lib/analytics';
import type { ConsentCategories } from '@/lib/consent';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// ── Route Change Tracker ────────────────────────────────────────
// Next.js SPA — client-side nav doesn't reload the page.
// We fire page_view on every pathname/searchParams change.
function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    // Small delay so document.title has updated
    const t = setTimeout(() => trackPageView(url), 100);
    return () => clearTimeout(t);
  }, [pathname, searchParams]);

  return null;
}

// ── User Identity Sync ──────────────────────────────────────────
// Reads the Supabase session and sets user_id + user_properties
function UserIdentitySync() {
  const syncUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) { setUserId(null); return; }
      const data = await res.json();
      if (data?.id) {
        setUserId(data.id);
        const props: UserProperties = {};
        if (data.role) props.user_role = data.role;
        if (data.profileVisible !== undefined) props.has_resume = !!data.resumeUrl;
        setUserProperties(props);
      }
    } catch {
      // Silently fail — analytics should never break the app
    }
  }, []);

  useEffect(() => { syncUser(); }, [syncUser]);
  return null;
}

// ── Main Component ──────────────────────────────────────────────
interface GoogleAnalyticsProps {
  nonce?: string;
  /**
   * Initial consent state from the HttpOnly cookie, read by the server
   * component. When present we bake the analytics/marketing flags
   * directly into the consent default — no localStorage probe needed.
   */
  initialConsent?: ConsentCategories | null;
}

export default function GoogleAnalytics({ nonce, initialConsent = null }: GoogleAnalyticsProps) {
  if (!GA_MEASUREMENT_ID || process.env.NODE_ENV !== 'production') {
    return null;
  }

  const analytics = initialConsent?.analytics === true ? 'granted' : 'denied';
  const marketing = initialConsent?.marketing === true ? 'granted' : 'denied';

  return (
    <>
      {/*
        1. Consent Mode v2 defaults — MUST be set BEFORE gtag.js loads.
           Defaults are baked from the HttpOnly cookie at SSR time so we
           never touch localStorage and the consent state is always
           authoritative on the first paint.
      */}
      <Script id="ga-consent-defaults" strategy="beforeInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            'analytics_storage': '${analytics}',
            'ad_storage': '${marketing}',
            'ad_user_data': '${marketing}',
            'ad_personalization': '${marketing}',
            'functionality_storage': 'granted',
            'personalization_storage': '${analytics}',
            'security_storage': 'granted',
            'wait_for_update': 500
          });
        `}
      </Script>

      {/* 2. Load gtag.js */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
        nonce={nonce}
      />

      {/* 3. Initialize GA4 with enhanced config */}
      <Script id="ga-init" strategy="afterInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          
          gtag('config', '${GA_MEASUREMENT_ID}', {
            send_page_view: true,
            page_path: window.location.pathname,
            cookie_flags: 'SameSite=None;Secure',
            cookie_domain: 'auto',
            cookie_expires: 63072000,
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            custom_map: {
              'dimension1': 'user_role',
              'dimension2': 'job_source',
              'dimension3': 'work_mode',
              'dimension4': 'job_state',
              'dimension5': 'apply_method',
              'metric1': 'results_count'
            }
          });

          // No localStorage probe — the consent default above is
          // already authoritative because it was baked from the
          // HttpOnly cookie. Subsequent updates flow through
          // gtag('consent','update', ...) calls fired by the banner.
        `}
      </Script>

      {/* 4. SPA Route Tracker */}
      <Suspense fallback={null}>
        <RouteChangeTracker />
      </Suspense>

      {/* 5. User Identity Sync */}
      <UserIdentitySync />
    </>
  );
}
