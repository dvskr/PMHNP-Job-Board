# Pricing Audit — PMHNP Job Board

**Date:** 2026-04-30
**Scope:** End-to-end review of pricing structure (config, Stripe integration, checkout, webhook, entitlements, UI, env, tests)
**Pricing model:** Single-tier — first 2 free posts per email domain, $199/post, $159 renewal (20% off), 60-day duration, 25 candidate unlocks + 25 InMails per posting. Source of truth: [lib/config.ts](../lib/config.ts).

Status legend: `[ ]` open · `[x]` done · `[~]` in progress · `[-]` won't fix

---

## CRITICAL — broken or not wired

### [x] 1. `/success` page never verifies the Stripe session — **DONE 2026-04-30**
**File:** [app/success/page.tsx:9-25](../app/success/page.tsx)
**Problem:** Renders "Payment Successful!" purely based on the *presence* of `session_id` in the URL — no fetch to Stripe, no DB check that `paymentStatus = 'paid'`. If the webhook is delayed/dropped/fails (see #3), the buyer sees success while the job sits unpublished in `paymentStatus = 'pending'` forever. `config` is also imported but unused.
**Fix:** Mirror [app/employer/renewal-success/page.tsx](../app/employer/renewal-success/page.tsx) — call a `/api/verify-checkout-session` route that retrieves the session from Stripe and confirms `payment_status === 'paid'` before showing success.

### [x] 2. Invoice route charges wrong amount for renewals — **DONE 2026-04-30**
**File:** [app/api/employer/invoice/route.ts:94-95](../app/api/employer/invoice/route.ts)
**Problem:** Always uses `config.getStripePriceInCents(tier)` = 19900 ($199). A renewed posting was charged 15900 ($159), but the invoice prints $199. Only ever **one** invoice per `EmployerJob` row, even after multiple renewals — no per-charge audit trail.
**Fix:** Persist a `JobCharge`/`Payment` table with `(employerJobId, stripeSessionId, amountCents, type: 'new'|'renewal', createdAt)`, generate invoices from that ledger. Interim: read actual paid amount from the Stripe session.

### [x] 3. Webhook has no idempotency — **DONE 2026-04-30**
**File:** [app/api/webhooks/stripe/route.ts](../app/api/webhooks/stripe/route.ts)
**Problem:** Does not record `event.id` and check before processing. Stripe redelivers `checkout.session.completed` on transient failures or manual replays — duplicate confirmation emails and duplicate `pricingTier`/`paymentStatus` writes follow.
**Fix:** Add a `ProcessedStripeEvent` table keyed on `eventId`, insert-then-process inside a transaction; on unique-violation, return 200 and skip.

### [x] 4. `ENABLE_PAID_POSTING` flag is dead code — **DONE 2026-04-30**
**Files:** [lib/env.ts:33](../lib/env.ts), [lib/env.ts:110-114](../lib/env.ts)
**Problem:** Declared and exposed via `isFeatureEnabled('paidPosting')`, but referenced **only inside `lib/env.ts` itself** — no route checks it. Implies a kill switch that doesn't exist.
**Fix:** Either gate [app/api/create-checkout/route.ts:34](../app/api/create-checkout/route.ts) with it (returning 503 when off), or delete the flag.

### [x] 5. Renewal-success page shows stale tier-specific copy — **DONE 2026-04-30**
**File:** [app/employer/renewal-success/page.tsx:107, 132-137](../app/employer/renewal-success/page.tsx)
**Problem:**
```ts
const daysExtended = renewalData.tier === 'premium' ? 90 : renewalData.tier === 'growth' ? 60 : 30;
```
In single-tier mode, all renewals extend `config.durationDays` (60). A legacy posting renewed with `tier='starter'` (the DB default — see #9) is told "30 days" while actually getting 60. Lines 132-137 also render "Premium placement activated!" — a tier that no longer exists.
**Fix:** Drop the ternary, use `config.durationDays`, remove the tier-specific badge.
**Outcome (2026-04-30):** Resolved as part of the tier cleanup pass (audit #16/#17). `daysExtended` is now hardcoded to `60` (matches `config.durationDays`); tier-conditional "Premium/Growth placement activated!" replaced with a single "Featured placement re-activated" line. No longer references legacy tier values.

### [x] 6. Race conditions on free-post gate and duplicate check — **DONE 2026-04-30**
**Files:** [app/api/jobs/post-free/route.ts:192-218](../app/api/jobs/post-free/route.ts), [app/api/create-checkout/route.ts:99-133](../app/api/create-checkout/route.ts)
**Problem:** Both routes read-then-write with no DB constraint. Two parallel requests can both pass the gate — outcomes: a domain ends up with 3 free posts, or two identical active listings. No unique index on `(contactEmail, jobTitle, location, isPublished)` and no row lock.
**Fix:** Wrap creation in a transaction with `SELECT ... FOR UPDATE` on the count, or add a partial unique index on active duplicates.

### [x] 7. No transaction wrapping job → slug → employerJob creation — **DONE 2026-04-30**
**Files:** [app/api/jobs/post-free/route.ts:268-331](../app/api/jobs/post-free/route.ts), [app/api/create-checkout/route.ts:155-206](../app/api/create-checkout/route.ts)
**Problem:** Three sequential `prisma` writes. If the second or third call fails, you orphan a `Job` with no `EmployerJob` — that job has no edit token, no dashboard token, no contact email, and the employer cannot recover it.
**Fix:** Use `prisma.$transaction([...])`.

---

## HIGH — wired but with broken edges

### [x] 8. Renewal webhook half-completes when EmployerJob is missing — **DONE 2026-04-30**
**File:** [app/api/webhooks/stripe/route.ts:59-104](../app/api/webhooks/stripe/route.ts)
**Problem:** `prisma.job.update` always runs, but the `employerJob` lookup at L70-72 is `findFirst` with no error handling. If it returns null, the job is silently extended and republished but no payment status is written and no confirmation email sent. Logged as success.
**Fix:** Throw or return 500 if `employerJob` is null; log loudly so it surfaces.

### [x] 9. `pricingTier` schema default is `"starter"` but every code path writes `"growth"` — **DONE 2026-04-30**
**File:** [prisma/schema.prisma:206](../prisma/schema.prisma)
**Problem:** `pricingTier String @default("starter")`. All four code paths that insert (`post-free`, `create-checkout`, both webhook branches) hardcode `"growth"`. Default is a footgun for any future code path or raw SQL insert.
**Fix:** Change the default to `"growth"` (or `"pro"` after the cleanup in #17), or drop the field entirely since the limits no longer differ.
**Outcome (2026-04-30):** Schema updated to `@default("pro")`. Migration file [prisma/migrations/20260430_normalize_pricing_tier_to_pro/migration.sql](../prisma/migrations/20260430_normalize_pricing_tier_to_pro/migration.sql) wraps row backfill + column default change in a single transaction. **Applied to production Supabase 2026-04-30 via `npx prisma migrate deploy`.** All existing `employer_jobs` rows now have `pricing_tier='pro'`; new inserts that omit the field default to `'pro'`.

### [x] 10. Stripe client instantiated at module load with non-null assertion — **DONE 2026-04-30**
**Files:** [app/api/create-checkout/route.ts:11](../app/api/create-checkout/route.ts), [app/api/create-renewal-checkout/route.ts:8](../app/api/create-renewal-checkout/route.ts), [app/api/verify-renewal-session/route.ts:7](../app/api/verify-renewal-session/route.ts), [app/api/webhooks/stripe/route.ts:10](../app/api/webhooks/stripe/route.ts)
**Problem:** All four do `new Stripe(process.env.STRIPE_SECRET_KEY!)` at top level. Meanwhile [lib/env.ts:28-30](../lib/env.ts) declares the keys `optional()`. Mismatch: `getEnv()` allows missing keys, but routes crash on first import in any env where they're missing.
**Fix:** Either mark them required in `envSchema` or move the `new Stripe(...)` inside the handler with a graceful 503.

### [x] 11. Renewal checkout doesn't verify previous payment state — **DONE 2026-04-30**
**File:** [app/api/create-renewal-checkout/route.ts:34-49](../app/api/create-renewal-checkout/route.ts)
**Problem:** Only checks `editToken`. An employer can renew a job whose original was `paymentStatus = 'pending'` (abandoned checkout) or `paymentStatus = 'free'` and the webhook will then write `'paid'` and re-extend it. Functionally OK, but it lets a free post sneak past the 2-free quota by being "renewed" at $159.
**Fix:** Decide product behavior — either explicitly allow (document) or block renewal of `pending`/`free` rows. Consider charging $199 (full price) for free→paid renewal instead of $159.

### [x] 12. Hardcoded prices/durations bypass `lib/config` (silent rot) — **DONE 2026-04-30**
**Files (none read from config):**
- [app/jobs/edit/[token]/page.tsx:605, 610-613](../app/jobs/edit/%5Btoken%5D/page.tsx) — `$159`, `60 more days`, `25 unlocks`, `25 InMails`
- [app/faq/page.tsx:55, 63](../app/faq/page.tsx) — `$199`, `$159`, `60 days`, `20% off` in answer copy
- [app/for-employers/page.tsx:52](../app/for-employers/page.tsx) — `$199` in comparison cell
- [app/pricing/page.tsx:9, 11, 14, 41](../app/pricing/page.tsx) — page metadata title/description/OG hardcode `$199`
- [app/api/admin/employer-outreach/route.ts:38](../app/api/admin/employer-outreach/route.ts) — outreach email body
- [components/employer/EmployerDashboardClient.tsx:799](../components/employer/EmployerDashboardClient.tsx) — `60 more days · Featured · 25 unlocks · 25 InMails`

**Fix:** Replace each hardcoded number with the matching `config.*` reference (or a server-prerendered constant for metadata where dynamic interpolation isn't possible).

### [x] 13. `canUnlockCandidate` global cap counts views from expired postings — **DONE 2026-04-30**
**File:** [lib/tier-limits.ts:117-136, 144-163](../lib/tier-limits.ts)
**Problem:** Counts **every** `profileView` the employer ever made (`viewerId: employerId`), then compares against `totalLimit` = sum of *currently active* postings' caps. An employer with one fresh active posting (limit 25) but 75 historical views from three expired postings is locked at 75/25, even after paying for the new posting. The legacy-views redistribution logic is intricate and has zero test coverage.
**Fix:** Add a filter to count only views from active postings, e.g. `WHERE employerJobId IN (active posting IDs) OR (employerJobId IS NULL AND viewedAt >= oldest active posting createdAt)`.

### [-] 14. No Stripe Product / Price catalog — **DEFERRED-BY-DECISION 2026-05-01**
**Files:** [app/api/create-checkout/route.ts:209-232](../app/api/create-checkout/route.ts), [app/api/create-renewal-checkout/route.ts:63-87](../app/api/create-renewal-checkout/route.ts)
**Problem:** Both routes use inline `price_data: { unit_amount: 19900, ... }`. Consequences: no Stripe Dashboard product catalog, no tax codes, every Stripe report shows a unique product name (`Job Post: <title>`), price changes require code deploy.
**Fix:** Promote to real `Price` IDs in Stripe when you add tax/multi-currency. Acceptable to defer.
**Decision (2026-05-01):** Stay inline. The job-title-as-line-item is genuinely useful on B2B receipts (buyer's accounting team can match to the role); single source of truth in `lib/config.ts`; no test/live Price ID env-var management overhead. Stripe Product catalog stays at 0 active products (5 stale ones archived 2026-05-01). Migrate to Price IDs when ANY of these triggers: enabling Stripe Tax (P5), adding international currency, launching A/B price tests (P1 $249), launching bulk packs (P2), adding promotional coupons.

---

## MEDIUM — dead code & cleanup

### [x] 15. Dead upgrade flow still in tree — **DONE 2026-04-30** (resolved by M3)
**Files:**
- [app/api/create-upgrade-checkout/route.ts](../app/api/create-upgrade-checkout/route.ts) — 410 stub
- [app/api/verify-upgrade-session/route.ts](../app/api/verify-upgrade-session/route.ts) — 410 stub
- [app/employer/upgrade-success/page.tsx](../app/employer/upgrade-success/page.tsx) — still calls `/api/verify-upgrade-session`, UI dead-ends on the 410
- Webhook `else if (type === 'upgrade')` warn-and-exit branch at [webhooks/stripe:121-124](../app/api/webhooks/stripe/route.ts)

**Fix:** Delete all four, or replace the success page with a redirect to `/employer/dashboard`.
**Outcome (2026-04-30):** All four removed via M3.

### [x] 16. Deprecated `lib/config.ts` helpers — **DONE 2026-04-30**
**File:** [lib/config.ts:78-144](../lib/config.ts)
**Problem:** `pricing`, `stripePricing`, `renewalPricing`, `stripeRenewalPricing`, `getUpgradePrice`, `getPricingLabel`, `tierLimits` map. Only `getStripePriceInCents` is still called (from the broken invoice route, #2). Rest is unused.
**Fix:** Remove after #2 is migrated. Shrinks the surface and prevents drift.
**Outcome (2026-04-30):** Removed all deprecated maps (`pricing`, `stripePricing`, `renewalPricing`, `stripeRenewalPricing`), the `tierLimits` legacy map, `getUpgradePrice`, `getPricingLabel`, `getPostingPrice`, `getRenewalPrice`, `getStripeRenewalPriceInCents`. Kept `getStripePriceInCents` because it's still called by [employer/invoice/route.ts:95](../app/api/employer/invoice/route.ts) — will be removed when audit #2 migrates the invoice route to read from the Stripe session. `lib/config.ts` shrunk from 149 to ~67 lines.

### [x] 17. `PricingTier = 'starter' | 'growth' | 'premium'` is a fiction — **DONE 2026-04-30**
**Files:** [lib/config.ts:14](../lib/config.ts), all routes that import `PricingTier`
**Problem:** Every API accepts the legacy union, then immediately overrides to `'growth'`. The model is genuinely single-tier.
**Fix:** Migrate DB rows (`UPDATE employer_jobs SET pricing_tier='pro' WHERE pricing_tier IN ('starter','growth','premium');`), then `type PricingTier = 'pro'`, drop the schema default. Pair with #9 and #16 in one PR.
**Outcome (2026-04-30):** Code-only sweep complete; **DB migration still pending**.
- `PricingTier` union expanded to `'pro' | 'starter' | 'growth' | 'premium'` — `'pro'` is the canonical write value going forward; legacy values retained for read compatibility with existing rows.
- All write paths now write `'pro'` (post-free, create-checkout, create-renewal-checkout).
- All read fallbacks for "no stored value" defaults updated to `'pro'` (webhook ×2, verify-renewal-session, invoice, billing, dashboard page) — except `lib/tier-limits.ts:getEmployerTier` which kept `'starter'` fallback because [analytics/route.ts:84](../app/api/employer/analytics/route.ts) uses `tier === 'starter'` as a soft "no active posting" gate. That's tracked as a separate refactor below.
- All Layer 2 read branches that checked `tier === 'growth' || tier === 'premium'` now also accept `'pro'` (candidates/[id], candidates list, saved-candidates, candidates/search) — preserving access for new rows without breaking legacy rows.
- Frontend types updated: `app/post-job/preview/page.tsx`, `app/post-job/page.tsx`, `app/post-job/checkout/page.tsx`, `app/jobs/edit/[token]/page.tsx`, `components/employer/EmployerDashboardClient.tsx` — type unions narrowed to `'pro'`, default values changed.
- Verified via grep: zero `'growth'` literals remain in `app/`, `components/`, `lib/` (excluding the dead `app/employer/upgrade-success/page.tsx` which is audit #15).

**Still open under #17:**
1. ~~**DB row migration**~~ **DONE 2026-04-30** — applied via `npx prisma migrate deploy`. See #9 outcome and migration M1 below.
2. ~~**Schema default**~~ **DONE 2026-04-30** — schema updated to `@default("pro")` in same migration as item 1.
3. **Admin synthetic tier** — multiple routes use `isAdmin ? 'premium' : ...` to coerce admins to max privileges. Cleaner refactor: plumb `isAdmin` as a separate flag through the response builders. Defer; functional today.
4. **`getEmployerTier` "no active posting" sentinel & analytics gate refactor** — fallback still returns `'starter'` to preserve [analytics/route.ts:84](../app/api/employer/analytics/route.ts) gate behavior. Replace tier-as-gate checks with explicit `getEmployerActivePostings(...).length > 0` checks, then fallback can be `'pro'`. **Tracked as a queued migration step** — see [docs/pricing-audit.md § Queued migrations](#queued-migrations) below.
5. ~~**`lib/social-post-generator.ts` raw SQL**~~ **DONE 2026-04-30** — `premium_posts` CTE removed entirely; query simplified from 4 CTEs to 3. Employer posts (single-tier) flow through `employer_posts` priority 1, no longer split by legacy tier.
6. **`app/api/autofill/*`** — uses `profile?.role === 'premium'` for autofill subscription tiers (different concept from pricing). Left alone.

---

## LOW

### [x] 18. `session.url` not null-checked — **DONE 2026-04-30**
**Files:** [app/api/create-checkout/route.ts:236](../app/api/create-checkout/route.ts), [app/api/create-renewal-checkout/route.ts:91](../app/api/create-renewal-checkout/route.ts)
**Problem:** Returns `session.url` directly; Stripe types it `string | null`.
**Fix:** Add a null guard returning a 500 with a clear error.

### [x] 19. Test Stripe keys present in `.env` — **VERIFIED 2026-04-30** (`.env*` is gitignored; only `.env.example` is tracked)
**Problem:** `pk_test_…` and `sk_test_…` visible in the `.env` file. Test keys aren't a live secret leak, but worth confirming `.env` is gitignored. Prior incident in memory (rotated Supabase password) suggests this has bitten before.
**Fix:** Verify `.gitignore` covers `.env`, `.env.local`, etc. Audit git history if uncertain.

### [x] 20. Zero tests on the entire pricing path — **DONE 2026-05-01**
**Files:** none
**Problem:** No unit tests for [lib/tier-limits.ts](../lib/tier-limits.ts), no integration test for [create-checkout](../app/api/create-checkout/route.ts) or [create-renewal-checkout](../app/api/create-renewal-checkout/route.ts), no webhook signature/idempotency test, no test for the free-post gate, no test for `canUnlockCandidate`. A single bad refactor of #13 silently grants unlimited unlocks.
**Fix:** Start with `lib/tier-limits.test.ts` covering the legacy-views distribution logic *before* touching #13.
**Outcome (2026-05-01):** Pricing-path unit-test coverage landed across the foundational gate logic:
- [tests/lib/tier-limits.test.ts](../tests/lib/tier-limits.test.ts) — 17 tests covering `getEmployerTier`, `getEmployerActivePostings`, `getEmployerActivePosting`, `canUnlockCandidate` (including audit #13's historical-views fix), `canSendInMail`, `getUsageSummary`
- [tests/lib/email-change-policy.test.ts](../tests/lib/email-change-policy.test.ts) — 9 tests covering `evaluateEmailChange` (audit #27): same-domain allowed, invalid emails rejected, domain change blocked when freebies exist, query shape verification
- Total pricing-relevant tests: **26 passing**
- Total project test suite: **306 passing across 23 files**

**Webhook integration testing intentionally deferred to E2E:** Mocking Stripe's signature verification + the multi-branch handler (checkout.session.completed × 2 sub-branches + charge.refunded) is high-effort low-ROI in unit tests. Standard practice is the Stripe CLI E2E flow — `stripe listen --forward-to localhost:3000/api/webhooks/stripe` + run a test card through `/post-job/checkout`, validate DB state. Documented in the Stripe runbook (Section F). Run before any webhook refactor.

### [x] 21. Inconsistent expiry behavior on candidate detail — "Layer 4 fields strip" — **DONE 2026-04-30** (resolved by M4)
**File:** [app/api/employer/candidates/[id]/route.ts:144-201](../app/api/employer/candidates/%5Bid%5D/route.ts)
**Problem:** Two different gates control the candidate detail response and they diverge on posting expiry:
- `hasFullAccess` (uses `existingView` from a previous unlock — lifetime) gates `contactEmail`, `resumeUrl`, `linkedinUrl`. These **persist** after the posting expires.
- `tier` (from `getEmployerTier`, which returns `'starter'` once all postings expire) gates `certifications`, `licenseStates`, `availableDate`, `hasResume`, `salaryRange` (Growth+) and `bio`, `preferredJobType`, full last name (Premium). These **silently disappear** from the response when no active posting exists.

Net effect: an employer who unlocked Alice during their active posting can still see her email and resume after expiry, but her certifications, license states, and salary expectations vanish from the API payload. The frontend renders `undefined` for those keys without explanation.

Also: nothing writes `pricingTier='premium'` anymore, so the Premium branch (`bio`, `preferredJobType`, full last name) is unreachable for any real employer — only admins (forced to `'premium'` at [L78](../app/api/employer/candidates/%5Bid%5D/route.ts#L78)) ever see those fields. Dead code surface.

This contradicts the marketing claim at [pricing/page.tsx:55](../app/pricing/page.tsx#L55): *"Every post gets the exact same features… No downgrades."*

**Fix options (pick one):**
1. **Quick:** change `getEmployerTier` to default to `'growth'` instead of `'starter'` for users who have ever had a posting — removes silent stripping on previously-unlocked candidates.
2. **Cleaner:** delete the tier branches at [L168-194](../app/api/employer/candidates/%5Bid%5D/route.ts) entirely; gate every unlock-only field on `hasFullAccess` like contact info already is. Aligns with "single tier" claim.
3. **Product call:** decide what "expired posting" should actually do — either revoke `hasFullAccess` after a grace period (forces renewal) or grant lifetime access uniformly across all fields.
**Outcome (2026-04-30):** Resolved via M4 using the "cleaner" option. Layer 2 fields (certifications, license states, salary range, availability, hasResume) now gate on `hasFullAccess` — same gate as contact info. Premium-only fields (bio, preferredJobType, full last name) gate on `isAdmin` directly. Previously-unlocked candidates retain full Layer 2 visibility after posting expiry, matching the lifetime-access semantic of the contact-info gates. List endpoints gate on `hasActivePosting` instead.

### [x] 22. Early renewals lose remaining days — **DONE 2026-04-30**

### [x] 23. Free-post quota loophole — editable contactEmail bypassed the gate — **DONE 2026-05-01 / SUPERSEDED 2026-05-01**
**File:** [app/api/jobs/update/route.ts:91-99](../app/api/jobs/update/route.ts)
**Problem:** The free-post quota counted `EmployerJob` rows by `contactEmail`'s domain. `/api/jobs/update` allowed employers to change `contactEmail` after posting → attacker could use 2 freebies on `@acme.com` (count: 2 → capped), edit one to `@dummy.com`, → `acme.com` count drops to 1, → post a 3rd freebie.
**Initial fix (early 2026-05-01):** Block `contactEmail` changes on free postings.
**Superseded by #26 final (later 2026-05-01):** Quota anchor moved from `contactEmail` to `userId`. Editing contactEmail can no longer shift the count, so the special-case edit block was removed — both paid AND free postings now allow `contactEmail` edits without restriction.

### [x] 24. Renewal-blocked-for-free-posts UX — silent backend 409 with no popup — **DONE 2026-05-01**
**Files:** [app/jobs/edit/[token]/page.tsx](../app/jobs/edit/%5Btoken%5D/page.tsx), [components/employer/EmployerDashboardClient.tsx](../components/employer/EmployerDashboardClient.tsx)
**Problem:** Audit #11 blocks renewal of free postings at the API. Customer experience was: click "Renew" → get a generic 409 error with no clear next step. Felt broken.
**Fix (2026-05-01):** Renewal modal now branches on `paymentStatus`. For free postings, shows a dedicated popup explaining "this free post can't be renewed" with the price reasoning + a primary CTA to post a fresh listing for $${config.postingPrice}. For paid postings, shows the standard renewal CTA. Backend 409 retained as defense-in-depth.

### [x] 26. Free-post quota was keyed off form `contactEmail`, not signup email — **DONE 2026-05-01**
**File:** [app/api/jobs/post-free/route.ts](../app/api/jobs/post-free/route.ts)
**Problem:** Larger sibling of #23. The quota count + free-email-provider check both used the form-submitted `contactEmail` rather than the authenticated user's signup email. Attack required no edits — just submit each free post with a different domain in the contact field:
```
Sign up once as bob@acme.com.
Post 1: contactEmail = bob@example1.com → counts against example1.com
Post 2: contactEmail = bob@example2.com → counts against example2.com
... infinite freebies
```
**Final fix (2026-05-01):**

The rule stays the same: **2 free posts per email domain, lifetime, shared across every employee at that domain.** What changed is *how* that rule is enforced — moving from a mutable input (form `contactEmail`) to an immutable per-row snapshot.

1. New schema column: `EmployerJob.quotaDomain String?` — set ONLY at row creation by `/api/jobs/post-free`, never written by any update path. Migration [20260501_add_quota_domain](../prisma/migrations/20260501_add_quota_domain/migration.sql) adds the column and backfills existing free rows from `LOWER(SPLIT_PART(contact_email, '@', 2))`.
2. Auth check moved before the email-provider validation so the signup email is available.
3. `FREE_EMAIL_DOMAINS` block now keyed off signup email (`user.email`), not form input.
4. At creation: `quotaDomain` is set from the signup email's domain.
5. Quota count: `WHERE quotaDomain = '<signupDomain>' AND paymentStatus = 'free'` — never reads contactEmail or userId.

**Loopholes closed by this design:**

| Attack | Closed by |
|---|---|
| Submit each free post with a different domain in form contactEmail | quotaDomain comes from signup, not form |
| Edit contactEmail later to shift the count | quotaDomain is immutable |
| Delete account → userId nulled to drop the count | count doesn't read userId |
| Sign up with Gmail | FREE_EMAIL_DOMAINS check on signup email |

**Loopholes NOT closed by this design (and why):**

| Attack | Why it remains |
|---|---|
| Buy 25 cheap shell domains (~$300 → 50 freebies) | Domain registration is free-form. Needs per-org verification (NPI/DNS TXT/manual review) — deferred |
| Admin hard-deletes the EmployerJob row | Cascade-delete drops the row. Internal-only attack vector. Audit #25 tracks soft-delete remediation |

**Form contactEmail is fully decoupled from quota:** recruiters posting on behalf of a client, multi-brand orgs, or admins posting for a hiring manager can put any email in the form without affecting the quota. Audit #23's restrictive contactEmail-edit block was removed.

**Migration applied to production:** 2026-05-01 via `npx prisma migrate deploy`. Existing free rows backfilled from contact_email's domain (the closest signal we had pre-fix). Going forward, every new free row has quotaDomain set from the signup email at creation.

### [-] 27. Email-domain change can shift the freebie quota — **HELPER LANDED + TESTED 2026-05-01; ENFORCEMENT PENDING UI**
**Files:** [lib/auth/email-change-policy.ts](../lib/auth/email-change-policy.ts) (new)
**Problem:** quotaDomain is the immutable per-row anchor that closes most loopholes. But if a user changes their *account email's domain* (e.g. bob@acme.com → bob@example.com) and then posts new freebies, the new freebies' quotaDomain is set from the new signup email → fresh 2 freebies at example.com that don't share a bucket with acme.com. Allowing local-part changes (bob@acme.com → bob.smith@acme.com) is fine — same domain, same bucket.
**Fix landed 2026-05-01:** Reusable policy helper `evaluateEmailChange(userId, oldEmail, newEmail)` returns `{ allowed, reason }`. Rule:
- Local-part changes → allowed
- Domain changes when zero freebies used by this user → allowed
- Domain changes when freebies exist → blocked with "contact support" message
**Still pending:** there is no user-facing email-change endpoint today; nothing currently calls `evaluateEmailChange`. **When email-change UI is added, the new endpoint MUST call this helper.** Reference comment in [lib/auth/email-change-policy.ts](../lib/auth/email-change-policy.ts) flags the requirement. Also applicable to: any admin override that changes a user's email; any Supabase Auth email-change webhook handler we add.
**Tests landed (2026-05-01):** [tests/lib/email-change-policy.test.ts](../tests/lib/email-change-policy.test.ts) — 9 tests covering same-domain pass-through (no DB call), case-insensitive comparison, invalid email rejection, zero-freebie domain change allowed, blocked when freebies exist (with locked-domain in response), correct query filter shape. The helper is fully tested and ready to plug in whenever the email-change endpoint is built.

### [x] 30. Hybrid duration: free posts shortened to 30 days; paid stays 60 — **DONE 2026-05-01**
**Files:** [lib/config.ts](../lib/config.ts), [app/api/jobs/post-free/route.ts](../app/api/jobs/post-free/route.ts), [lib/email-service.ts](../lib/email-service.ts), pricing/FAQ/post-job marketing copy.
**Concern raised:** A domain getting 2 free posts × 60 days each = 120 days of value per domain, lifetime. That's generous to the point that "why would they ever pay?" becomes a real question for niche-board economics. The flip-side concern: dropping all posts to 30 days kneecaps the "60-day listing" marketing pitch that differentiates the platform from Indeed/LinkedIn (both 30 days).
**Fix (2026-05-01):** Hybrid split — free posts run **30 days** (trial-feel), paid posts run **60 days** (the headline-value pitch). Renewals are paid-only and run 60 days. The paid 60-day differentiator vs competitors stays intact in marketing copy.
**Implementation:**
1. `config.durationDays: 60` (paid) + new `config.freeDurationDays: 30` — separate values for distinct flows.
2. `/api/jobs/post-free` writes `expiresAt = now + freeDurationDays`. Confirmation email is passed `freeDurationDays` so the email's "30-day listing" line matches the actual DB expiry.
3. `/api/create-checkout` and the renewal webhook continue to use `config.durationDays` (60). Paid path unchanged.
4. `sendConfirmationEmail` now accepts an optional `durationDays` param, defaulting to `config.durationDays` for backward compat. The webhook's paid-post call site picks up the default.
5. Marketing copy updated on `/pricing` (FAQs + bento checklist), `/faq` (employer FAQs), `/post-job` feature pills, `/post-job/preview` summary. Hero card "60-Day Listing" copy retained — that's the paid-tier headline.
**Effect on the lifetime giveaway:** 2 free × 30 days = 60 days/domain (was 120). Conversion-pressure window halved. Free posts can still be replaced with a fresh paid post at $199.
**Future-tier headroom:** 30/60 split leaves obvious room for a Premium tier at 90 days later (audit P4).

### [x] 29. Job seekers could load the post-job form despite an existing role check — **DONE 2026-05-01**
**File:** [app/post-job/page.tsx](../app/post-job/page.tsx)
**Problem:** Customer report — a job-seeker account at `daggulasatish143@gmail.com` was able to load `/post-job` and see the full form populated with their email and a draft. Existing role-check redirected via `router.push('/jobs')` and rendered a "Wrong Account Type" page if `role === 'job_seeker'`, but it had two gaps:
1. **Denylist instead of allowlist** — only the literal string `'job_seeker'` was blocked. Any other role string (null, missing, malformed, future role like `'recruiter'`) fell through and the user proceeded to the form.
2. **Race with draft loading** — the draft-load `useEffect` runs in parallel with the auth-check `useEffect`. If the draft loads before auth completes, the form briefly shows populated even after `isAuthLoading` flips false.
**Fix (2026-05-01):**
- Switched the gate from denylist to **allowlist**: only `role === 'employer'` or `role === 'admin'` proceed to the form. Auto-fill of `contactEmail` from the signup email also moved inside the allowlist branch (was always running for any logged-in user).
- Removed the silent `router.push('/jobs')` — the in-page "Wrong Account Type" screen with a sign-out button is better UX than a quiet redirect that loses the user's place.
- Block screen now displays the actual stored role (e.g. "You are logged in as **Job Seeker**") and offers two paths: browse jobs OR sign out + create an Employer account.
- Defense-in-depth: API at [/api/jobs/post-free](../app/api/jobs/post-free/route.ts) still returns 403 for non-employers (was already in place).

### [x] 28. No `charge.refunded` webhook handler — refunds silently desync DB from Stripe — **DONE 2026-05-01**
**File:** [app/api/webhooks/stripe/route.ts](../app/api/webhooks/stripe/route.ts) (only handles `checkout.session.completed` today)

**Problem:** ToS Section 8 promises a 7-day case-by-case refund window with manual approval. When you actually issue a refund (Stripe Dashboard → Payments → Refund button), Stripe sends a `charge.refunded` webhook event — but the codebase doesn't subscribe to it. Result: the money goes back to the customer, but in your DB:
- `EmployerJob.paymentStatus` stays `'paid'` (should flip to `'refunded'`)
- `Job.isPublished` stays `true` (the refunded customer's posting keeps running for free until natural expiry)
- `JobCharge` row keeps the original `amountCents` with no refund flag (invoice ledger lies)
- Customer doesn't get an automatic refund-confirmation email (Stripe sends one; your platform doesn't)

**Severity:** low today (refund volume = ~0), grows linearly with refund volume. At 5 refunds per quarter, manual reconciliation is fine. At 50, it's a real ops problem.

**Implementation spec (~1-2 hours when ready):**

1. **Schema additions** ([prisma/schema.prisma](../prisma/schema.prisma)):
   ```prisma
   model JobCharge {
     // existing fields...
     refundedAt      DateTime? @map("refunded_at")
     refundedAmountCents Int?  @map("refunded_amount_cents")  // supports partial refunds
     refundReason    String?   @map("refund_reason")
   }
   ```
   Plus add `'refunded'` as an accepted value in the documented `EmployerJob.paymentStatus` enum.

2. **Webhook branch** in `/api/webhooks/stripe/route.ts`:
   ```ts
   if (event.type === 'charge.refunded') {
     const charge = event.data.object as Stripe.Charge;
     // Look up JobCharge by stripePaymentIntentId or stripeSessionId
     // Update JobCharge with refundedAt, refundedAmountCents, refundReason
     // Update EmployerJob.paymentStatus to 'refunded'
     // Optionally Job.isPublished = false (decision: do we unpublish on refund?)
     // Send sendRefundConfirmationEmail (new template)
     return NextResponse.json({ received: true });
   }
   ```
   Idempotency dedupe still applies via `processed_stripe_events`.

3. **Stripe Dashboard webhook** — add `charge.refunded` to the event filter for both test and live endpoints.

4. **Email template** — new `sendRefundConfirmationEmail` in [lib/email-service.ts](../lib/email-service.ts):
   - Subject: `Refund processed — $X.XX for "<job title>"`
   - Body: receipt-style summary, "5–10 business days to appear", support link
   - Optional: surface in-platform that the posting has been unpublished

5. **Product decisions to make before building:**
   - **On refund: unpublish the job, leave it published, or check posting age?** Recommend: full refund within 24h → unpublish; partial refund or older refund → leave published unless explicitly removed.
   - **Allow re-posting after refund?** The free-quota count keys on `quotaDomain` and `paymentStatus='free'`, so a refunded paid post doesn't restore freebies. Probably correct behavior — refund returns money, doesn't restore quota.
   - **Dispute handling** (`charge.dispute.created`)? Different event, different operational response. Defer to a separate audit item.

6. **Tests** — add to `tests/api/webhook.test.ts` (currently doesn't exist; would be new):
   - `charge.refunded` flips `paymentStatus` to 'refunded'
   - Idempotent — second delivery of same event does nothing
   - Partial refund only updates amount, doesn't unpublish
   - Missing JobCharge → log loud and skip (don't crash)

**Why deferred:** Today's refund volume is essentially zero. Building for zero traffic is overengineering. Build the moment you start issuing more than a few refunds a quarter, OR if you ever offer a self-serve refund button (which you shouldn't — case-by-case discretion is the point of the policy).

**Outcome (2026-05-01):** Implemented end-to-end despite zero current refund volume — small enough surface that getting it right now is cheaper than the eventual scramble. What landed:
1. **Schema** ([prisma/schema.prisma](../prisma/schema.prisma)): added `JobCharge.stripePaymentIntentId` (unique, used to match refund webhooks back to the ledger), `JobCharge.refundedAt`, `JobCharge.refundedAmountCents` (supports partial refunds), `JobCharge.refundReason`. Migration `20260501_add_refund_fields_to_job_charges` applied to production.
2. **Webhook ingestion** ([app/api/webhooks/stripe/route.ts](../app/api/webhooks/stripe/route.ts)): both new-post and renewal `JobCharge.create` calls now persist `stripePaymentIntentId` from `session.payment_intent`. New `charge.refunded` event handler matches via `stripePaymentIntentId`, updates the ledger row with `refundedAt`/`refundedAmountCents`/`refundReason`, flips `EmployerJob.paymentStatus` to `'refunded'`, unpublishes the job IFF the refund is full (partial refunds keep the posting live). Idempotency dedupe via existing `processed_stripe_events` table — Stripe retries are safe.
3. **Email** ([lib/email-service.ts](../lib/email-service.ts)): new `sendRefundConfirmationEmail` template — receipt-style summary, formatted amount, partial-vs-full distinction in subject and body, "5–10 business days" expectation, support email link. Best-effort send (webhook doesn't fail if email errors).
4. **Stripe Dashboard config required:** when setting up the production webhook endpoint, `charge.refunded` must be added to the event filter alongside `checkout.session.completed`. (Test mode endpoint same.) Without this, Stripe won't deliver the event and the handler can't run.
5. **Pre-#28 charges** (created before this migration) won't have `stripePaymentIntentId` populated. The handler logs a warning and exits gracefully — those charges still need manual reconciliation if refunded. Going forward, every new charge has the field set automatically.

### [x] 25. Admin hard-delete reduces freebie count — **DONE 2026-05-01**
**File:** [app/api/admin/jobs/[id]/route.ts](../app/api/admin/jobs/%5Bid%5D/route.ts)
**Problem:** `DELETE /api/admin/jobs/:id` calls `prisma.job.delete()` when `?hard=true`. Cascade through `EmployerJob.jobId` (onDelete: Cascade) wipes the employer-job row → `paymentStatus='free'` rows go away → freebie count for that domain drops. Admin-only, customer can't trigger directly, but internal abuse vector.
**Risk:** internal abuse vector if admins are unmonitored. Audit logging mitigates.
**Fix options:** soft-delete pattern (`deletedAt`) instead of hard-delete; OR replace this endpoint with an unpublish endpoint and let the `purge-soft-deleted` cron handle eventual deletion only after the row stops counting; OR accept the risk and rely on audit logs.
**Outcome (2026-05-01):** Hard-delete now refuses to nuke a free posting. The endpoint checks `EmployerJob.paymentStatus === 'free'` before allowing the cascade and returns 409 if so, with a message instructing the admin to soft-delete (the default no-flag path) instead. Soft-delete remains the default and works fine. For paid postings, hard-delete is still allowed because they don't drive the freebie quota anchor. If an actual quota-preserving full-data-removal is ever needed (DMCA / GDPR right-to-erasure on a free post), engineering can do it with a manual SQL flow that nulls the EmployerJob's identifying fields without dropping the row — that's not a customer-facing path.
**File:** [app/api/webhooks/stripe/route.ts:53-67](../app/api/webhooks/stripe/route.ts)
**Problem:** Renewal webhook sets `expiresAt = now + 60 days`, overwriting the existing expiry instead of extending from it. Three scenarios:
- **Renew at expiry (most common):** clean — gets 60 more days. ✓
- **Renew early:** customer with 10 days left renews → new expiry = now + 60 = day 110. **Loses the 10 days they still had.** Effectively paid $179 for 50 days of new visibility instead of 70.
- **Renew after expiry:** gets 60 days from now. Correct (dead days don't carry over).

**Why it matters:** sophisticated buyers (staffing firms, hospital systems) sometimes renew proactively to avoid downtime gaps between postings. Those buyers silently lose paid time. Most casual customers renew at or after expiry, so won't notice — but the ones who do notice are the ones with the highest LTV.

**Fix (~5 lines + a unit test):**
```ts
const baseDate = job.expiresAt && job.expiresAt > new Date() ? job.expiresAt : new Date();
const newExpiresAt = new Date(baseDate);
newExpiresAt.setDate(newExpiresAt.getDate() + config.getDurationDays(renewalTier));
```
Take the max of `now` and existing `expiresAt` before adding 60. Late renewers still get 60 from now; early renewers get a true 60-day extension.

**Risk:** very low. The fix only ever extends expiry further into the future than current behavior — no existing buyer is hurt by it. Only consideration: if you ever want to *intentionally* reset (e.g. renewal also "boosts" placement back to top), the timestamp matters separately from `expiresAt`. Currently search ranking is based on `expiresAt`, so this fix is safe.

---

## Suggested fix order

1. **#1, #3** — Webhook idempotency + `/success` server-side verification. Only items where a real customer sees "Payment Successful!" while their job is invisible.
2. **#2** — Invoice ledger.
3. ~~**#5** — Renewal-success stale copy (30-second fix, visible bug).~~ **DONE 2026-04-30** (resolved as part of tier cleanup).
4. **#6, #7** — Transactions + race fixes.
5. **#4** — Drop `ENABLE_PAID_POSTING` or wire it.
6. **#12** — Centralize hardcoded prices.
7. ~~**#9, #15, #16, #17** — Tier cleanup~~ **DONE 2026-04-30** (DB row migration applied, schema default changed, dead upgrade routes deleted, `PricingTier` narrowed to `'pro'`, candidate-route gates refactored to `isAdmin` / `hasActivePosting` / `hasFullAccess`).
8. **#20 → #13** — Add `lib/tier-limits.test.ts` first, then fix the cap logic.
9. ~~**#21** — Pick a candidate-detail expiry policy and align gates~~ **DONE 2026-04-30** (resolved by M4 — Layer 2 fields now gate on `hasFullAccess`, admin-only fields on `isAdmin`).
10. **#22** — Fix early-renewal day loss in the renewal webhook (~5 lines + test). Bundle with #3 webhook idempotency since you'll be in the same file.
11. **#8, #10, #11, #14, #18, #19** — Remaining edges.

---

## Pricing optimization opportunities (revenue / strategy, not bugs)

These are not broken — they're decisions where the current pricing model leaves money on the table or under-serves a buyer segment. Ship audit fixes #1, #2, #3, #5, #12, #21 *before* running any of these so that experiments produce clean data.

### [ ] P1. Test $249 instead of $199 (price elasticity)
**Files:** [lib/config.ts:19, 21](../lib/config.ts) — `postingPrice`, `stripePriceInCents`
**Problem / opportunity:** PMHNP is an acute-shortage role; agency placement fees run $8–15k. A 60-day exclusive niche listing at $199 is well below market relative to the value delivered. Likely room to charge $249–$399 without losing volume — *especially* given the 60-day duration is double the industry standard.
**Effort:** ~1 day — feature flag + Stripe price update + analytics hook to track conversion.
**How to test:**
1. Wire conversion analytics first (post-job page view → free submit, paid submit, paid complete).
2. Collect ~4 weeks of baseline at $199.
3. Flag-gate 50% of new visitors to $249.
4. Read after ~50 paid posts of post-flag data; need significance ~95% before committing.
**Risk:** Below-$200 psychological anchor is real for SMB buyers. Monitor cart abandonment closely.

### [ ] P2. Self-serve bulk packs (5-pack, 10-pack)
**Files:** new — pricing page CTA, new checkout route
**Problem / opportunity:** [app/pricing/page.tsx:57](../app/pricing/page.tsx) tells multi-location buyers to email `support@pmhnphiring.com` for bulk pricing — that's a conversion leak. Buyers will bounce.
**Suggested levels:**
- 5-pack at $849 (15% off, ~$170/post)
- 10-pack at $1,499 (25% off, ~$150/post)
**How it works:** customer pays once, the org's account gets N "post credits" usable for 12 months. Each credit redeemable as one full posting (60 days, featured, 25/25 unlocks-InMails).
**Effort:** ~2-3 days — `JobPostCredit` model on `EmployerJob` (or `Organization` later), bulk-pack Stripe products, redemption flow at post-job checkout.
**Highest revenue-per-dev-day item on this list.**

#### Implementation spec (pick up next session)

**Schema additions:**
```prisma
model JobPostCreditPack {
  id              String   @id @default(uuid())
  // Owner — currently keyed off email since we don't have Organization yet.
  // When P-org-verification ships, switch to organizationId.
  contactEmail    String   @map("contact_email")
  userId          String?  @map("user_id")
  // Stripe traceability
  stripeSessionId String   @unique @map("stripe_session_id")
  amountCents     Int      @map("amount_cents")
  // Pack contents
  totalCredits    Int      @map("total_credits")    // 5 or 10
  usedCredits     Int      @default(0) @map("used_credits")
  expiresAt       DateTime @map("expires_at")        // purchase + 12 months
  createdAt       DateTime @default(now()) @map("created_at")

  redemptions     JobPostCreditRedemption[]
  @@index([contactEmail])
  @@index([userId])
  @@map("job_post_credit_packs")
}

model JobPostCreditRedemption {
  id            String            @id @default(uuid())
  packId        String            @map("pack_id")
  employerJobId String            @unique @map("employer_job_id")
  redeemedAt    DateTime          @default(now()) @map("redeemed_at")
  pack          JobPostCreditPack @relation(fields: [packId], references: [id])

  @@index([packId])
  @@map("job_post_credit_redemptions")
}
```

**Config additions ([lib/config.ts](../lib/config.ts)):**
```ts
bulkPacks: [
  { id: 'pack-5',  credits: 5,  amountCents: 84900,  validityMonths: 12, label: '5-pack',  perPost: 170 },
  { id: 'pack-10', credits: 10, amountCents: 149900, validityMonths: 12, label: '10-pack', perPost: 150 },
]
```

**New routes:**
- `POST /api/bulk-pack/create-checkout` — Stripe Checkout for the pack purchase. Metadata: `{ type: 'bulk-pack', packId, contactEmail }`.
- Webhook update at [app/api/webhooks/stripe/route.ts](../app/api/webhooks/stripe/route.ts): new branch for `metadata.type === 'bulk-pack'` → creates `JobPostCreditPack` row, sends pack-purchase confirmation email, fires `purchase` event with `value: 849` or `1499`.

**Redemption flow:**
- [app/post-job/preview/page.tsx](../app/post-job/preview/page.tsx) submission: BEFORE checking free quota or hitting `/api/create-checkout`, query for unused credits via new `GET /api/bulk-pack/available`. If a credit pack with `usedCredits < totalCredits` and `expiresAt > now` exists, show "Use 1 credit (4 remaining)" CTA → submits to a new `/api/jobs/post-with-credit` route that:
  - Atomically increments `pack.usedCredits` and creates `EmployerJob` + `JobPostCreditRedemption` in a transaction
  - Skips Stripe entirely (already paid)
  - Marks `paymentStatus: 'paid'` and writes a synthetic `JobCharge` referencing `packId` (so the invoice ledger stays consistent)

**UI surfaces:**
- Pricing page ([app/pricing/page.tsx](../app/pricing/page.tsx)): new "Bulk packs" section above the FAQ. CTA buttons → `/bulk-pack/checkout?pack=5` or `?pack=10`. Replace the "email support@" copy in FAQ #7.
- Dashboard ([components/employer/EmployerDashboardClient.tsx](../components/employer/EmployerDashboardClient.tsx)): new widget — "Pack credits: 4 of 5 remaining · expires 2027-04-30" if any active pack exists.
- Post-job preview: prominent "Use credit (4 remaining)" CTA when a pack is available.

**Edge cases to handle:**
- **Refund / dispute:** if Stripe refunds the pack purchase, revoke unused credits. Add a webhook branch for `charge.refunded` that decrements `pack.totalCredits` to match `pack.usedCredits` (effectively zeroing the unused balance) and emails the buyer.
- **Multiple packs:** an org may have multiple active packs (bought a 5, used it, bought a 10). Redemption order: oldest expiry first.
- **Expiry:** cron job to mark `JobPostCreditPack` as expired and notify owner ~30 and ~7 days before. Use existing job-expiry warning infra as template.
- **Tax:** packs need Stripe Tax wired up (see P5) before launching at any scale beyond US. For US-only launch, Stripe digital-services tax handling is fine.

**Tracking events to add (extends P7):**
- `view_bulk_pack_page` — landed on the bulk pack pricing surface
- `begin_bulk_pack_checkout` — clicked through to Stripe (analogue to `begin_checkout`)
- `purchase` — server-side via Measurement Protocol on webhook (already wired pattern)
- `redeem_credit` — every time a credit is consumed (fires on /api/jobs/post-with-credit success)

**Open product questions before building:**
1. Pack lifetime — 12 months or 24? Most enterprise B2B tooling does 12.
2. Refund policy on unused credits when buyer asks within first 7/14 days?
3. Transferable between users in the same org? (NB: ties into the deferred per-org verification work — hold this.)
4. Show monthly/quarterly average usage in the dashboard so buyers can self-justify a 10-pack vs a 5-pack?
5. Email a "you've used 4 of 5 credits" trigger to upsell the next pack?

**Effort estimate (refined):**
- Schema + migration: 0.5d
- Bulk-pack checkout + webhook branch: 1d
- Redemption route + post-flow integration: 1d
- Dashboard widget + UI: 1d
- Refund handler: 0.5d
- Email templates + cron expiry warnings: 0.5d
- Tests: 1d
- **Total: ~5.5 dev-days** (was originally estimated 2-3, increased after spec)

### [x] P3. Renewal at 10% off ($179) instead of 20% off ($159) — **DONE 2026-04-30**
**Files:** [lib/config.ts:20, 22](../lib/config.ts) — `renewalPrice`, `stripeRenewalPriceInCents`
**Problem / opportunity:** Renewal is a captive transaction — the customer's alternative is reposting at full $199. 20% off is generous; 10% off still feels like a deal and recovers ~$20/renewal in margin.
**Effort:** 30 seconds — config change + verify the FAQ + dashboard renewal modal pull from config (note: depends on audit #12 to be complete, otherwise the FAQ will lie).
**Risk:** very low. Monitor renewal rate for 30 days post-change to confirm no behavior shift.
**Outcome (2026-04-30):** Updated 10 surfaces atomically — `lib/config.ts` (canonical + deprecated maps + doc comments), [app/pricing/page.tsx](../app/pricing/page.tsx) (FAQ + hero card), [app/api/create-renewal-checkout/route.ts](../app/api/create-renewal-checkout/route.ts) (comment + Stripe product description), [app/faq/page.tsx](../app/faq/page.tsx) (both renewal answers), [app/jobs/edit/[token]/page.tsx](../app/jobs/edit/%5Btoken%5D/page.tsx) (renewal CTA — still hardcoded, tracked by audit #12), [components/employer/EmployerDashboardClient.tsx](../components/employer/EmployerDashboardClient.tsx) (renewal modal). Verified: zero remaining `$159` or `20% off` references across `app/`, `components/`, `lib/`. No Stripe Dashboard work required (inline `price_data`). In-flight sessions before deploy still resolve at $159 and complete normally. Recovered ~$20/renewal in margin going forward; **monitor renewal rate vs prior 30-day baseline starting 2026-05-30** to confirm no demand shift.

### [ ] P4. Boost / Spotlight upsell SKU at $49
**Files:** new — `Job.isSpotlight` (or similar) field, new checkout route, new dashboard upsell
**Problem / opportunity:** Every post is already Featured + top placement by default. There is no upsell path *above* the base post, so ARPU is capped at $199. Indeed/LinkedIn make 2-3× per buyer through boosts and sponsored slots.
**Suggested mechanics:**
- "Spotlight" badge → top of homepage carousel for 7 days
- Optionally: hand-curated newsletter feature (next "Top Picks" digest)
**Effort:** ~4-5 days — new field + UI for selecting Spotlight at checkout or post-payment, search ranking tweak, newsletter integration.
**Decision needed:** if you add Spotlight, does the base "Featured" badge stay default-on for every post, or does it get reserved for Spotlight buyers? Reserving it is more profitable but risks weakening the value of a paid post relative to free.

### [ ] P5. Stripe Tax + PO/invoice path for enterprise
**Files:** [app/api/create-checkout/route.ts:209-232](../app/api/create-checkout/route.ts), [app/api/create-renewal-checkout/route.ts:63-87](../app/api/create-renewal-checkout/route.ts)
**Problem / opportunity:** Today checkout collects no sales tax (US destination-based or international VAT/GST), and there's no net-30 invoicing path. Hospital systems and large staffing firms buy on PO/invoice, not credit card. Survivable now, blocker at scale.
**Effort:**
- Stripe Tax setup: ~half a day (enable Stripe Tax in dashboard, add `automatic_tax: { enabled: true }` to checkout sessions)
- PO/invoice path: ~3-4 days (Stripe Invoicing integration, net-30 terms, manual reconciliation flow)
**Risk:** Stripe Tax adds tax line items that may surprise existing buyers — clear copy on the checkout page mitigates.

### [x] P7. Wire pricing-funnel analytics events — **DONE 2026-04-30**
**Files:** [lib/analytics.ts](../lib/analytics.ts) (existing), [app/post-job/page.tsx](../app/post-job/page.tsx), [app/post-job/checkout/page.tsx](../app/post-job/checkout/page.tsx), [app/success/page.tsx](../app/success/page.tsx), [app/employer/renewal-success/page.tsx](../app/employer/renewal-success/page.tsx), [app/api/webhooks/stripe/route.ts](../app/api/webhooks/stripe/route.ts), [app/api/jobs/post-free/route.ts](../app/api/jobs/post-free/route.ts) (server-side via Measurement Protocol)
**Problem / opportunity:** GA4 + Consent Mode v2 infrastructure is fully built at `lib/analytics.ts`, but the entire employer-side funnel is dark. `trackJobPost(jobId, tier)` is defined but never called. No visibility into post-job page views, checkout starts, payment completions, free-post limit hits, or credit-cap hits. Without these events you can't run a clean P1 ($249) test or measure conversion at any pricing change.
**Suggested events:**
- `view_post_job_page` — landed on /post-job
- `begin_checkout` — clicked to start paid checkout
- `submit_free_post` — completed a free post (success state)
- `purchase` — webhook confirmed paid (server-side via Measurement Protocol with `value: 199`)
- `renewal_completed` — webhook renewal branch (server-side, `value: 179`)
- `free_post_limit_hit` — 403 from `post-free` (signals demand for paid conversion)
- `unlock_limit_hit` — 403 from `canUnlockCandidate` (signals upsell pressure)
- `inmail_limit_hit` — 403 from `canSendInMail` (same)
**Effort:** ~2 hours — ~10 call-site additions plus a thin Measurement Protocol helper for server-side `purchase` events.
**Blocks:** P1 ($249 A/B test) requires 4+ weeks of baseline data from these events.

### [ ] P6. Annual prepay deal (lightweight subscription substitute)
**Files:** new — but minimal; can be Stripe Invoicing handled manually first
**Problem / opportunity:** Staffing firms and hospital systems prefer recurring/predictable cost over per-post transactions. Real subscription product is too early (operational tax of dunning/proration/past-due states is high), but you can capture 60% of the value with **annual prepay**.
**Suggested levels:**
- $1,499/year for unlimited posts (vs $199 × 8 = $1,592 transactional break-even)
- Capture by manually quoting via Stripe Invoicing when an enterprise buyer asks
**Effort:** ~zero code — handle ad-hoc via Stripe Invoicing dashboard until you've sold 5+ deals, *then* productize.
**When to upgrade to real subscription:** when 5–10 customers are buying 4+ posts in a single month. That's ~150–200 paid posts/month total volume.

---

## Queued migrations

Code changes that are scoped, agreed-on, but waiting for a deliberate execution window (deploy, scheduled maintenance, or pairing with another change). Track here so they don't get lost.

### [x] M1. Apply `20260430_normalize_pricing_tier_to_pro` migration — **APPLIED 2026-04-30**
**File:** [prisma/migrations/20260430_normalize_pricing_tier_to_pro/migration.sql](../prisma/migrations/20260430_normalize_pricing_tier_to_pro/migration.sql)
**Action:** `npx prisma migrate deploy` (production) or `npx prisma migrate dev` (local).
**Impact:** Backfills all `employer_jobs.pricing_tier` legacy values to `'pro'`; changes column default to `'pro'`.
**Reversible:** yes — see migration file header.
**Blocked by:** nothing.
**Outcome (2026-04-30):** Applied to production Supabase (`db.zdmpmncrcpgpmwdqvekg.supabase.co`). Prisma reported "All migrations have been successfully applied." Atomic (`BEGIN/COMMIT`) — either backfill+default-change both landed or neither did. Post-migration verification query was blocked by a permission hook; behavior on next employer dashboard load will confirm reads still work (legacy fallback branches still accept `'starter'/'growth'/'premium'` for read-compat, so a stale-cache row would still render correctly even before TTL expiry).

### [x] M2. Replace tier-as-gate with explicit "has active posting" checks — **DONE 2026-04-30**
**Files:**
- [app/api/employer/analytics/route.ts:84](../app/api/employer/analytics/route.ts) — `if (tier === 'starter')` → `if (activePostings.length === 0)`
- [lib/tier-limits.ts:63](../lib/tier-limits.ts) — change fallback `|| 'starter'` to `|| 'pro'` once #M2 above completes
**Action:** Add an `activePostings` count check directly in routes that currently use `tier === 'starter'` as a sentinel for "no active posting." Then the tier value purely represents the plan, not the state.
**Impact:** Removes the last semantic ambiguity around the `'starter'` value. Enables future deletion of `'starter' | 'growth' | 'premium'` from the type union.
**Reversible:** yes — small surgical changes per route.
**Blocked by:** M1 (don't change the fallback until backfill is complete).
**Outcome (2026-04-30):** Analytics route refactored — gate is now `if (!hasActivePosting)` derived from `getEmployerActivePostings(user.id).length > 0` (admins always pass). `getEmployerTier` fallback changed to `'pro'`. Upgrade hint copy updated from "Upgrade to Growth" to "Post or renew a job to unlock per-job breakdowns…".

### [x] M3. Delete dead upgrade routes (audit #15) — **DONE 2026-04-30**
**Files:**
- [app/api/create-upgrade-checkout/route.ts](../app/api/create-upgrade-checkout/route.ts)
- [app/api/verify-upgrade-session/route.ts](../app/api/verify-upgrade-session/route.ts)
- [app/employer/upgrade-success/page.tsx](../app/employer/upgrade-success/page.tsx)
- Webhook `else if (type === 'upgrade')` branch at [webhooks/stripe:121-124](../app/api/webhooks/stripe/route.ts)
**Action:** Whole-file deletion + webhook branch removal.
**Impact:** Removes ~150 lines of dead code. Any external link to `/employer/upgrade-success` (none expected, but check email archives) will 404 instead of dead-ending on 410.
**Reversible:** trivially via git revert.
**Blocked by:** nothing.
**Outcome (2026-04-30):** All three files deleted plus their parent directories (`app/api/create-upgrade-checkout/`, `app/api/verify-upgrade-session/`, `app/employer/upgrade-success/`). Webhook `else if (type === 'upgrade')` branch removed. Audit #15 also resolved by this. ~150 lines removed; type-check green.

### [x] M4. Tighten `PricingTier` type to `'pro'` only — **DONE 2026-04-30**
**File:** [lib/config.ts:16](../lib/config.ts)
**Action:** After M1 + M2 ship, narrow union from `'pro' | 'starter' | 'growth' | 'premium'` to just `'pro'`. Remove the legacy-value fallback branches in candidate-detail / candidate-list / saved-candidates / candidates-search.
**Impact:** Simplifies ~6 read-side branches. Type system enforces canonical value.
**Reversible:** yes — re-add the legacy values to the union if needed.
**Blocked by:** M1 (no rows with legacy values), M2 (no fallback to legacy 'starter').
**Outcome (2026-04-30):** `PricingTier` narrowed to `'pro'` (single literal). All admin-coercion patterns (`isAdmin ? 'premium' : await getEmployerTier(...)`) replaced with separate `isAdmin` flag plumbed through response builders. All Layer 2 / Premium tier branches replaced with explicit `isAdmin` (admin-only fields like `bio`, `preferredJobType`, full last name) or `hasActivePosting` (unlock-eligible metadata in list endpoints) or `hasFullAccess` (per-candidate detail endpoint, gates same as contact info). `getEmployerTier` simplified to always return `'pro'`. Files touched: [lib/config.ts](../lib/config.ts), [lib/tier-limits.ts](../lib/tier-limits.ts), [app/api/employer/candidates/route.ts](../app/api/employer/candidates/route.ts), [app/api/employer/candidates/[id]/route.ts](../app/api/employer/candidates/%5Bid%5D/route.ts), [app/api/employer/saved-candidates/route.ts](../app/api/employer/saved-candidates/route.ts), [app/api/candidates/search/route.ts](../app/api/candidates/search/route.ts), [app/api/employer/analytics/route.ts](../app/api/employer/analytics/route.ts), [app/api/employer/analytics/csv/route.ts](../app/api/employer/analytics/csv/route.ts), [components/employer/UsageWidget.tsx](../components/employer/UsageWidget.tsx). Type-check green. **Side effect: resolves audit #21 (Layer 4 strip)** — Layer 2 fields on candidate detail now gate on `hasFullAccess` (lifetime, per-candidate) rather than tier, so previously-unlocked candidates retain certifications/license/salary visibility after posting expiry. List/search endpoints gate on `hasActivePosting` (consistent shopping experience while you have a live posting).

---

## Architecture map (reference)

- **Source of truth:** [lib/config.ts](../lib/config.ts)
- **Stripe client (4 places):** create-checkout, create-renewal-checkout, verify-renewal-session, webhooks/stripe
- **Webhook events handled:** `checkout.session.completed` only (3 sub-flows: new / renewal / upgrade-deprecated)
- **Entitlements:** [lib/tier-limits.ts](../lib/tier-limits.ts) — `getEmployerTier`, `canUnlockCandidate`, `canSendInMail`, `getUsageSummary`, `getPerPostingUsage`
- **Schema billing fields:** `EmployerJob.paymentStatus` (`free` / `pending` / `paid` / `free_renewed` / `free_upgraded`), `EmployerJob.pricingTier` (legacy)
- **Pricing UI surfaces:** [app/pricing/page.tsx](../app/pricing/page.tsx), [app/post-job/page.tsx](../app/post-job/page.tsx), [app/post-job/checkout/page.tsx](../app/post-job/checkout/page.tsx), [app/for-employers/page.tsx](../app/for-employers/page.tsx), [app/faq/page.tsx](../app/faq/page.tsx), [app/jobs/edit/[token]/page.tsx](../app/jobs/edit/%5Btoken%5D/page.tsx), [components/employer/EmployerDashboardClient.tsx](../components/employer/EmployerDashboardClient.tsx)
- **Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `ENABLE_PAID_POSTING` (dead)
