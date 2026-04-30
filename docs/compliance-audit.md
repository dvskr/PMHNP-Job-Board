# Cookies & Compliance Audit

> **Last audited:** 2026-04-29
> **Scope:** GDPR, CCPA/CPRA, ePrivacy, CAN-SPAM, CASL, COPPA, SOC2 readiness
> **App:** PMHNP Job Board (Next.js 15, Prisma, Supabase, Stripe, Resend, Vercel)

---

## Current State: ~25% enterprise-ready

Foundation exists (consent banner, privacy/terms pages, account deletion, data export, Consent Mode v2, CSP with nonce, hosted Stripe) but several **CRITICAL** gaps block GDPR/CCPA-regulated deployment.

### What's solid
- Consent Mode v2 wiring exists (just defaults wrong)
- Nonce-based CSP in middleware (good baseline)
- HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy all set — `next.config.ts:57-74`
- Stripe = hosted checkout (PCI-DSS SAQ-A — lowest scope)
- Resumes use signed URLs (1h expiry), not public — `lib/supabase-storage.ts:71`
- Account deletion + data export endpoints exist & cascade correctly
- List-Unsubscribe headers on emails (Gmail/Yahoo compliant)
- CSRF + rate limiting present on most routes

---

## CRITICAL — blocks enterprise sales / EU launch

| # | Status | Gap | Where | Why it matters |
|---|---|---|---|---|
| 1 | [x] | ~~GA defaults to `analytics_storage: 'granted'` before consent~~ → flipped to `'denied'` in `lib/analytics.ts:97` and `components/GoogleAnalytics.tsx:76`. Verified pre-consent external telemetry = 0 hits. | `lib/analytics.ts:97`, `components/GoogleAnalytics.tsx:76` | Direct GDPR Art. 7 / ePrivacy violation. Google receives IP/UA/session before "Accept" click. |
| 2 | [x] | ~~No GPC (Global Privacy Control) signal handling~~ → middleware now detects `Sec-GPC: 1` and `DNT: 1`, sets `pmhnp_privacy_signal` cookie + `x-privacy-signal` header. `CookieConsent` reads the cookie and auto-stores `'denied'`, suppressing the banner. Verified end-to-end with Playwright. | `middleware.ts:202-228`, `lib/consent.ts`, `components/CookieConsent.tsx` | CCPA/CPRA legal requirement. Auto-fail in California audits. |
| 3 | [ ] | Sub-processor list / DPAs not published | privacy page | GDPR Art. 28. Stripe/Resend/Supabase/Vercel/Google undisclosed. |
| 4 | [ ] | No data retention / auto-purge | `app/api/cron/cleanup-expired/route.ts` only unpublishes jobs | GDPR storage-limitation principle violated. Resumes/profiles linger forever. |
| 5 | [ ] | No incident-response / breach-notification plan | nowhere | GDPR Art. 33 = 72-hour notification SLA. No plan = automatic non-compliance. |

---

## HIGH — required for SOC2 / enterprise contracts

| # | Status | Gap | Where |
|---|---|---|---|
| 6 | [x] | ~~No geo-targeting~~ → middleware reads `x-vercel-ip-country` (+ `cf-ipcountry` fallback), classifies into `strict` (EEA + UK + CH + CA + BR + AU) vs `implied` (rest). Banner shows only in strict regions; implied regions auto-grant analytics. GPC always trumps. Verified across 7 scenarios. | `middleware.ts:33-53,229-249`, `lib/consent.ts`, `components/CookieConsent.tsx` |
| 7 | [x] | ~~No granular consent categories~~ → banner now has Customize panel with Essential (locked-on), Analytics, Marketing toggles. Each maps to distinct GA Consent Mode v2 signals via `updateConsentByCategories()`. Storage shape: `{categories:{analytics, marketing}, version, ts}`. "Cookie Settings" reopen pre-populates current toggle state. Verified across 5 flows. | `components/CookieConsent.tsx`, `lib/consent.ts`, `lib/analytics.ts:136-145` |
| 8 | [x] | ~~No consent withdrawal UI~~ → "Cookie Settings" button added next to Privacy/Terms in `components/Footer.tsx`. Calls `reopenConsentBanner()`, clears storage, dispatches `pmhnp:consent-reopen`, banner re-mounts without page reload. | `components/Footer.tsx`, `lib/consent.ts` |
| 9 | [x] | ~~No consent versioning~~ → storage now `{value, version, ts}` JSON. `CONSENT_VERSION = '1'` in `lib/consent.ts`; bumping it invalidates prior consents. Legacy bare-string values also treated as expired. Verified: stale version → re-prompt. | `lib/consent.ts:8-15` |
| 10 | [x] | ~~Vercel Speed Insights + Sentry fire **before** consent~~ → Speed Insights now wrapped in `components/ConsentGatedTelemetry.tsx`, mounts only after `'accepted'`. Sentry is build-time wired only (no client init), so latent — revisit if `sentry.client.config.ts` is added. | `app/layout.tsx:233`, `next.config.ts:124` |
| 11 | [ ] | AI candidate match scoring not disclosed (GDPR Art. 22 right-to-object) | `prisma/schema.prisma:430-432` `aiMatchScore` |
| 12 | [ ] | EEO data (race, disability, veteran status) + DEA/NPI stored without separate sensitive-data consent | `prisma/schema.prisma:367-378` |
| 13 | [ ] | Hard-delete of account with no legal-hold / soft-delete window | `app/api/auth/delete-account/route.ts:28` |
| 14 | [ ] | Password-reset rate limit is 10/min (too lenient — should be ~3/hour) | `lib/rate-limit.ts` |
| 15 | [ ] | No CCPA "Do Not Sell or Share" link / endpoint | privacy page claims "we don't sell" but pixels = "share" under CPRA |

---

## MEDIUM — polish for enterprise positioning

| # | Status | Gap |
|---|---|---|
| 16 | [x] | ~~No IP anonymization on GA4~~ → added `anonymize_ip: true` + flipped `allow_google_signals: false` in `components/GoogleAnalytics.tsx:108-110` |
| 17 | [ ] | No virus scanning on resume uploads (SOC2 / HIPAA-adjacent expectation) |
| 18 | [ ] | Privacy policy doesn't name vendors (GA, Sentry, Vercel) explicitly |
| 19 | [ ] | Consent stored in localStorage (XSS-vulnerable) instead of HttpOnly cookie |
| 20 | [ ] | CSP allows `'unsafe-inline'` styles + non-nonced GTM/Stripe sources |
| 21 | [ ] | No double-opt-in on job alerts (CASL/GDPR best practice) |
| 22 | [ ] | Click-tracking endpoint not gated by consent (`app/api/analytics/clicks/route.ts`) |
| 23 | [ ] | Audit logging is `console`-only (`lib/audit-log.ts`) — no DB audit trail for exports/deletions |
| 24 | [ ] | No DSAR intake form / SLA tracker — privacy policy promises 30 days but nothing enforces it |
| 25 | [ ] | Email logged in plaintext at `app/auth/callback/route.ts` (stripped in prod, but leaks in staging) |

---

## Roadmap to enterprise-ready (~90%)

> Remaining 10% (SOC2 attestation, formal DPIA, vendor security questionnaires) is process work, not code.

### Sprint 1 — unblock EU/CA launch (1–2 weeks)
- [x] Flip GA defaults to `'denied'`; gate Speed Insights behind consent _(Sentry has no client init — latent only)_
- [x] Add GPC + DNT signal handling in middleware (auto-deny)
- [x] Geo-detect via Vercel `x-vercel-ip-country` — restrictive defaults only for EU/UK/CA, US implied consent
- [x] Add consent versioning + "Cookie Settings" footer link to re-open banner
- [x] Add granular categories (Essential / Analytics / Marketing) to banner

**Sprint 1 complete** — current state: ~50% enterprise-ready. EU/UK/CA launchable for the consent layer. Remaining CRITICAL gaps (#3, #4, #5) are policy/process work in Sprints 2 + 3.

### Sprint 2 — legal docs (1 week)
- [ ] Publish sub-processor list page + DPA template
- [ ] Rewrite privacy policy: name every vendor, retention periods, GDPR Art. 22 (AI matching), CCPA opt-out, sensitive EEO consent
- [ ] Add `/data-request` form + DSAR tracking table
- [ ] Add "Do Not Sell or Share" link + endpoint

### Sprint 3 — data lifecycle (1 week)
- [ ] Soft-delete + 30-day grace + hard-purge cron
- [ ] Inactive-user purge cron (e.g., 24-month no-login)
- [ ] Audit log table for exports / deletions / role changes
- [ ] Tighten password-reset rate limit; add separate sensitive-data consent toggle for EEO/DEA

### Sprint 4 — security polish (1 week)
- [ ] Add IP anonymization + remove `'unsafe-inline'` styles where possible
- [ ] Resume virus-scan (ClamAV in Supabase function or Cloudmersive API)
- [ ] Move consent flag from localStorage → HttpOnly cookie
- [ ] Document incident-response runbook + breach-notification template

---

## Detailed findings (reference)

### 1. Pre-consent data collection — CRITICAL
- `app/layout.tsx:153-154` — preconnect to `googletagmanager.com` + `fonts.googleapis.com` before banner
- `components/GoogleAnalytics.tsx:71-86` — GA4 consent defaults set with `'granted'` despite later override claim
- Google receives analytics data (IP, UA, page views, session IDs) before explicit consent

### 2. Tracking scripts inventory
| Script | Loaded at | Consent gated? |
|---|---|---|
| GA4 (gtag) | `components/GoogleAnalytics.tsx`, `afterInteractive` | Partial (defaults wrong) |
| Vercel Speed Insights | `app/layout.tsx:233` | ❌ No |
| Sentry | `next.config.ts:124` (`withSentryConfig`) | ❌ No |
| Stripe (`js.stripe.com`) | Checkout flow only | N/A — hosted checkout |

**Not present (good):** Meta Pixel, LinkedIn Insight, TikTok Pixel, Hotjar, Mixpanel, Segment, Amplitude, Clarity, PostHog, Intercom, Drift, Hubspot.

### 3. First-party cookies
| Cookie | Source | Flags | Notes |
|---|---|---|---|
| Supabase auth | `lib/supabase/middleware.ts:13-27` | HttpOnly + Secure + SameSite=Lax (Supabase defaults) | OK |
| GA4 (`_ga`, `_ga_*`) | `components/GoogleAnalytics.tsx:105` | `SameSite=None;Secure`, 2-year expiry | OK once consent fixed |
| `pmhnp_cookie_consent` | `components/CookieConsent.tsx:31,37` | localStorage (not a cookie) | XSS-readable; should be HttpOnly cookie |

### 4. Security headers (`next.config.ts:57-74`, `middleware.ts:96-124`)
- ✅ HSTS (2y, includeSubDomains, preload)
- ✅ X-Frame-Options DENY
- ✅ X-Content-Type-Options nosniff
- ✅ Referrer-Policy strict-origin-when-cross-origin
- ✅ Permissions-Policy (camera/mic/geo blocked)
- ✅ CSP with per-request nonce
- ⚠️  CSP `style-src 'unsafe-inline'` (Next.js limitation)
- ⚠️  CSP allows `googletagmanager.com` + `js.stripe.com` un-nonced

### 5. PII inventory (`prisma/schema.prisma`)
- **UserProfile:** email, phone, name, address, postal code, NPI, DEA, license states, race/ethnicity, gender, work authorization, disability status, resume URL
- **JobApplication:** resume URL, cover letter, screening answers, `aiMatchScore`
- Heightened-protection fields (NPI, DEA, EEO) lack separate consent

### 6. Vendors / sub-processors
| Vendor | Purpose | Disclosed in privacy policy? | DPA available? |
|---|---|---|---|
| Stripe | Payments | ✅ | Need to publish |
| Resend | Email | ✅ | Need to publish |
| Supabase | Auth + DB + Storage | ❌ | Need to publish |
| Vercel | Hosting + Speed Insights | ❌ | Need to publish |
| Google (GA4) | Analytics | Vague ("analytics") | Need to publish |
| Sentry | Error tracking | ❌ | Need to publish |

### 7. Data subject rights
- ✅ Account deletion: `app/api/auth/delete-account/route.ts` (rate-limited, CSRF-protected, cascades)
- ✅ Data export: `app/api/profile/export/route.ts` (returns JSON)
- ✅ Unsubscribe: `app/unsubscribe/page.tsx` + `app/job-alerts/unsubscribe/page.tsx`
- ❌ DSAR intake form / SLA tracker
- ❌ "Do Not Sell or Share" mechanism

### 8. Email compliance (`lib/email-service.ts`, `lib/email-service-v2.ts`)
- ✅ List-Unsubscribe + List-Unsubscribe-Post headers (lines 112-116)
- ✅ Marketing vs transactional sender separation (lines 47-56)
- ✅ Suppression checks before sending (lines 139-145)
- ❌ No double opt-in for job alerts

### 9. Audit logging (`lib/audit-log.ts`)
- Currently `console.log` only; no DB table
- Missing: data export requests, account deletions, password changes, role changes

### 10. Data retention
- `app/api/cron/cleanup-expired/route.ts` unpublishes expired jobs but does not delete
- No inactive-user purge
- `JobHealthCheck` table grows unbounded (~100k rows/week)

---

## Severity legend
- **CRITICAL** — Legal/regulatory blocker; fix before EU/CA launch or enterprise sales call
- **HIGH** — Required for SOC2 attestation or enterprise procurement security review
- **MEDIUM** — Polish; closes nice-to-have gaps that come up in vendor security questionnaires
- **LOW** — Style / defense-in-depth (none currently rated LOW)
