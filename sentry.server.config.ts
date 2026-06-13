/**
 * Sentry — Node.js (server) runtime init. Loaded by instrumentation.ts's
 * register() when NEXT_RUNTIME === 'nodejs'. No-op when SENTRY_DSN is unset
 * (local dev), so error monitoring only activates where it's configured.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  // Light server tracing — captures unhandled API/route errors without much
  // overhead. autoInstrumentServerFunctions stays on (next.config.ts).
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  // This app handles candidate PII — do NOT attach IP/email to events by default.
  sendDefaultPii: false,
});
