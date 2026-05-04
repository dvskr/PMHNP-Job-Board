# PMHNP Pricing System — Architecture & Operations

**Last verified:** 2026-05-01
**Source of truth:** [lib/config.ts](../lib/config.ts) + [prisma/schema.prisma](../prisma/schema.prisma)
**Companion doc:** [pricing-audit.md](./pricing-audit.md) (historical change log + open items)

This document describes the live state of the pricing system after the 2026-04-30 / 2026-05-01 audit work. It's the ground-truth reference; the audit doc is the changelog of how we got here.

---

## 1. Pricing model

**Single tier. One product. Transactional.**

| Item | Value | Source |
|---|---|---|
| Free posts per email domain (lifetime) | 2 | `config.freePostsPerEmail` |
| Paid post price | $199 | `config.postingPrice` |
| Renewal price | $179 (10% off) | `config.renewalPrice` |
| Listing duration | 60 days | `config.durationDays` |
| Featured badge | Always on | `config.isFeatured` |
| Candidate unlocks per posting | 25 | `config.limits.candidateUnlocksPerPosting` |
| InMails per posting | 25 | `config.limits.inmailsPerPosting` |

**Not in scope today** (deferred — see §11): subscriptions, bulk packs, boost SKU, tax, PO/invoice, per-org verification.

---

## 2. End-to-end flows

### 2a. Free post (first 2 per domain, lifetime)

```
Employer signs up → /post-job → /post-job/preview → POST /api/jobs/post-free
  ├─ Auth required (must be role='employer')
  ├─ FREE_EMAIL_DOMAINS check on signup email (gmail/yahoo/etc → 400)
  ├─ Quota check (Serializable txn): COUNT WHERE quotaDomain=<signupDomain> AND paymentStatus='free'
  │    ├─ <2 → continue
  │    └─ ≥2 → 403 with requiresPayment=true → frontend redirects to /post-job/checkout
  ├─ Duplicate-active-job check (same title+location)
  ├─ Atomic transaction (Serializable):
  │    ├─ Job.create (isPublished=true, expiresAt=now+60d)
  │    ├─ Job.update (slug)
  │    └─ EmployerJob.create (quotaDomain=<signupDomain>, paymentStatus='free', userId)
  ├─ sendConfirmationEmail (with feature breakdown)
  ├─ Cleanup JobDrafts
  ├─ pingAllSearchEngines (production only, fire-and-forget)
  └─ 200 → frontend redirects to /success?free=true
```

### 2b. Paid post (after free quota)

```
Frontend → /post-job/checkout → POST /api/create-checkout
  ├─ Lazy Stripe client (503 if STRIPE_SECRET_KEY missing)
  ├─ Validate + sanitize fields
  ├─ Duplicate-active-job check
  ├─ Atomic transaction:
  │    ├─ Job.create (isPublished=false ← will flip on webhook)
  │    ├─ Job.update (slug)
  │    └─ EmployerJob.create (paymentStatus='pending', pricingTier='pro')
  ├─ Stripe Checkout Session created (metadata: jobId, pricing='pro', dashboardToken)
  ├─ trackBeginCheckout client-side analytics (P7)
  └─ 200 → frontend redirects to Stripe-hosted checkout

  [user pays on Stripe]

Stripe → POST /api/webhooks/stripe (checkout.session.completed)
  ├─ Verify signature
  ├─ Idempotency: INSERT processed_stripe_events; UNIQUE violation → 200 with deduped=true
  ├─ Branch on metadata.type:
  │    └─ default (new post):
  │         ├─ Job.update (isPublished=true, isVerifiedEmployer=true)
  │         ├─ EmployerJob.update (paymentStatus='paid', pricingTier='pro')
  │         ├─ JobCharge.create (amountCents from session, type='new')  ← invoice ledger
  │         ├─ sendConfirmationEmail
  │         ├─ Cleanup JobDrafts
  │         ├─ pingAllSearchEngines
  │         └─ trackServerPurchase (GA4 Measurement Protocol — P7)
  └─ 200

Stripe redirect → /success?session_id=cs_...
  ├─ GET /api/verify-checkout-session?session_id=...
  │    ├─ Stripe.checkout.sessions.retrieve
  │    ├─ Reject if payment_status != 'paid' (402)
  │    ├─ Reject if metadata.type='renewal' (wrong endpoint, 400)
  │    ├─ Lookup EmployerJob by jobId
  │    │    ├─ Found + paid → 200 with jobTitle, jobSlug, dashboardToken
  │    │    └─ Not found → 202 (webhook hasn't processed yet — frontend retries every 2s for ~12s)
  │    └─
  └─ Renders "Payment Successful!" only after server-side verification confirms paid
```

### 2c. Renewal ($179)

```
Employer dashboard / edit-token page → renewal modal
  ├─ If paymentStatus='free' → modal shows "This free post can't be renewed" + CTA to /post-job
  └─ If paymentStatus='paid' → modal shows $179 renewal CTA → handleRenewCheckout

POST /api/create-renewal-checkout
  ├─ Lazy Stripe client
  ├─ Verify editToken matches the EmployerJob row
  ├─ Block if paymentStatus='pending' (409 — must complete original checkout first)
  ├─ Block if paymentStatus='free' (409 — defense-in-depth; UI already prevents this)
  ├─ Stripe Checkout Session (metadata: jobId, type='renewal', tier='pro')
  └─ 200 → redirect to Stripe

Stripe → webhook (type='renewal' branch)
  ├─ Idempotency check (same as above)
  ├─ Calculate new expiry from MAX(existingExpiresAt, now) + 60d
  │    └─ Audit #22: early renewers don't lose remaining days
  ├─ Job.update (expiresAt, isPublished=true, isFeatured=true)
  ├─ Lookup EmployerJob — return 500 loudly if missing (audit #8)
  ├─ EmployerJob.update (paymentStatus='paid', pricingTier='pro')
  ├─ JobCharge.create (amountCents=17900, type='renewal') — invoice ledger
  ├─ sendRenewalConfirmationEmail (with $179 receipt + fresh credits messaging)
  ├─ pingAllSearchEngines
  └─ trackServerPurchase (P7, value=179)

Stripe redirect → /employer/renewal-success
  └─ GET /api/verify-renewal-session
       └─ Renders "Featured placement re-activated" + dashboard CTA
```

### 2d. Expiry (no money flow, but visible UX)

```
Cron → sendExpiryWarningEmail (~7 days before expiresAt)
  └─ Email shows: $179 renewal CTA + "renewing early doesn't lose days" + "candidates you've unlocked stay accessible"

Posting reaches expiresAt:
  ├─ Job.expiresAt is in the past
  ├─ Job stays in DB but excluded from `getEmployerActivePostings` queries
  ├─ Employer can no longer:
  │    ├─ Unlock NEW candidates (canUnlockCandidate denies)
  │    └─ Start NEW conversations (canSendInMail denies)
  ├─ Employer CAN still:
  │    ├─ See contact info / resume / LinkedIn for previously-unlocked candidates (hasFullAccess via existingView)
  │    ├─ See Layer 2 metadata (certs, license, salary range) on previously-unlocked candidates
  │    └─ Reply to existing conversations (free, unbounded)
  └─ Renewal flow available at $179 (locked to paid posts only — free posts must repost)
```

---

## 3. Architecture map

### 3a. Source-of-truth files

| Concern | File |
|---|---|
| Pricing values + helper functions | [lib/config.ts](../lib/config.ts) |
| Quota / unlock / InMail gates | [lib/tier-limits.ts](../lib/tier-limits.ts) |
| Email-change policy (helper, not yet wired) | [lib/auth/email-change-policy.ts](../lib/auth/email-change-policy.ts) |
| Email templates | [lib/email-service.ts](../lib/email-service.ts) (uses [lib/email-templates-v2.ts](../lib/email-templates-v2.ts)) |
| Client-side analytics events | [lib/analytics.ts](../lib/analytics.ts) |
| Server-side purchase events | [lib/analytics-server.ts](../lib/analytics-server.ts) |

### 3b. API routes (pricing-related)

| Route | Method | Purpose |
|---|---|---|
| `/api/jobs/post-free` | POST | Free post creation; gate-checked + atomic; sets quotaDomain |
| `/api/create-checkout` | POST | Paid post → Stripe Checkout |
| `/api/create-renewal-checkout` | POST | Renewal → Stripe Checkout (blocks free/pending) |
| `/api/verify-checkout-session` | GET | Server-side Stripe verification for `/success` page |
| `/api/verify-renewal-session` | GET | Server-side verification for `/employer/renewal-success` |
| `/api/webhooks/stripe` | POST | Stripe → publish job, write JobCharge, send emails, fire purchase event |
| `/api/employer/invoice` | GET | PDF invoice from JobCharge ledger (audit #2) |
| `/api/employer/usage` | GET | Per-posting credit usage for dashboard |
| `/api/jobs/update` | POST/DELETE | Job edit / unpublish (no longer blocks contactEmail edit — quotaDomain anchor handles it) |

### 3c. UI surfaces (pricing-related)

| Surface | Reads from |
|---|---|
| [/pricing](../app/pricing/page.tsx) | `config.*` for all numbers + 9 FAQs |
| [/post-job](../app/post-job/page.tsx) | `config.*` for feature pills |
| [/post-job/preview](../app/post-job/preview/page.tsx) | `config.*` |
| [/post-job/checkout](../app/post-job/checkout/page.tsx) | `config.*` for order summary |
| [/for-employers](../app/for-employers/page.tsx) | `config.*` for comparison table |
| [/faq](../app/faq/page.tsx) | `config.*` for employer FAQs |
| [/employer/dashboard](../app/employer/dashboard/page.tsx) | Reads `paymentStatus` to branch the renewal modal |
| [/employer/renewal-success](../app/employer/renewal-success/page.tsx) | Hardcoded 60d (matches `config.durationDays`) |
| [/jobs/edit/[token]](../app/jobs/edit/%5Btoken%5D/page.tsx) | `config.*` + branches renewal modal on `paymentStatus` |
| [/success](../app/success/page.tsx) | Calls `/api/verify-checkout-session`; retries up to 6× on webhook lag |

---

## 4. Database schema (pricing-related fields)

### 4a. EmployerJob

```prisma
model EmployerJob {
  id              String    @id @default(uuid())
  contactEmail    String    // Form-submitted contact (mutable; no quota implication)
  jobId           String    @unique
  editToken       String    @unique
  dashboardToken  String    @unique @default(cuid())
  paymentStatus   String    // 'free' | 'pending' | 'paid' | (legacy: 'free_renewed', 'free_upgraded')
  pricingTier     String    @default("pro")  // collapsed to single value 2026-04-30
  userId          String?   // Supabase auth id; nullable on account deletion
  quotaDomain     String?   // ★ Immutable freebie quota anchor — set ONLY at row creation
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  ...
  @@index([userId])
  @@index([editToken])
  @@index([contactEmail])
  @@index([dashboardToken])
  @@index([quotaDomain, paymentStatus])  // freebie quota count
}
```

**Key invariant:** `quotaDomain` is written exactly once (by `/api/jobs/post-free` at creation). No update path may write it. The free-post quota count reads only this field.

### 4b. ProcessedStripeEvent (idempotency)

```prisma
model ProcessedStripeEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique  // ← idempotency key (Stripe event.id)
  eventType   String
  processedAt DateTime @default(now())
}
```

Webhook inserts BEFORE processing; on UNIQUE violation, returns 200 + `deduped=true`.

### 4c. JobCharge (per-charge invoice ledger)

```prisma
model JobCharge {
  id              String   @id @default(uuid())
  employerJobId   String
  stripeSessionId String   @unique
  amountCents     Int
  currency        String   @default("usd")
  type            String   // 'new' | 'renewal'
  createdAt       DateTime @default(now())
}
```

One row per Stripe checkout. Invoices generated from this ledger so amount matches what Stripe billed (was previously broken — always showed $199).

### 4d. Other relevant fields

- `Job.expiresAt DateTime?` — drives "active posting" definition
- `Job.isFeatured Boolean @default(false)` — set true at creation for all posts
- `Job.isPublished Boolean @default(false)` — flipped to true after payment confirms

---

## 5. Feature inventory

### 5a. Employer features (what they get)

| Feature | When they have it |
|---|---|
| Post a job (free) | First 2 per domain, lifetime |
| Post a job (paid, $199) | Always available |
| 60-day listing | Every post |
| Featured badge + top placement | Every post |
| 25 candidate unlocks | Per active posting |
| 25 InMails (new conversations) | Per active posting |
| Reply to existing conversations | Always free |
| View previously-unlocked candidates' contact info | Lifetime (audit #21) |
| Renew posting at $179 (10% off) | Paid posts only; free posts must repost |
| Edit posting | Anytime (contactEmail freely editable now) |
| Analytics (per-job + time-series) | Active posting required (audit #M2 gate) |
| CSV analytics export | Admin-only |
| Invoice PDF | Per JobCharge — accurate to actual amount paid |

### 5b. System features (what we built)

| Feature | Implementation |
|---|---|
| Webhook idempotency | `ProcessedStripeEvent` + INSERT-then-process |
| Per-charge invoice ledger | `JobCharge` writes on every webhook payment |
| Server-side purchase tracking | GA4 Measurement Protocol (`lib/analytics-server.ts`) |
| Client-side funnel events | `view_post_job_page`, `begin_checkout`, `submit_free_post`, `free_post_limit_hit` |
| Atomic post creation | `prisma.$transaction({ isolationLevel: 'Serializable' })` |
| Lazy Stripe client | All 5 routes — graceful 503 if keys missing |
| Stripe session verification | `/api/verify-checkout-session` + `/api/verify-renewal-session` |
| Quota anchor | Immutable `EmployerJob.quotaDomain` field |

---

## 6. Gates & entitlements

There are **three distinct gates** in the system, each answering a different question:

### 6a. `isAdmin` — admin-only fields

```ts
const isAdmin = profile.role === 'admin'
```

Gates: candidate `bio`, `preferredJobType`, full last name, CSV export of analytics. Used in candidate-list, candidate-detail, saved-candidates, candidates-search, analytics-csv.

### 6b. `hasActivePosting` — list-level metadata visibility

```ts
const hasActivePosting = isAdmin
  ? true
  : (await getEmployerActivePostings(user.id)).length > 0
```

Gates: Layer 2 fields (certifications, license states, salary range, hasResume, availableDate) on **list** endpoints (browse + saved + search). The "shopping" experience requires an active posting.

### 6c. `hasFullAccess` — per-candidate detail visibility

```ts
const hasFullAccess =
  isAdmin || !!existingView || await hasActiveFeaturedPost(user.id)
```

Gates: contact email, resume signed URL, LinkedIn URL, AND Layer 2 metadata on the **detail** endpoint. Lifetime once unlocked — previously-unlocked candidates retain access even after posting expires (audit #21).

### 6d. Quota gates (consumption)

| Gate | Function | Limit |
|---|---|---|
| Unlock new candidate | `canUnlockCandidate(userId, tier)` | 25 per active posting |
| Start new conversation (InMail) | `canSendInMail(senderId, employerId, tier)` | 25 per active posting |
| Free post creation | inline count in `/api/jobs/post-free` | 2 per `quotaDomain`, lifetime |

---

## 7. Closed loopholes

| # | Loophole | Closed by |
|---|---|---|
| #1 | `/success` page didn't verify Stripe — fake URL = fake success message | Server-side `verify-checkout-session` route + retry on webhook lag |
| #2 | Invoice always showed $199 (even for $179 renewals) | `JobCharge` ledger; invoice reads actual amount from charge row |
| #3 | Webhook had no idempotency — Stripe retries = duplicate emails + state writes | `ProcessedStripeEvent` table + INSERT-then-process |
| #6 | Free-post gate had race condition (parallel submissions both passed) | Serializable transaction + re-check inside |
| #7 | Job + slug + EmployerJob inserts not atomic — partial failure = orphan rows | All wrapped in `prisma.$transaction` |
| #8 | Renewal webhook silently half-completed when EmployerJob missing | Returns 500 loudly with logging |
| #11 | Renewal flow accepted free / pending posts → snuck past free quota | 409 block; UI also branches via popup (#24) |
| #12 | Hardcoded prices in 7+ surfaces would lie if config changed | All config-driven via `config.*` references |
| #13 | `canUnlockCandidate` counted views from expired postings against current cap | Filter to active postings + legacy null only |
| #15 | Dead upgrade routes + page lingering from old tier model | All deleted |
| #17 | `PricingTier = 'starter' \| 'growth' \| 'premium'` was a fiction | Narrowed to `'pro'`; DB rows migrated |
| #21 | Layer 4 strip — already-unlocked candidates lost metadata after expiry | All unlock-only fields gate on `hasFullAccess`, not `tier` |
| #22 | Early renewals lost the days remaining on the original posting | Webhook now extends from MAX(existingExpiresAt, now) |
| #23 | Editable `contactEmail` shifted the freebie count | Quota anchored on immutable `quotaDomain`, not contactEmail |
| #24 | Free-post renewal showed silent 409 with no UX explanation | Branched modal with friendly popup + CTA to repost |
| #26 | Form-submitted `contactEmail` was the freebie count anchor — rotation = infinite freebies | Quota anchored on signup-derived `quotaDomain` (immutable per-row) |

---

## 8. Known open loopholes (deferred — not closed)

| # | Loophole | Why deferred | Mitigation in place |
|---|---|---|---|
| **Shell domains** | Buy 25 cheap domains @ $12 each, sign up with each, get 50 freebies | Domain registration is free-form; no public registry distinguishes "real company" from "registered yesterday" | Free email providers (gmail/yahoo/etc) blocked. Per-org verification (audit-doc deferred item) is the real fix |
| **#25 Admin hard-delete** | `/api/admin/jobs/[id]` cascade-deletes EmployerJob → freebie count drops | Internal-only attack vector; admins are trusted; audit logs mitigate | Audit #25 tracks soft-delete remediation |
| **#27 Email-domain change** | Authenticated user changes their email domain → future freebies attribute to new domain | No user-facing email-change endpoint exists today | `evaluateEmailChange` helper landed at [lib/auth/email-change-policy.ts](../lib/auth/email-change-policy.ts); enforces same-domain rule when invoked. Whoever adds the email-change endpoint MUST call this helper |

### Loopholes considered and confirmed NOT loopholes

| Scenario | Why it's safe |
|---|---|
| Account self-deletion + soft-delete | `EmployerJob.userId` becomes null on delete, but `quotaDomain` and `contactEmail` persist. Count unaffected. |
| Unpublish own job (`DELETE /api/jobs/update`) | Sets `isPublished=false`. Row stays. Count unaffected. |
| Edit job content (title/description/salary) | Doesn't touch `quotaDomain`, `paymentStatus`, or `userId`. |
| Edit `contactEmail` after posting | Per audit #26, count anchored on `quotaDomain` not `contactEmail`. Edits are now allowed and have no quota effect. |
| Attempt to mutate `paymentStatus` directly | No customer-facing path writes this field. Webhook (paid) and `post-free` (free) are the only writers. |

---

## 9. Operational runbook

### 9a. Production migrations applied (2026-04-30 / 2026-05-01)

| Migration | What it did |
|---|---|
| `20260430_normalize_pricing_tier_to_pro` | Backfilled all `pricing_tier` legacy values → 'pro'; changed column default |
| `20260430_add_processed_stripe_events` | Added idempotency table |
| `20260430_add_job_charges` | Added per-charge invoice ledger |
| `20260501_add_quota_domain` | Added immutable freebie quota anchor field; backfilled from contact_email |

All applied via `npx prisma migrate deploy` against production Supabase.

### 9b. Production Stripe checklist (do once)

- [ ] Verify webhook endpoint at `https://pmhnphiring.com/api/webhooks/stripe` is registered
- [ ] Verify `STRIPE_WEBHOOK_SECRET` in Vercel matches Dashboard signing secret
- [ ] Verify event filter includes `checkout.session.completed`
- [ ] Verify Stripe Dashboard → Settings → Public details: business name, statement descriptor, support email/URL
- [ ] Verify Stripe Dashboard → Settings → Branding: logo + brand color
- [ ] Verify Stripe Dashboard → Settings → Customer emails: "Successful payments" ON, "Failed payments" ON
- [ ] (Optional but recommended) Set `GA_MEASUREMENT_ID` + `GA_API_SECRET` env vars in production for server-side `purchase` events

### 9c. Things to monitor

| Signal | What it means |
|---|---|
| `processed_stripe_events` count vs Stripe Dashboard event count | Big divergence = webhook drops |
| `job_charges` rows where `amount_cents ∉ {19900, 17900}` | Coupon used or manual price override — sanity check |
| 5xx error rate on `/api/webhooks/stripe` | Should be ~0 with idempotency |
| Free-post 403 rate (`free_post_limit_hit` analytics event) | Demand signal for paid conversion |
| Renewal rate 30/60/90 days post-renewal-price change | Watch for behavior shift after $159→$179 |
| `processed_stripe_events` table size after 12+ months | Will grow unbounded; plan partition or quarterly cleanup |

### 9d. Operational rules cheat-sheet

- Renew price = $179. Discount % computed: `Math.round((1 - renewal/posting) * 100) = 10%`.
- Free quota counted on `EmployerJob.quotaDomain`, immutable, set at posting time from signup email's domain.
- Renewal extends from `MAX(existingExpiresAt, now)` — early renewers don't lose days.
- Free posts cannot be renewed. They must be reposted at $199.
- Pending posts (abandoned checkouts) cannot be renewed.
- Webhook idempotency keyed on `event.id`. Stripe retries are safe.
- Server-side `purchase` event fires from webhook (the only authoritative payment-completion signal).

---

## 10. Test coverage

### 10a. Unit tests (Vitest)

[tests/lib/tier-limits.test.ts](../tests/lib/tier-limits.test.ts) — 17/17 passing

- `getEmployerTier` — fallback returns 'pro'
- `getEmployerActivePostings` — query shape correct
- `getEmployerActivePosting` — newest-first selection
- `canUnlockCandidate` — denied with no postings; allowed with capacity; cap enforcement; legacy redistribution; audit #13 historical-views fix
- `canSendInMail` — denied with no postings; per-job count; reply exemption (no count call for replies)
- `getUsageSummary` — limits scale across multiple postings

### 10b. Coverage gaps (deferred per audit #20)

- No tests for `/api/jobs/post-free` (free quota gate, atomic transaction)
- No tests for `/api/create-checkout` or `/api/create-renewal-checkout`
- No tests for webhook idempotency / event handling
- No tests for `JobCharge` ledger writes
- No tests for `evaluateEmailChange` policy

These are tracked in audit #20 as foundational follow-up work.

---

## 11. Future-state items (intentionally deferred)

| ID | Item | When to revisit |
|---|---|---|
| #14 | Stripe Product / Price catalog (proper Price IDs) | When adding Stripe Tax or international currency |
| P1 | Test $249 instead of $199 | After 4–6 weeks of P7 baseline data |
| P2 | Self-serve bulk packs (5-pack at $849, 10-pack at $1,499) | Highest revenue-per-dev-day on the roadmap; 5.5 dev-days estimated. Spec in pricing-audit.md §P2. |
| P4 | Boost / Spotlight upsell SKU at $49 | Adds upsell vector beyond base $199 |
| P5 | Stripe Tax + PO/invoice path for enterprise | Blocker for hospital systems / large staffing firms |
| P6 | Annual prepay deal | Manual via Stripe Invoicing today; productize at 5+ deals |
| Per-org verification | NPI lookup / DNS TXT / manual review | Closes shell-domain attack; needed at scale |
| Email-change endpoint | UI + endpoint that calls `evaluateEmailChange` | When user demand surfaces; helper is ready |
| Audit #20 | Webhook + checkout integration tests | Before next major refactor |
| Audit #25 | Soft-delete for admin job-delete | When you want to harden internal-only loopholes |

---

## 12. Quick-reference flow diagrams

### Post a job
```
Free?                                      Paid?
  ↓                                          ↓
authenticated employer                  authenticated employer
  ↓                                          ↓
quota check (per quotaDomain)           Stripe Checkout
  ↓ ok                                       ↓ pay
atomic txn (Job + slug + EmployerJob)   webhook fires
  ↓                                          ↓
isPublished=true immediately            JobCharge insert
  ↓                                       Job.isPublished=true
sendConfirmationEmail                     EmployerJob.paymentStatus='paid'
  ↓                                          ↓
/success?free=true                      sendConfirmationEmail
                                            ↓
                                        /success?session_id=...
                                            ↓
                                        verify-checkout-session
                                            ↓
                                        "Payment Successful!"
```

### Renew a job
```
employer dashboard "Renew" button
  ↓
Free post?  → popup: "can't renew, post new" → /post-job
Paid post?  → modal: "Renew $179" → /api/create-renewal-checkout
                                         ↓
                                       Stripe Checkout
                                         ↓ pay
                                       webhook (type='renewal')
                                         ↓
                                       expiresAt = MAX(existing, now) + 60d
                                         ↓
                                       JobCharge type='renewal' amount=17900
                                         ↓
                                       sendRenewalConfirmationEmail
                                         ↓
                                       /employer/renewal-success
```

---

## Appendix: glossary

| Term | Meaning in this codebase |
|---|---|
| **Active posting** | `Job.isPublished=true AND (expiresAt IS NULL OR expiresAt > now)` AND linked via EmployerJob to a userId |
| **quotaDomain** | Immutable per-row snapshot of the signup email's domain at posting time. The freebie quota's anchor. |
| **hasFullAccess** | Per-candidate gate: `isAdmin OR existingView OR hasActiveFeaturedPost(employerId)`. Lifetime once granted. |
| **hasActivePosting** | Employer-level gate: at least one currently-active posting exists. State, not plan. |
| **`paymentStatus`** | `'free'` / `'pending'` / `'paid'` / (legacy: `'free_renewed'`, `'free_upgraded'`). Drives invoice eligibility, renewal eligibility, and freebie quota filter. |
| **`pricingTier`** | Always `'pro'` for new rows; legacy values exist on old rows but read paths now ignore the value. Vestigial. |
| **JobCharge** | One row per Stripe checkout (new or renewal). Source of truth for invoices. |
| **ProcessedStripeEvent** | Idempotency log. Insert-then-process; UNIQUE violation = already-handled. |
