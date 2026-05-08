import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Webpack is used by default (Turbopack is opt-in in Next.js 16)
  // This ensures compatibility with @react-pdf/renderer

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

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
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
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
