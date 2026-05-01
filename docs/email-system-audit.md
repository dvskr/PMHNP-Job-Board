# Email System — End-to-End Audit

Snapshot date: **2026-04-30** (last refreshed end of day).
Companion to [`pipeline-issues-and-crons.md`](./pipeline-issues-and-crons.md), [`compliance-audit.md`](./compliance-audit.md), and [`incident-response.md`](./incident-response.md).

This document catalogs every email the platform sends, the routes and crons that trigger them, the suppression/unsubscribe machinery, and the outstanding gaps.

---

## Changelog

### 2026-04-30 — late afternoon refresh

Multiple targeted fixes shipped against the job alert pipeline and shared template helpers:

- **Job alert multi-recipient dedup fixed** (was issue 10 below, HIGH). [`lib/job-alerts-service.ts`](../lib/job-alerts-service.ts) `sendJobAlerts` now groups results by recipient email and sends ONE consolidated email per user with deduped jobs across all their alerts, instead of N emails for N alerts.
- **Job alert email layout overhaul**. Salary moved under title (no longer cramped beside it), removed redundant "View Job" CTA, added Featured badge next to salary when `isFeatured=true`, dynamic apply button label (`⚡ Easy Apply` / `Direct Apply` / `Apply Now ↗`) mirroring [`components/ApplyButton.tsx`](../components/ApplyButton.tsx). Apply button now uses the on-site teal gradient `linear-gradient(135deg,#2DD4BF,#0D9488)` with `#0d9488` solid fallback for clients that strip gradients.
- **Layout bug: button overflow on mobile fixed**. [`primaryButtonV2`/`secondaryButtonV2`](../lib/email-templates-v2.ts) now use `box-sizing:border-box` so `width:100%` from the `.btn-full` mobile media query includes padding instead of adding to it. Buttons no longer extend ~40px past the email card edge at 390px.
- **Layout bug: hero text clipping fixed**. The expiry-warning sender's hero block was using `width="22%"/"78%"` percentage table cells; replaced with fixed-pixel image cell + flexible text cell. Same fix applied in the preview catalog for `job-alert` and `expiry-warning`.
- **Email header redesign**. Cropped logo (transparent background, no peach baked in), 48×55 size, brand text + "MENTAL HEALTH CAREERS" tagline both center-aligned within the header column. Footer color updated `#292524` → `#1c1917` to match the website footer ([`components/Footer.tsx:90`](../components/Footer.tsx#L90)).
- **Intro paragraphs center-aligned**. `bodyTextV2()` (and the preview's local `bodyText()`, plus `simpleBlock()` and `simple()` helpers) all center their text. Used as the first paragraph after the headline in 7+ senders.
- **Admin email preview tooling**. New `?all=1` mode at [`/api/email-preview`](../app/api/email-preview/route.ts) renders all 21 templates on one scrolling page with sticky Mobile/Desktop viewport toggle (390px / 640px) and per-iframe height polling. Sets its own permissive CSP; middleware skips CSP injection for `/api/email-preview/*` ([`middleware.ts:294`](../middleware.ts#L294)).
- **Suppression cache** in `sendJobAlerts` — 10 alerts for the same email now trigger 1 suppression DB lookup instead of 10.
- **First-send backfill cap** in `sendJobAlerts` — clamps the per-alert "jobs since" cutoff to a max of 7 days when `lastSentAt` is null. Prevents a 30-day-old confirmed alert from blasting a user with 30 days of stale jobs on its first fire. Code: `Math.max(alert.createdAt, now - 7d)`.
- **Orphan `sendJobAlertEmail` removed** from `lib/email-service.ts` — was a parallel reimplementation of the production renderer with no callers. Test mock in `tests/setup.ts` also cleaned up. One step toward closing issue 10 (three-way drift); the preview catalog is still its own copy.
- **Job alert ordering aligned with website `best` sort** — `sendJobAlerts` now uses `[isFeatured DESC, qualityScore DESC, originalPostedAt DESC, createdAt DESC]`, the same comparator as `/api/jobs/route.ts` default `best` sort. The platform already encodes a +30 employer-posted bonus inside `qualityScore` ([`lib/utils/quality-score.ts:138-143`](../lib/utils/quality-score.ts#L138)), plus 0-30 link quality, 0-20 salary completeness, 0-10 description, 0-10 location specificity, and 0-20 freshness. So email and web ordering are now in lockstep — change `computeQualityScore` once and both surfaces update. (Briefly tried a custom 4-tier function for emails before discovering qualityScore already does this; reverted to the unified approach.)
- **Category page sort consistency pass** — five category/city listing pages were on the legacy `[isFeatured DESC, createdAt DESC]` order and missing the `qualityScore` boost. Upgraded to the canonical 4-key sort: [`addiction`](../app/jobs/addiction/page.tsx), [`behavioral-health`](../app/jobs/behavioral-health/page.tsx), [`new-grad`](../app/jobs/new-grad/page.tsx), [`city/[slug]`](../app/jobs/city/[slug]/page.tsx), [`metro/[slug]`](../app/jobs/metro/[slug]/page.tsx) (the last had `qualityScore` but was missing `originalPostedAt`). Now all 28 category root pages, both shared pSEO templates ([`lib/pseo/setting-state-template.tsx`](../lib/pseo/setting-state-template.tsx), [`lib/pseo/category-city-template.tsx`](../lib/pseo/category-city-template.tsx)), and the main `/jobs` page sort identically — employer posts surface above aggregator posts everywhere on the site.
- **Single source of truth for the `best` sort** — extracted [`lib/utils/job-sort.ts`](../lib/utils/job-sort.ts) exporting both `BEST_SORT_ORDER_BY` (Prisma orderBy used by `/api/jobs/route.ts` and `lib/job-alerts-service.ts`) and `compareJobsBest()` (in-memory comparator used after cross-alert dedup). Both share the same 4-key ranking semantics. Pinned by 11 unit tests in [`tests/lib/job-sort.test.ts`](../tests/lib/job-sort.test.ts) covering: orderBy snapshot shape, featured precedence, qualityScore tiebreakers, the employer-bonus scenario, originalPostedAt fallback to createdAt, null handling, and a realistic mixed-list ordering check. Future drift between DB and JS sides will fail CI. Also updated `tests/api/jobs.test.ts` to import `BEST_SORT_ORDER_BY` instead of inlining the expected order.
- **Saved-job-reminder email card unified with alert card** — `sendSavedJobReminderEmail` ([`lib/email-service.ts:1216`](../lib/email-service.ts)) previously rendered a minimal card (title + employer · location + small Apply button) but never even rendered the cards into the email body — it built `jobCardsHtml` then dropped it on the floor and only sent a hero-image intro. Now renders the same rich card as the job-alert email: salary under title, Featured badge support, mode/jobType/location chips, gradient teal Apply CTA with dynamic `⚡ Easy Apply` / `Direct Apply` / `Apply Now ↗` label. Cron route updated to `select` the additional Job fields (salary, mode, jobType, isFeatured, applyOnPlatform, sourceType, createdAt) needed by the card. Preview catalog `saved-job-reminder` and `email-job` templates also updated to match. (Card markup is now duplicated across `buildAlertHtml`, `sendSavedJobReminderEmail`, and the preview — a future cleanup is to extract a shared `renderJobCardHtml` helper. Audit issue 10 step 2.)
- **Image-blocking hardening** — Outlook desktop, corporate networks, and Apple Mail privacy mode block images by default for ~40-60% of opens. Audited every `<img>` across `lib/email-templates-v2.ts`, `lib/email-service.ts`, the preview catalog, and the employer-outreach route. For each: (1) replaced empty `alt=""` with meaningful text (e.g., "PMHNP Hiring logo", "Welcome to PMHNP Hiring", step titles), (2) added explicit `width` AND `height` HTML attributes so the layout slot reserves space before the image loads, (3) added `bgcolor` on the image's `<td>` and inline `background-color` on the `<img>` itself for a colored placeholder, (4) added inline `color`, `font-family`, `font-size`, `font-weight`, `line-height` on the `<img>` so the alt text renders as styled text (not the broken-icon glyph) when blocked. Also collapsed three duplicated step-icon blocks in `sendSignupWelcomeEmail` to use the now-fixed `stepBlock()` helper.
- **Audit clean-sweep — all 10 open issues addressed**:
  - **Issue 1 (HIGH)** — five direct-Resend routes refactored to use `sendAndLog`. `/api/email-job`, `/api/auth/send-confirmation`, `/api/contact` (×2), `/api/salary-guide`, `/api/admin/employer-outreach` now go through the wrapper with suppression checks (where applicable) and List-Unsubscribe headers (where applicable). The bulk employer-outreach route filters suppressed addresses upfront and writes per-recipient `EmailSend` rows so the bounce/complaint webhook can find them by `resendId`.
  - **Issue 2 (HIGH)** — List-Unsubscribe headers added to `sendSignupWelcomeEmail`, `sendConfirmationEmail`, and `sendExpiryWarningEmail` (the last had been passing `editToken` semantically wrong; now uses real unsub token via `getOrCreateUnsubToken`).
  - **Issue 3 (medium)** — `lib/email-service-v2.ts` deleted entirely. Only reference was a stale comment in `purge-inactive-users` route, also cleaned up.
  - **Issue 4 (medium)** — sender drift fixed. `lib/email-service.ts` now reads `EMAIL_REPLY_TO` from env (defaults `hello@`), aligning v1 with brand config. `brand.ts` comment about v2 removed.
  - **Issue 5 (medium)** — env validation added in `lib/env.ts` for `EMAIL_FROM_MARKETING`, `EMAIL_REPLY_TO`, `EMAIL_ASSETS_URL`, `SALARY_GUIDE_URL`, `RESEND_WEBHOOK_SECRET`. All have sensible defaults so dev doesn't break; production will fail at startup if unset (when made required).
  - **Issue 6 (low)** — `.gitignore` updated to ignore `_email_preview_*.html` and `test-*-email.html` at repo root.
  - **Issue 7 (low)** — `EmailType` union type defined in `lib/email-service.ts` and used as the `emailType` param of `sendAndLog` and `MARKETING_EMAIL_TYPES`. Caught 3 drift bugs immediately during compile (different callers using different strings for the same email type — would have silently broken `MARKETING_EMAIL_TYPES.has()` lookups). `sendAndLog` is now exported so all routes can use it.
  - **Issue 8 (low)** — `app/api/email/preferences/route.ts` swapped `console.error` for `logger.error` (2 sites).
  - **Issue 9 (low)** — webhook `EmailSend.updateMany` moved outside the per-recipient loop so it runs once per webhook (not N times for multi-recipient payloads).
  - **Issue 10 (medium)** — extracted `lib/utils/render-job-card.ts` exporting `renderJobCardHtml(job, index, isLast)`. `buildAlertHtml` (job-alerts-service.ts) and `sendSavedJobReminderEmail` (email-service.ts) both use it now. Card markup is a single source of truth — change once, both surfaces update. Preview catalog mirroring stays best-effort but the production sites are now fully unified.
- **Profile-nudge email feature deleted entirely** — `sendProfileIncompleteEmail` and the `/api/cron/profile-nudge` cron (which ran daily at 18:00 UTC against job-seeker profiles <60% complete and >3 days old) have been removed. Files deleted: `app/api/cron/profile-nudge/route.ts`, the `sendProfileIncompleteEmail` function from `lib/email-service.ts` (~62 lines), the `'profile_nudge'` entry from `MARKETING_EMAIL_TYPES` in both v1 and v2 service files, the `profile-incomplete` preview catalog template, and the cron entry from `vercel.json`. The `UserProfile.lastNudgedAt` schema column remains for now (no migration scoped); harmless to keep. Email-sending crons drop from 6 to 5.
- **Job alerts switched to single opt-in** — `/api/job-alerts/route.ts` previously created alerts as `isActive=false, confirmedAt=null` and sent a "Confirm Subscription" email containing a link to `/api/job-alerts/confirm` (CASL/GDPR double-opt-in pattern). Now alerts are created with `isActive=true, confirmedAt=now()` and the welcome ("Your Alerts Are Live") email goes out immediately via `sendWelcomeEmail`. The `sendAlertConfirmationEmail` function and the `alert-confirm` preview template were both deleted. The `/api/job-alerts/confirm` endpoint is kept in place to grandfather any in-flight pending alerts from the old flow. Tradeoff: weaker explicit-consent signal to Gmail/Yahoo (relevant under their bulk-sender 2024 rules), slightly higher abuse risk (someone signing up another person's address). Justified for a US-only audience with a niche topic where conversion friction matters more than ISP reputation. Net result: the audit's issue 1 list of "leaky direct-Resend routes" drops from 6 to 5 — `/api/job-alerts` no longer sends any direct-Resend mail at all.
- **Litmus pass — three real-client fixes**:
  - **Welcome hero image removed entirely** (production + preview). It was rendering at the wrong aspect ratio in Outlook 2021 (Windows 11 dark mode showed an oversized stretched image dominating the email) and was a leading source of weird first-paint experiences. The signup welcome now goes header → centered intro → step-icons → CTA, matching the cleaner pattern used by every other email.
  - **Brand-text contrast hardened** for Gmail Android dark mode. Gmail Android applies its own color-inversion that ignores `<meta color-scheme>` and `prefers-color-scheme` media queries. "PMHNP Hiring" and the "MENTAL HEALTH CAREERS" tagline now have inline `-webkit-text-fill-color`, `mso-line-height-rule:exactly`, and explicit hex colors (`#1F2937`, `#0d9488`) instead of relying on V2 token colors. Tagline weight bumped 500 → 700. Logo + brand text now stay readable on the peach header in every dark-mode client tested.
  - **Bulletproof button pattern** in `primaryButtonV2`, `secondaryButtonV2`, and the inline job-card Apply button. Outlook (Windows 11) was stripping `background-image: linear-gradient(...)`, collapsing `padding` on the `<a>` tag, ignoring `border-radius`, and rendering the button as a plain colored span. The new pattern wraps each button in `<!--[if mso]>...<v:roundrect>...<![endif]-->` for Outlook (renders as a real rounded rectangle via VML) and `<!--[if !mso]><!-- ...<a>... <!--<![endif]-->` for everyone else (gradient + shadow + radius preserved). Inline job-card buttons in `buildAlertHtml`, `sendSavedJobReminderEmail`, and the preview's `email-job` / `saved-job-reminder` / `job-alert` templates all use a shared `applyButton(url, label)` helper. `mso-hide:all` on the modern anchor prevents Outlook from rendering both copies side-by-side.
- **Email assets env var** — `EMAIL_ASSETS_URL` moved to `.env` (was only in `.env.prod`); dev previews now resolve the Supabase CDN.
- **Cropped logo uploaded** to Supabase email-assets bucket as `logo-cropped.png`. New helper [`scripts/upload-logo-cropped.js`](../scripts/upload-logo-cropped.js) for re-uploads.

### Newly identified issue (open)

**Three-way drift for the job alert email** — see issue 10. There are now three parallel implementations of the same template, all kept in sync manually for this round of changes. Merits consolidation.

---

## Architecture

```
                ┌─ Transactional sends (noreply@pmhnphiring.com)
Resend SDK ◄────┤
                └─ Marketing sends     (alerts@pmhnphiring.com)
                          ▲
                          │ sendAndLog() wrapper
                          │  • injects List-Unsubscribe headers
                          │  • writes to EmailSend table
                          │  • picks transactional vs marketing sender
                          │
            ┌─────────────┴─────────────┐
   [lib/email-service.ts]      [lib/email-service-v2.ts]
        ACTIVE — 18 senders          DEPRECATED — 3 partial duplicates
            │                                  │
            ▼                                  ▼
     21 cron + API routes              1 cron route (no actual send)
                          ▲
                          │ (engagement, bounces, complaints)
                  [POST /api/webhooks/resend]
                          │
                          ▼
                 EmailSend / EmailLead / UserProfile
                          (suppression flags)
```

**Sender domains**

| Role | Address | Configured via |
|---|---|---|
| Transactional | `noreply@pmhnphiring.com` | `EMAIL_FROM` |
| Marketing | `alerts@pmhnphiring.com` | `EMAIL_FROM_MARKETING` |
| Reply-to | `support@pmhnphiring.com` (v1), `hello@pmhnphiring.com` (v2 / a few routes — drift, see issue 4) | hardcoded in `lib/email-service.ts:50` |
| Webhook ingress | `/api/webhooks/resend` (Svix-verified) | `RESEND_WEBHOOK_SECRET` |

---

## Email inventory

Most active senders live in [`lib/email-service.ts`](../lib/email-service.ts). One critical exception: the actual job-alert cron sender lives in [`lib/job-alerts-service.ts`](../lib/job-alerts-service.ts) — see issue 10 below. The `emailType` column is the value written to `EmailSend.emailType` and is also what `MARKETING_EMAIL_TYPES` checks to decide sender domain.

| # | Function | `emailType` | Sender | Recipient | Trigger | Suppression check | Unsub header |
|---|---|---|---|---|---|---|---|
| 1 | `sendWelcomeEmail` | `welcome_alert` | marketing | seeker | `/api/job-alerts` confirm | yes | yes |
| 2 | `sendSignupWelcomeEmail` | `welcome_signup` | transactional | seeker / employer | `/api/auth/welcome` | via wrapper | no (no token passed) |
| 3 | `sendConfirmationEmail` | `job_confirmation` | transactional | employer | post-job route | via wrapper | no |
| 4 | `sendJobAlerts` (in `job-alerts-service.ts`, not `email-service.ts`) | `job_alert` | marketing | seeker | **cron** `send-alerts` 13:30 UTC | yes (cached per email) | yes |
| 5 | `sendRenewalConfirmationEmail` | `renewal_confirmation` | transactional | employer | Stripe webhook | via wrapper | n/a |
| 6 | `sendExpiryWarningEmail` | `expiry_warning` | transactional | employer | **cron** `expiry-warnings` 22:00 UTC | via wrapper | partial (uses editToken — inconsistent) |
| 7 | `sendDraftSavedEmail` | `draft_saved` | transactional | employer | `/api/job-draft` | via wrapper | n/a |
| 8 | `sendEmployerMessageNotification` | `employer_message_notification` | transactional | employer | `/api/conversations/[id]` | via wrapper | n/a |
| 9 | `sendCandidateInquiryNotification` | `candidate_inquiry_notification` | transactional | seeker | `/api/candidate/messages` | via wrapper | n/a |
| 10 | `sendNewCandidateAlertEmail` | `candidate_alert` | marketing | employer | **cron** `candidate-alerts` 13:45 UTC | yes | yes |
| 11 | `sendBroadcastEmail` | `broadcast` | marketing | bulk | `/api/admin/email/send` | yes (per recipient) | yes |
| 12 | `sendNewApplicationEmail` | `new_application` | transactional | employer | `/api/applications/apply-direct` | via wrapper | n/a |
| 13 | `sendApplicationConfirmationEmail` | `application_confirmation` | transactional | seeker | applications route | via wrapper | n/a |
| 14 | `sendStatusUpdateEmail` | `status_update` | transactional | seeker | employer dashboard | via wrapper | n/a |
| ~~15~~ | ~~`sendProfileIncompleteEmail`~~ | ~~`profile_nudge`~~ | ~~marketing~~ | ~~seeker~~ | **deleted 2026-04-30** — feature removed entirely | — | — |
| 16 | `sendPerformanceReportEmail` | `performance_report` | marketing | employer | **cron** `employer-report` Mon 14:00 UTC | yes | yes |
| 17 | `sendSavedJobReminderEmail` | `saved_job_reminder` | marketing | seeker | **cron** `saved-job-reminder` Wed/Sat 13:00 UTC | yes | yes |
| 18 | (helpers) `buildContactConfirmationHtml`, `buildContactNotificationHtml`, `buildSalaryGuideHtml`, `buildBroadcastHtml` | n/a | n/a | n/a | template builders only | n/a | n/a |

Plus four "leaky" senders that bypass the wrapper — see issue 1:

| Route | Effective type | Sender | Recipient | Notes |
|---|---|---|---|---|
| `/api/email-job` | (unlogged) | hardcoded | varies | direct `resend.emails.send` |
| `/api/auth/send-confirmation` | `confirm` | hardcoded | new user | direct send + manual EmailSend insert |
| `/api/contact` (×2) | `contact_*` | hardcoded | support + user | direct sends |
| `/api/salary-guide` | `salary_guide` (marketing!) | hardcoded | lead | direct send, no suppression, no List-Unsubscribe |
| ~~`/api/job-alerts` (subscribe)~~ | ~~`alert_confirm`~~ | ~~hardcoded~~ | ~~seeker~~ | **resolved 2026-04-30** — switched to single opt-in, no longer sends a direct-Resend confirmation email; calls `sendWelcomeEmail()` instead |
| `/api/admin/employer-outreach` | n/a | hardcoded | employer leads | direct bulk send, not logged |

---

## Cron schedule (email-relevant)

From [`vercel.json`](../vercel.json):

| Cron path | Schedule (UTC) | Email function | Email type | Throttle / dedup |
|---|---|---|---|---|
| `/api/cron/send-alerts` | `30 13 * * *` daily | `sendJobAlerts` (`lib/job-alerts-service.ts`) | `job_alert` | `JobAlert.lastSentAt` per alert; per-email dedup across multi-alert users (added 2026-04-30) |
| `/api/cron/candidate-alerts` | `45 13 * * *` daily | `sendNewCandidateAlertEmail` | `candidate_alert` | per-employer cooldown |
| ~~`/api/cron/profile-nudge`~~ | ~~`0 18 * * *` daily~~ | ~~`sendProfileIncompleteEmail`~~ | ~~`profile_nudge`~~ | **deleted 2026-04-30** |
| `/api/cron/saved-job-reminder` | `0 13 * * 3,6` Wed & Sat | `sendSavedJobReminderEmail` | `saved_job_reminder` | `lastSavedJobReminderAt` 7-day window |
| `/api/cron/expiry-warnings` | `0 22 * * *` daily | `sendExpiryWarningEmail` | `expiry_warning` | `EmployerJob.expiryWarningSentAt` |
| `/api/cron/employer-report` | `0 14 * * 1` Mon | `sendPerformanceReportEmail` | `performance_report` | weekly cadence is the dedup |
| `/api/cron/daily-report` | `0 13 * * *` | (Discord webhook, no email) | — | — |
| `/api/cron/health-anomaly-check` | `0 13 * * *` | (Discord/log only) | — | — |
| `/api/cron/push-notifications` | `30 14 * * *` | (web push, no email) | — | — |
| `/api/cron/purge-inactive-users` | `45 8 * * *` | references v2 lib but does **not** send | — | — |
| All other ~30 crons (ingest / enrich / indexing / social / cleanup) | varies | none | — | — |

Six crons send email; the rest do not.

---

## Compliance & deliverability stack

### Suppression check

[`isEmailSuppressed`](../lib/email-service.ts#L139) reads two tables in parallel and returns `true` if either flag is set:

```ts
EmailLead.isSuppressed   // set by webhook on bounce/complaint
UserProfile.emailSuppressed  // mirror for authenticated users
```

Marketing senders (`job_alert`, `candidate_alert`, `performance_report`, `saved_job_reminder`, `welcome_alert`, `broadcast`) call this before `sendAndLog`. Transactional senders rely on the wrapper itself — but the wrapper does **not** check suppression. Audit gap: see issue 1.

### Unsubscribe tokens

- Stored on `EmailLead.unsubscribeToken` (CUID, unique index).
- Auto-created by [`getOrCreateUnsubToken`](../lib/email-service.ts#L158) on first marketing send to an address that has no `EmailLead` row.
- Token is opaque, idempotent, never expires.

### List-Unsubscribe header

`sendAndLog` injects RFC 8058 one-click headers when an `unsubscribeUrl` is supplied:

```
List-Unsubscribe: <https://pmhnphiring.com/unsubscribe?token=...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Required for Gmail/Yahoo bulk-sender 2024 rules. Coverage is partial — see issue 2.

### Unsubscribe routes

- `GET /api/email/unsubscribe?token=...` → flips `isSubscribed=false`, `newsletterOptIn=false`. Renders confirmation page.
- `POST /api/email/unsubscribe` → one-click POST per RFC 8058. Same effect.
- `GET /api/email/preferences?token=...` → granular preference page (per-channel toggles).

### Resend webhook

[`/api/webhooks/resend`](../app/api/webhooks/resend/route.ts) verifies via Svix (`RESEND_WEBHOOK_SECRET`), then:

| Event | Action |
|---|---|
| `email.delivered` | `EmailSend.status = 'delivered'` |
| `email.opened` | `EmailSend.status = 'opened'` |
| `email.clicked` | `EmailSend.status = 'clicked'` |
| `email.bounced` | flips `EmailLead.isSuppressed=true`, `suppressionReason='bounce'`, mirrors to `UserProfile.emailSuppressed`, `EmailSend.status='bounced'` |
| `email.complained` | same as bounce, `suppressionReason='complaint'` |
| anything else | acknowledged, ignored |

Bounce/complaint feedback loop closes correctly — the next cron tick will skip the suppressed address.

---

## Database

```prisma
model EmailLead {
  id                String     @id @default(cuid())
  email             String     @unique
  preferences       Json       @default("{}")
  source            String?
  isSubscribed      Boolean    @default(true)
  isSuppressed      Boolean    @default(false)
  suppressedAt      DateTime?
  suppressionReason String?     // 'bounce' | 'complaint'
  newsletterOptIn   Boolean    @default(false)
  unsubscribeToken  String     @unique @default(cuid())
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  jobAlerts         JobAlert[]
}

model JobAlert {
  id                  String    @id @default(cuid())
  email               String
  keyword             String?
  location            String?
  // ... criteria fields ...
  isActive            Boolean   @default(false)        // double opt-in gate
  confirmedAt         DateTime?
  confirmationToken   String?   @unique @default(cuid())
  lastSentAt          DateTime?                        // cron dedup
  token               String    @unique @default(cuid())
}

model EmailSend {
  id        String   @id @default(cuid())
  resendId  String?                                    // Resend API email id
  to        String
  subject   String
  emailType String                                     // see inventory above
  status    String   @default("sent")                  // sent → delivered → opened/clicked OR bounced/complained
  metadata  Json?
  createdAt DateTime @default(now())
}

model UserProfile {
  // ... other fields ...
  emailSuppressed   Boolean   @default(false)
  emailSuppressedAt DateTime?
}

model EmployerJob {
  // ... other fields ...
  expiryWarningSentAt DateTime?     // dedup for expiry_warning cron
  notifyOnApplication Boolean   @default(true)
  notifyDigest        String    @default("instant")    // instant | daily | off
}
```

---

## Issue index

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| ~~1~~ | ~~Six routes call `resend.emails.send` directly, bypassing suppression check~~ | ~~**high**~~ | **resolved 2026-04-30** — all five remaining routes refactored to `sendAndLog` with suppression check |
| ~~2~~ | ~~List-Unsubscribe header missing on several marketing/bulk surfaces~~ | ~~**high**~~ | **resolved 2026-04-30** — added to signup, job-confirmation, expiry-warning + all refactored routes |
| ~~3~~ | ~~`lib/email-service-v2.ts` is dead code with one orphan import~~ | ~~medium~~ | **resolved 2026-04-30** — file deleted, comment cleaned up |
| ~~4~~ | ~~Reply-to and "from" addresses drift between v1, v2, and ad-hoc routes~~ | ~~medium~~ | **resolved 2026-04-30** — `EMAIL_REPLY_TO` now read from env, brand config aligned |
| ~~5~~ | ~~Env validation gaps in `lib/env.ts` for email-related vars~~ | ~~medium~~ | **resolved 2026-04-30** — Zod schema entries added for all 5 missing vars |
| ~~6~~ | ~~Email preview HTML files committed/untracked at repo root~~ | ~~low~~ | **resolved 2026-04-30** — `.gitignore` patterns added |
| ~~7~~ | ~~Inconsistent `emailType` naming and thin `metadata` logging~~ | ~~low~~ | **resolved 2026-04-30** — `EmailType` union added, caught 3 drift bugs at compile time |
| ~~8~~ | ~~`email/preferences` route uses `console.error` instead of `logger.error`~~ | ~~low~~ | **resolved 2026-04-30** — swapped both sites |
| ~~9~~ | ~~Webhook re-applies status update once per recipient in multi-recipient payloads~~ | ~~low~~ | **resolved 2026-04-30** — `EmailSend.updateMany` moved outside per-recipient loop |
| ~~10~~ | ~~Drift for the job alert email — production sender and preview catalog still maintain separate copies~~ | ~~medium~~ | **resolved 2026-04-30** — `lib/utils/render-job-card.ts` is the shared renderer, used by both production sites; preview catalog mirrors via best-effort |
| ~~11~~ | ~~Multi-alert user receives N emails when same jobs match all N alerts~~ | ~~high~~ | **resolved 2026-04-30** — `sendJobAlerts` now groups by email |
| ~~12~~ | ~~Apply button overflows email card on mobile (40px past edge)~~ | ~~medium~~ | **resolved 2026-04-30** — `box-sizing:border-box` added |
| ~~13~~ | ~~Hero text clipping at 390px in expiry-warning sender (percentage-width tables)~~ | ~~medium~~ | **resolved 2026-04-30** — fixed-pixel image cell |

---

## Issue details

### 1. Suppression bypass in direct-send routes

**What:** The following routes call `resend.emails.send()` directly instead of going through the `sendAndLog` wrapper, and do **not** call `isEmailSuppressed()` first:

- [`app/api/email-job/route.ts:59`](../app/api/email-job/route.ts#L59)
- [`app/api/auth/send-confirmation/route.ts:93`](../app/api/auth/send-confirmation/route.ts#L93) — manually inserts an `EmailSend` row but bypasses the wrapper
- [`app/api/contact/route.ts:88`](../app/api/contact/route.ts#L88) and `:104` — two sends (support notification + user confirmation)
- [`app/api/salary-guide/route.ts:54`](../app/api/salary-guide/route.ts#L54) — **marketing** email; worst offender
- [`app/api/job-alerts/route.ts:110`](../app/api/job-alerts/route.ts#L110) — alert subscription confirmation
- `app/api/admin/employer-outreach/route.ts` — bulk outreach, not logged at all

**Impact:** Suppressed/bounced addresses still receive these messages. Salary-guide is marketing-classed and goes out without the suppression gate, which violates ISP feedback-loop expectations.

**Resolution:** Route everything through `sendAndLog`, gate with `isEmailSuppressed`, pass an `unsubscribeUrl` for marketing.

---

### 2. Missing List-Unsubscribe headers

**What:** The header is only injected when `sendAndLog` receives an `unsubscribeUrl`. These functions don't pass one:

- `sendSignupWelcomeEmail`
- `sendConfirmationEmail`
- `sendExpiryWarningEmail` (passes `editToken` instead — inconsistent semantic)
- All six direct-send routes from issue 1

**Impact:** Gmail/Yahoo bulk-sender rules require one-click unsubscribe on any "promotional or non-transactional" mail. Borderline-transactional (signup welcome, expiry warning) is the riskiest because volume is high.

**Resolution:** Pass an unsubscribe URL into every send. Transactional surfaces can point at the preferences page rather than a hard suppression toggle.

---

### 3. Dead `email-service-v2.ts`

**What:** [`lib/email-service-v2.ts`](../lib/email-service-v2.ts) (432 lines) duplicates `escapeHtml`, `isEmailSuppressed`, and three sender functions (`sendWelcomeEmail`, `sendSignupWelcomeEmail`, `sendConfirmationEmail`). The only importer is [`/api/cron/purge-inactive-users`](../app/api/cron/purge-inactive-users/route.ts), and that path does not actually send mail.

**Impact:** Two sources of truth for `MARKETING_EMAIL_TYPES`, two reply-to addresses, two suppression checkers — the kind of drift that breeds incidents.

**Resolution:** Delete v2. Remove the orphan import.

---

### 4. Sender / reply-to drift

| Address | Where it appears |
|---|---|
| `support@pmhnphiring.com` | `lib/email-service.ts:50`, `app/api/contact/route.ts:90`, `lib/email-templates-v2.ts:139` |
| `hello@pmhnphiring.com` | `lib/email-service-v2.ts:30`, `app/api/auth/send-confirmation/route.ts:96`, `app/api/email-job/route.ts:54` |
| `noreply@pmhnphiring.com` | env default in `lib/env.ts:25` and `lib/email-service.ts:47` |

`SALARY_GUIDE_URL` defaults to a hardcoded Supabase storage URL in two places.

**Resolution:** Centralize in a `config/brand.ts` (or extend `lib/env.ts`) and reference from one place.

---

### 5. Env validation gaps

[`lib/env.ts`](../lib/env.ts) does not validate:

- `EMAIL_FROM_MARKETING`
- `EMAIL_REPLY_TO`
- `EMAIL_ASSETS_URL`
- `SALARY_GUIDE_URL`
- `RESEND_WEBHOOK_SECRET` — webhook returns 500 at runtime if missing; should fail at startup

**Resolution:** Add to the Zod schema with sensible defaults so misconfiguration is caught on boot.

---

### 6. Email preview HTML at repo root

Untracked files: `_email_preview_1.html`, `test-alert-email.html`, `test-candidate-welcome.html`, `test-employer-welcome.html`. They contain rendered email markup with placeholder data — low risk, but they shouldn't sit in the working tree.

**Resolution:** `.gitignore` entry, or move under `tests/fixtures/email/`.

---

### 7. `emailType` naming and metadata

- Ad-hoc strings drift: `alert_confirm` vs `welcome_alert` vs `welcome_signup` vs `job_alert`. There is no enum or union type for the `emailType` field.
- Most `sendAndLog` calls pass `undefined` for `metadata`. Useful to capture and currently missing: `jobAlertId`, `jobCount`, `criteria`, `jobId`, `applicantId`.

**Resolution:** Define an `EmailType` union in `lib/email-service.ts`, type the `emailType` parameter with it, and pass relevant `metadata` from each caller.

---

### 8. `console.error` in preferences route

[`app/api/email/preferences/route.ts`](../app/api/email/preferences/route.ts) uses `console.error` at lines 63 and 139 instead of the project `logger.error`. Production logs lose structured context.

**Resolution:** Swap for `logger.error(message, error, { ...context })`.

---

### 9. Webhook multi-recipient race

[`app/api/webhooks/resend/route.ts:74-110`](../app/api/webhooks/resend/route.ts#L74) iterates `payload.data.to` and re-runs the same `EmailSend.updateMany({ where: { resendId } })` once per recipient. Today Resend webhooks are single-recipient; if that ever changes, the status update is applied N times redundantly. No correctness issue, just wasted writes.

**Resolution:** Move the `EmailSend` update outside the recipient loop.

---

### 10. Three-way drift for the job alert email

**What:** The job-alert email template still has two parallel implementations after the 2026-04-30 cleanup (was three):

| File | Role | Caller | Status |
|---|---|---|---|
| [`lib/job-alerts-service.ts`](../lib/job-alerts-service.ts) `buildAlertHtml` | **Production sender** | `/api/cron/send-alerts` invokes `sendJobAlerts()` which calls this | active |
| [`app/api/email-preview/v2-templates.ts`](../app/api/email-preview/v2-templates.ts) `job-alert` template | Admin preview | `/api/email-preview` | active |
| ~~`lib/email-service.ts` `sendJobAlertEmail`~~ | ~~Orphan helper, no caller~~ | ~~none~~ | **deleted 2026-04-30** |

When a layout/copy change comes in (e.g. "move salary under title", "add Featured badge", "change apply button styling"), it currently has to be applied in **both remaining places** to stay consistent. The 2026-04-30 fixes were applied to both by hand.

**Impact:** Future changes risk drift between what the admin previews and what real recipients see.

**Resolution path:**

1. ~~**Short-term:** delete the orphan `sendJobAlertEmail` from `lib/email-service.ts`.~~ ✓ done 2026-04-30.
2. **Medium-term:** extract the actual production renderer (`buildAlertHtml`) into a pure function with a typed `JobAlertProps` input, then have the preview catalog import that exact function. This removes the last duplicate and eliminates parity drift.
3. **Long-term (audit issue 7 cousin):** apply the same flatten-into-shared-renderer pattern to *every* sender so production = preview by construction. Currently many senders inline their HTML.

---

## Recommended fix order

1. **Issue 1 + 2 together** — refactor the six direct-send routes to use `sendAndLog`, add suppression check + List-Unsubscribe. Single PR. Closes the deliverability gap.
2. **Issue 3** — delete `email-service-v2.ts`, fix the one import. Trivial cleanup.
3. **Issue 10 step 1** — delete orphan `sendJobAlertEmail`. Pairs naturally with issue 3.
4. **Issue 4 + 5** — consolidate addresses into validated env vars. One small PR.
5. **Issue 6** — `.gitignore` entry.
6. **Issue 10 step 2** — extract `buildAlertHtml` so preview imports the production renderer.
7. **Issue 7** — `EmailType` union + metadata pass-through. Worth doing alongside any future analytics work.
8. **Issues 8 + 9** — minor cleanup, can be batched.

---

## What's working well

- Centralized `sendAndLog` wrapper handles HTML→text, headers, logging in one place — when used.
- Clear transactional/marketing split with separate sender domains.
- Resend webhook properly verifies Svix signatures and closes the bounce/complaint feedback loop.
- Job alerts use real double opt-in (`confirmationToken` + `confirmedAt` + `isActive`).
- Job alert matching logic is sound: case-insensitive title/employer keyword match, smart state-code/city location resolution, inclusive Remote/Hybrid mode matching, salary range overlap that includes jobs with no salary data, `isFeatured DESC, createdAt DESC` ordering ([`lib/job-alerts-service.ts:271-382`](../lib/job-alerts-service.ts#L271)).
- Job alert per-email dedup (added 2026-04-30) — multi-alert users get one consolidated email, not N.
- All six email-sending crons go through the wrapper and respect suppression.
- Saved-job reminder has a 7-day per-recipient dedup via `lastSavedJobReminderAt`.
- `EmailSend` table is properly indexed on `to`, `emailType`, `status`, `createdAt desc` for analytics queries.
- Apply CTA in job alert email mirrors the on-site `ApplyButton.tsx` — same gradient, same dynamic label (`⚡ Easy Apply` / `Direct Apply` / `Apply Now ↗`).
- Email shell is mobile-aware: 620px-breakpoint media query collapses to single-column, `box-sizing:border-box` on buttons prevents overflow at 390px.
- Admin email preview UI (`/api/email-preview?all=1`) renders all 21 templates with mobile/desktop viewport toggle and exempts itself from middleware CSP via path prefix check.
