import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { CUSTOM_SUPABASE_HOSTS } from "./lib/supabase/origins";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Webpack is used by default (Turbopack is opt-in in Next.js 16)
  // This ensures compatibility with @react-pdf/renderer

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

  // Hide the Next.js dev indicator (the small "N" badge that appears in the
  // bottom-left during `npm run dev`). Only affects dev mode — production
  // never renders it. It was sitting on top of the mobile BottomNav and
  // looked like an extra menu item, which confused everyone during the
  // mobile audit. No impact on dev tooling — build errors still show in
  // the terminal and the Vercel overlay.
  devIndicators: false,

  // Native/WASM packages that must not be bundled by Turbopack
  serverExternalPackages: ['@resvg/resvg-js', '@napi-rs/canvas', 'pdf-parse'],

  // Vercel's serverless bundler doesn't trace pdfjs-dist's worker file
  // by default. lib/resume-parser.ts uses `disableWorker: true` so this
  // isn't strictly required at the moment, but tracing the file keeps
  // the resume-parse route working if a future version of pdf-parse
  // re-enables the worker without us noticing.
  outputFileTracingIncludes: {
    '/api/resume/parse': [
      './node_modules/pdf-parse/**/*',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/legacy/build/pdf.mjs',
    ],
    // The autofill resume extractor execFile()s scripts/extract-pdf-text.js in a
    // child Node process at runtime (process.cwd()/scripts/...). Vercel's nft
    // bundler can't see that string path, so without these includes the script
    // — and the pdf-parse it requires — are absent from the deployed function
    // and extraction silently returns '' in production.
    '/api/autofill/extract-resume-sections': [
      './scripts/extract-pdf-text.js',
      './node_modules/pdf-parse/**/*',
    ],
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    // Allowed `quality` values. 75 is the default; 90 is for illustration
    // surfaces (step/story/cover art) where AVIF at 75 visibly smears the
    // fine detail of busy 1024px art downscaled to small boxes.
    qualities: [75, 90],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // SEO Fix H2: bumped from 30d → 1y. The hero LCP image is served by
    // Supabase with `Cache-Control: no-cache`, but next/image's `/_next/image`
    // proxy honors `minimumCacheTTL` regardless of upstream headers — so by
    // raising this we keep the optimized variant immutable for a year on
    // the Vercel CDN regardless of Supabase's bucket headers. The audit
    // identified this as a high-impact LCP/CWV win.
    minimumCacheTTL: 31536000, // 1 year
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/**',
      },
      // A Supabase Custom Domain is a plain host with no wildcard to match,
      // so it only appears here once the env points at one. Empty otherwise.
      ...CUSTOM_SUPABASE_HOSTS.map((hostname) => ({
        protocol: 'https' as const,
        hostname,
        pathname: '/storage/**',
      })),
    ],
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },

  // Headers for caching and security
  async headers() {
    return [
      {
        // Security headers for all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // SEO Fix L3: COOP `same-origin-allow-popups` provides cross-origin
          // isolation against XS-Leak attacks (e.g. Spectre-like timing
          // attacks via window.opener). `allow-popups` is intentional —
          // strict `same-origin` would break OAuth redirect popups.
          // COEP intentionally NOT set: requires CORP/CORS headers on every
          // third-party asset (Supabase images, Google Fonts, GA, etc.) and
          // breaks the embed flow without significant rework. Revisit when
          // image optimization is fully self-hosted.
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          // CSP is set dynamically in middleware.ts with per-request nonce
        ],
      },
      {
        source: '/:all*(svg|jpg|png|webp|ico|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // SEO: 301 redirects to consolidate cannibalized pages
  async redirects() {
    return [
      // Consolidate salary content — 3 pages were splitting 708 impressions
      {
        source: '/blog/pmhnp-salary-guide-2026',
        destination: '/salary-guide',
        permanent: true,
      },
      {
        source: '/blog/average-pmhnp-salary-by-state-2026-real-numbers',
        destination: '/salary-guide',
        permanent: true,
      },
      // Consolidate new-grad job routes
      {
        source: '/new-grad',
        destination: '/jobs/new-grad',
        permanent: true,
      },
      // Crawler-discovered URL pattern that never existed; canonical route is /jobs/city/[slug]
      {
        source: '/jobs/locations/city/:slug',
        destination: '/jobs/city/:slug',
        permanent: true,
      },
      // Bots invent /salary-guide/city/<slug>; canonical content lives at /salary-guide
      {
        source: '/salary-guide/city/:slug*',
        destination: '/salary-guide',
        permanent: true,
      },
      // Legacy/expected /register path → canonical /signup
      {
        source: '/register',
        destination: '/signup',
        permanent: true,
      },
      // Common URL-guessing → canonical paths.
      // Footer links are correct, but users (and crawlers) often guess
      // shorter/simpler URLs. Without these, /states, /employers, /alerts
      // fall through to a 404 — better to 301 to the real page.
      {
        source: '/states',
        destination: '/jobs/locations',
        permanent: true,
      },
      {
        source: '/locations',
        destination: '/jobs/locations',
        permanent: true,
      },
      {
        source: '/employers',
        destination: '/for-employers',
        permanent: true,
      },
      {
        source: '/alerts',
        destination: '/job-alerts',
        permanent: true,
      },
      // Consolidate duplicate interview question articles — keyword cannibalization fix
      {
        source: '/blog/pmhnp-interview-questions',
        destination: '/blog/pmhnp-interview-questions-2026',
        permanent: true,
      },
      // GSC Fix (2026-07 audit P2.12): "-2" duplicate copies minted by blog
      // pipeline re-submissions (generateUniqueSlug silently suffixed on
      // collision — now it throws instead). The residency directory is the
      // #2 page on the site; its "-2" twin was live with a self-canonical,
      // splitting ranking signals. The job-outlook "-2" row is already
      // deleted (404) — the 301 recovers whatever inbound equity it earned.
      {
        source: '/blog/pmhnp-residency-fellowship-programs-2026-directory-how-to-apply-2',
        destination: '/blog/pmhnp-residency-fellowship-programs-2026-directory-how-to-apply',
        permanent: true,
      },
      {
        source: '/blog/pmhnp-job-outlook-2026-growth-rate-demand-future-predictions-2',
        destination: '/blog/pmhnp-job-outlook',
        permanent: true,
      },
      // Organic audit 2026-08 (#2): remaining duplicate blog clusters were
      // live at multiple self-canonical URLs, splitting ranking signals.
      // Canonical picks are data-driven from the 12-month GSC Pages export:
      // in each cluster the destination below is the URL with the strongest
      // (or only) recorded search performance. The redirected rows must
      // also be unpublished in Supabase so /blog and the sitemap stop
      // advertising URLs that now 301 (handled by the operator).
      //
      // Private-practice salary: one title on three published slugs.
      {
        source: '/blog/pmhnp-private-practice-salary',
        destination: '/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn',
        permanent: true,
      },
      {
        source: '/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn-2',
        destination: '/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn',
        permanent: true,
      },
      // Residency: third copy of the directory post (the "-2" twin above
      // already redirects to the same canonical).
      {
        source: '/blog/pmhnp-residency-programs',
        destination: '/blog/pmhnp-residency-fellowship-programs-2026-directory-how-to-apply',
        permanent: true,
      },
      // Job outlook: long-slug duplicate of the ranking short slug.
      {
        source: '/blog/pmhnp-job-outlook-2026-growth-rate-demand-future-predictions',
        destination: '/blog/pmhnp-job-outlook',
        permanent: true,
      },
      // Remote trio: three posts targeting the same "remote PMHNP jobs"
      // intent; only the ultimate-guide URL shows GSC performance.
      {
        source: '/blog/remote-pmhnp-jobs-guide-2026',
        destination: '/blog/ultimate-guide-remote-pmhnp-jobs-2026',
        permanent: true,
      },
      {
        source: '/blog/remote-pmhnp-jobs-in-2026-what-remote-really-means',
        destination: '/blog/ultimate-guide-remote-pmhnp-jobs-2026',
        permanent: true,
      },
      // Thin-post merge (2026-10-08): twenty-two posts that lived only in
      // the database, each a short take on a subject a canonical guide
      // already covers, with pay figures no source backed. Each now 301s to
      // the guide or page that answers the same question. The useful parts
      // of the five that had search traction were folded into their
      // destinations first; tests/seo/blog-merged-posts.test.ts pins both
      // the redirects and those sections. The rows are archived in the
      // database so /blog and the sitemap stop listing them.
      //
      // Pay and negotiation.
      {
        source: '/blog/how-to-ask-for-a-raise-as-a-pmhnp-scripts-timing',
        destination: '/blog/pmhnp-salary-negotiation',
        permanent: true,
      },
      {
        source: '/blog/pmhnp-salary-negotiation-3-things-most-people-skip',
        destination: '/blog/pmhnp-salary-negotiation',
        permanent: true,
      },
      {
        source: '/blog/the-real-cost-of-accepting-a-low-ball-offer',
        destination: '/blog/pmhnp-salary-negotiation',
        permanent: true,
      },
      {
        source: '/blog/dnp-vs-msn-pmhnp-salary-is-the-extra-degree-worth-it',
        destination: '/blog/how-to-become-a-pmhnp',
        permanent: true,
      },
      {
        source: '/blog/hospital-vs-private-practice-pay-real-numbers-for-pmhnps',
        destination: '/blog/pmhnp-private-practice-salary-how-much-can-you-really-earn',
        permanent: true,
      },
      {
        source: '/blog/highest-paying-pmhnp-states-col-adjusted-in-2026',
        destination: '/blog/pmhnp-salary-by-state-2026',
        permanent: true,
      },
      {
        source: '/blog/pmhnp-salary-growth-the-10-year-trend-20162026',
        destination: '/blog/pmhnp-job-outlook',
        permanent: true,
      },
      // Market and job search.
      {
        source: '/blog/35-pmhnp-job-growth-what-it-means-for-your-career',
        destination: '/blog/pmhnp-job-outlook',
        permanent: true,
      },
      {
        source: '/blog/how-fast-do-pmhnp-jobs-get-filled-timelines-tips',
        destination: '/blog/pmhnp-interview-questions-2026',
        permanent: true,
      },
      {
        source: '/blog/3-red-flags-in-pmhnp-job-postings-and-what-to-do',
        destination: '/blog/new-grad-pmhnp-guide-2026',
        permanent: true,
      },
      {
        source: '/blog/entry-level-pmhnp-what-to-realistically-expect',
        destination: '/blog/new-grad-pmhnp-guide-2026',
        permanent: true,
      },
      {
        source: '/blog/california-pmhnp-jobs-693-openings-what-to-know',
        destination: '/blog/pmhnp-jobs-california-texas-2026',
        permanent: true,
      },
      // Work arrangements.
      {
        source: '/blog/travellocum-tenens-pmhnp-is-it-worth-it',
        destination: '/blog/locum-tenens-pmhnp-guide-2026',
        permanent: true,
      },
      {
        source: '/blog/per-diem-pmhnp-the-flexibility-math',
        destination: '/blog/pmhnp-prn-moonlighting-guide-2026',
        permanent: true,
      },
      {
        source: '/blog/part-time-pmhnp-can-you-make-real-money',
        destination: '/blog/part-time-pmhnp-jobs-guide',
        permanent: true,
      },
      // Telehealth.
      {
        source: '/blog/telehealth-vs-in-person-which-pmhnp-role-pays-more',
        destination: '/blog/telehealth-pmhnp-guide',
        permanent: true,
      },
      {
        source: '/blog/telehealth-vs-in-person-pmhnp-vote-in-our-poll',
        destination: '/blog/telehealth-pmhnp-guide',
        permanent: true,
      },
      {
        source: '/blog/telehealth-pmhnp-the-fastest-growing-segment-in-2026',
        destination: '/blog/telehealth-pmhnp-guide',
        permanent: true,
      },
      // Employer and brand posts go to the pages built for those readers.
      {
        source: '/blog/why-your-pmhnp-job-post-isnt-getting-applicants',
        destination: '/for-employers',
        permanent: true,
      },
      {
        source: '/blog/how-to-write-a-pmhnp-job-post-that-actually-converts',
        destination: '/for-employers',
        permanent: true,
      },
      {
        source: '/blog/retention-starts-with-the-pmhnp-job-post-heres-how',
        destination: '/for-employers',
        permanent: true,
      },
      {
        source: '/blog/why-we-built-a-pmhnp-only-job-board-no-noise',
        destination: '/about',
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(
  withBundleAnalyzer(nextConfig),
  {
    // Sentry org/project — set SENTRY_ORG and SENTRY_PROJECT in Vercel env vars
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,

    // Source map upload auth token — set SENTRY_AUTH_TOKEN in Vercel
    authToken: process.env.SENTRY_AUTH_TOKEN,

    // Suppress Sentry CLI output during CI builds
    silent: true,

    // Upload source maps then delete them — don't ship maps to users
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },

    // Tree-shake Sentry debug logging from the production bundle
    disableLogger: true,

    // Proxy Sentry requests through /monitoring to bypass ad blockers
    tunnelRoute: '/monitoring',

    // SEO Fix H1: drop autoInstrumentAppDirectory + autoInstrumentMiddleware.
    // The audit found ~224KB raw / ~75KB gz of Sentry code (incl. d3-color and
    // d3-format from @sentry/replay-internal) in the rootMain bundle on every
    // page. Auto-instrumenting every app-directory page is the dominant cost.
    // Server-functions instrumentation stays on because it doesn't ship to
    // the browser. Re-enable selectively after measuring with bundle-analyzer
    // if granular Sentry tracing is genuinely needed.
    autoInstrumentServerFunctions: true,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
  }
);
