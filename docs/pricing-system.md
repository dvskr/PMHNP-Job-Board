# PMHNP Pricing System: Architecture and Operations

**Model:** paid-first, single tier, transactional
**Last rewritten:** 2026-09 (paid-first migration)
**Source of truth:** [lib/config.ts](../lib/config.ts) + [prisma/schema.prisma](../prisma/schema.prisma)
**Companion doc:** [pricing-audit.md](./pricing-audit.md), the historical change log. Everything in it dated before 2026-09 describes the retired free-first model; see the supersession notice at the top of that file.

This document describes the live state. Every number below is read from `lib/config.ts` at runtime; the values quoted here are the current config values, not a second source of truth. If a number here disagrees with `lib/config.ts`, the config is right and this doc is stale.

---

## 1. The model

| Item | Value | Config key |
|---|---|---|
| First post per employer identity | $149 | `firstPostPrice` |
| Every post after the first | $299 | `postingPrice` |
| Renewal | $249 | `renewalPrice` |
| Discounted posts per employer, lifetime | 1 | `discountedPostsPerEmployer` |
| Listing duration, every post | 60 days | `durationDays` |
| First post guarantee | on | `firstPostGuarantee` |
| Guarantee applicant threshold | 3 | `guaranteeMinApplicants` |
| Guarantee window | 30 days | `guaranteeWindowDays` |
| Featured badge | always on | `isFeatured` |
| Candidate unlocks per posting | 25 | `limits.candidateUnlocksPerPosting` |
| InMails per posting | 25 | `limits.inmailsPerPosting` |

Three helpers derive everything else, and they are the only sanctioned way to pick a price:

```ts
config.priceFor('first' | 'standard' | 'renewal')        // dollars
config.priceInCentsFor('first' | 'standard' | 'renewal') // Stripe cents
config.firstPostDiscountPercent()                        // 50, for copy
```

`PostPriceKind` is the exported union. Anything that charges money takes a `PostPriceKind` and asks the helper; no route computes a price from a raw field.

**Every post is paid.** There is no unpaid posting path. There is no duration split: the retired free post ran for a shorter window, and that split is gone along with it.

**Every post gets the same features.** The discount changes the price of the first post and nothing else. A $149 post and a $299 post are the same product for the same 60 days with the same unlocks, InMails, featured badge, and placement.

---

## 2. What changed and why (2026-09)

| Before | After |
|---|---|
| First post per employer identity was free | First post is half price at $149 |
| Posts after the first cost less | Posts after the first cost $299 |
| Renewal priced off the old standard | Renewal is $249 |
| Free posts ran a shorter window, paid posts ran 60 days | Every post runs 60 days |
| A quota-key collision refused the post | A quota-key collision only removes the discount |
| Consumer email domains could not post at all | Consumer email domains can post and can earn the discount |
| `POST /api/jobs/post-free` created a live job | That route returns 410 Gone |
| `GET /api/employer/free-quota-status` | `GET /api/employer/post-price` |
| `config.freePostsPerEmail`, `config.freeDurationDays` | `config.discountedPostsPerEmployer`, `config.durationDays` |

**Why.** The free tier was not a funnel into the paid product, it was the product: the overwhelming majority of listings never reached a checkout, so the board carried the cost of hosting, indexing, alerting, and supporting posts that produced no revenue and no signal about what an employer would actually pay. A free first post also attracted the posts least worth carrying, because the employers with real hiring budget were never the ones deterred by the price.

Half price does the job the free post was supposed to do. It still lowers the bar for an employer who has never used the board, it still gives them a reason to try one listing before committing, and it puts every employer on a paid footing from the first transaction, which is the only way the board learns what its listings are worth.

**Why a collision no longer refuses.** The quota keys existed to protect a giveaway. Under a paid model, refusing a paying employer because a colleague at the same domain posted last quarter is straightforwardly wrong: it turns a returning customer away at the till. So the machinery survives unchanged and its verdict is reinterpreted. A collision now means "you have already had the discount, this one is $299".

**Why consumer domains are allowed.** Same reasoning. Gmail and the rest were blocked because a consumer mailbox is a cheap way to mint fresh identities against a free giveaway. Nothing is being given away now, and a solo practitioner hiring their first PMHNP is a real customer. They simply get no `dom:` key, so their discount is gated on their account alone.

---

## 3. Which price applies

The quota machinery in [lib/employer-quota.ts](../lib/employer-quota.ts) is unchanged. It still builds the same session-proven keys, in the same order, from the same inputs:

| Key | Derived from | Purpose |
|---|---|---|
| `acct:<supabase user id>` | the session | survives an account email change |
| `dom:<signup email domain>` | the session, consumer providers excluded | one discount per company |
| `org:<normalized company name>` | the account's write-once profile company | catches a new account on a new domain |

Nothing in that list comes from the posting form. That constraint is load-bearing and is explained at length in the module header: a form-derived key is attacker controlled, so one poster could burn a rival's discount.

The gate reads: build the poster's keys, look for a prior discounted post claiming any of them, and

- **no match** and the employer has taken fewer than `discountedPostsPerEmployer` discounts: charge `priceFor('first')`
- **any match**: charge `priceFor('standard')`

A match never refuses the post. `describeQuotaKey` still exists and still names the matching signal, but the sentence it feeds is now an explanation of the price, not a refusal.

Three notes on the edges:

- **Consumer mailboxes** produce no `dom:` key, because `domainFromEmail` filters them. Their discount is gated on `acct:` and, if the profile carries a usable company name, `org:`. `FREE_EMAIL_DOMAINS` is still exported and still used for that derivation. It no longer gates the right to post.
- **Generic company names** produce no `org:` key. That is deliberate and it fails open: refusing a real clinic the discount costs more than occasionally granting a second one.
- **Legacy rows** predating the key array still carry only `quotaDomain`. The lookup ORs the two together so those rows keep counting.

---

## 4. Flows

### 4a. New post

```
Employer signs up, /post-job, /post-job/preview
  ├─ GET /api/employer/post-price decides which price to show BEFORE submit
  └─ POST /api/create-checkout
       ├─ auth required, role must be employer
       ├─ re-derives the price kind server side (the client's answer is advisory)
       ├─ duplicate-active-job check
       ├─ atomic transaction (Serializable):
       │    ├─ Job.create (isPublished=false, flips on the webhook)
       │    ├─ Job.update (slug)
       │    └─ EmployerJob.create (paymentStatus='pending', quota anchors written once)
       ├─ Stripe Checkout Session at priceInCentsFor(kind)
       └─ 200, redirect to Stripe

  [payment]

Stripe, POST /api/webhooks/stripe (checkout.session.completed)
  ├─ signature verified
  ├─ idempotency: insert processed_stripe_events, unique violation returns 200 deduped
  ├─ Job.update (isPublished=true, isVerifiedEmployer=true, expiresAt=now+durationDays)
  ├─ EmployerJob.update (paymentStatus='paid')
  ├─ JobCharge.create (amountCents read from the session, type='new')
  ├─ sendConfirmationEmail
  ├─ draft cleanup, search-engine ping, embedding refresh, alert fan-out
  └─ server-side purchase event

Stripe redirect, /success?session_id=...
  └─ GET /api/verify-checkout-session confirms payment_status='paid' before the page says so
```

The price kind is decided server side inside the checkout route. The preview endpoint exists so the UI can show the right number and the right guarantee copy before the employer commits; it is not the authority.

### 4b. Renewal

```
Dashboard or edit-token page, renewal modal at priceFor('renewal')
  └─ POST /api/create-renewal-checkout
       ├─ editToken must match the EmployerJob row
       ├─ 409 if paymentStatus='pending' (finish the original checkout first)
       └─ Stripe Checkout Session, metadata type='renewal'

Stripe, webhook renewal branch
  ├─ new expiry = MAX(existing expiresAt, now) + durationDays
  ├─ Job.update (expiresAt, isPublished=true, isFeatured=true)
  ├─ EmployerJob.update (paymentStatus='paid')
  ├─ JobCharge.create (type='renewal')
  ├─ sendRenewalConfirmationEmail
  └─ /employer/renewal-success, verified server side
```

Renewing early does not forfeit the days already paid for: the extension is measured from whichever is later, the current expiry or now.

Historical rows with `paymentStatus='free'` still exist and still cannot be renewed. They predate the paid-first model, they were never charged, and there is no amount to discount from. Those employers post fresh at the price their quota keys resolve to.

### 4c. Expiry

Nothing about expiry changed except that there is now one duration. A posting past `expiresAt` stops counting as an active posting: no new candidate unlocks, no new conversations. Contact details for candidates already unlocked stay visible for good, and replies inside existing conversations stay free.

---

## 5. The first post guarantee

`config.firstPostGuarantee` is a kill switch, not a comment. When it is on, the promise reads:

> Your first post is half price at $149. If it does not bring you at least 3 applicants in 30 days, we refund it in full.

Rules for anyone touching this copy:

1. **Interpolate, never type the numbers.** `config.firstPostPrice`, `config.guaranteeMinApplicants`, `config.guaranteeWindowDays`. A hardcoded 149 in the copy is a lie waiting for the next price change.
2. **Gate every instance on `config.firstPostGuarantee`.** Flipping the flag to `false` must remove the promise from every surface at once: pricing, for-employers, the post-job funnel, checkout, confirmation email, terms. If one surface still promises a refund after the flag is off, the flag did not work.
3. **The clause in terms is copy too.** It is gated the same way.
4. **No dashes.** Colons, commas, periods, or "X to Y". This applies to every user-facing string in the repo, not just the guarantee.

The guarantee attaches to the discounted first post only. A standard post at `postingPrice` carries no applicant promise, and neither does a renewal.

Fulfilment is manual today. An employer who qualifies contacts support and the refund is issued from the Stripe dashboard, which fires `charge.refunded`, which the webhook already handles: the ledger row is marked refunded, `EmployerJob.paymentStatus` flips to `'refunded'`, and a full refund unpublishes the posting.

---

## 6. API surface

| Route | Method | Status |
|---|---|---|
| `/api/employer/post-price` | GET | **renamed** from `/api/employer/free-quota-status` |
| `/api/jobs/post-free` | POST | **retired**, returns 410 Gone |
| `/api/create-checkout` | POST | every new post goes through here |
| `/api/create-renewal-checkout` | POST | renewal |
| `/api/verify-checkout-session` | GET | server-side verification for `/success` |
| `/api/verify-renewal-session` | GET | server-side verification for `/employer/renewal-success` |
| `/api/webhooks/stripe` | POST | publishes the job, writes the ledger, sends mail, fires the purchase event |
| `/api/employer/invoice` | GET | PDF from the `JobCharge` ledger |
| `/api/employer/usage` | GET | per-posting credit usage |

### 6a. `GET /api/employer/post-price`

The response shape is fixed:

```ts
{
  eligible: boolean,                       // may this employer post at all
  isFirstPost: boolean,                    // does the half-price discount apply
  priceKind: 'first' | 'standard',         // renewal never comes from this endpoint
  priceDollars: number,                    // config.priceFor(priceKind)
  remaining: number,                       // discounts left, 0 or 1
  reason?: string                          // why eligible is false
}
```

`eligible` answers "may this employer post", which for a signed-in employer account is essentially always yes. It is false only for the structural cases: not signed in, or not an employer account. A consumer email domain is **not** a reason for `eligible: false` any more.

`isFirstPost` answers the separate question "does the discount apply". Do not conflate the two: the old endpoint's `willBeFree` carried both meanings at once, which is exactly why callers had to be rewritten rather than renamed.

### 6b. `POST /api/jobs/post-free`

Returns 410 Gone with a body explaining that all posts now go through checkout. The handler creates nothing, reads nothing, and holds no quota logic. The file is kept rather than deleted so that a stale client, a bookmarked script, or an old draft in someone's browser gets an explanation instead of a 404.

---

## 7. Data model

Unchanged by this migration. The fields that matter to pricing:

| Field | Meaning now |
|---|---|
| `EmployerJob.paymentStatus` | `'pending'`, `'paid'`, `'refunded'`. `'free'` and the legacy `'free_renewed'` / `'free_upgraded'` values still exist on historical rows; no new row is written with them. |
| `EmployerJob.pricingTier` | always `'pro'`. Vestigial, read paths ignore the value. |
| `EmployerJob.quotaKeys` | the key array from `buildQuotaKeys`, written once at row creation. Now the discount anchor. |
| `EmployerJob.quotaDomain` | legacy single-domain anchor, still written and still counted so pre-`quotaKeys` rows keep claiming their discount. |
| `Job.expiresAt` | drives the active-posting definition. Set to now plus `durationDays` on payment. |
| `JobCharge` | one row per Stripe checkout, the invoice source of truth. Carries the refund fields. |
| `ProcessedStripeEvent` | webhook idempotency log, keyed on the Stripe event id. |

The discount count reads discounted posts, not free ones. Historical rows with `paymentStatus='free'` are the retired model's output; whether they consume the new discount is a product decision recorded wherever the gate query lives, not something to infer from the schema.

---

## 8. Copy rules

Every employer-facing surface reads its numbers from config. The list, so nothing gets missed on the next price change:

`/pricing`, `/for-employers`, `/faq`, `/post-job` and its layout metadata, `/post-job/preview`, `/post-job/checkout`, `/success`, `/employer/dashboard`, `/employer/renewal-success`, `/jobs/edit/[token]`, `/terms`, the signup surfaces, and the transactional email templates in `lib/email-service.ts`.

Three standing rules:

1. **No hardcoded prices or durations.** Interpolate `config.*`. Page metadata that cannot interpolate at build time still imports the config and builds the string.
2. **No dashes in user-facing copy.** Colons, commas, periods, or "X to Y".
3. **Nothing that reads as a free offer.** No "first post free", no "no credit card required". Those phrases are pinned shut by a static regression test.

---

## 9. Test coverage

| File | Covers |
|---|---|
| [tests/lib/pricing-config.test.ts](../tests/lib/pricing-config.test.ts) | `priceFor` and `priceInCentsFor` for all three kinds, dollars and cents agreeing, the discount percent, price ordering, `discountedPostsPerEmployer` |
| [tests/regressions/paid-first-pricing-static.test.ts](../tests/regressions/paid-first-pricing-static.test.ts) | the retired config keys are gone, `post-free` is a 410 stub, no surface advertises a free post, guarantee copy is flag-gated, no dashes on the three highest-traffic pricing pages |
| [tests/lib/tier-limits.test.ts](../tests/lib/tier-limits.test.ts) | unlock and InMail entitlement gates |
| [tests/api/employer-quota.test.ts](../tests/api/employer-quota.test.ts) | quota key derivation and overlap |

The pricing-config test is the one that catches the specific mistake this config invites: dollars and Stripe cents are two independent literals, so an edit that updates `postingPrice` and forgets `stripePriceInCents` would charge a number no page displays.

Webhook behaviour is still covered end to end rather than in unit tests, via the Stripe CLI listener against a local checkout. Run that before any webhook refactor.

---

## 10. Operations

### 10a. Changing a price

1. Edit both the dollar value and the cents value in `lib/config.ts`.
2. Run `npx vitest run tests/lib/pricing-config.test.ts`. It fails if the two disagree.
3. Grep for the number as a literal across `app/`, `components/`, and `lib/`. There should be no hits.
4. No Stripe dashboard work is required: checkout uses inline `price_data`, not a Price catalog.
5. Sessions already open at the old price complete at the old price. That is correct and expected.

### 10b. Turning the guarantee off

Set `config.firstPostGuarantee = false`. Then verify the promise is gone from pricing, for-employers, the post-job funnel, checkout, the confirmation email, and terms. The static regression test asserts the copy is gated; it does not assert the flag's value, so it stays green either way.

### 10c. What to watch

| Signal | Meaning |
|---|---|
| `processed_stripe_events` count against the Stripe dashboard event count | a large gap means dropped webhooks |
| `job_charges.amount_cents` outside the three configured amounts | a coupon or a manual override, worth a look |
| 5xx rate on `/api/webhooks/stripe` | should sit at zero given idempotency |
| 410 rate on `/api/jobs/post-free` | a stale client still pointing at the retired route |
| Ratio of `priceKind='first'` to `'standard'` checkouts | how much of the volume is new employers against returning ones |
| Guarantee claims against first posts sold | whether the applicant threshold is set where it should be |
| `processed_stripe_events` table size | grows without bound, plan a cleanup |

### 10d. Stripe checklist

- Webhook endpoint registered for the production origin
- `STRIPE_WEBHOOK_SECRET` in the deployment matches the dashboard signing secret
- Event filter includes `checkout.session.completed` and `charge.refunded`
- Public details, branding, and customer emails configured in the dashboard

---

## 11. Deferred

| Item | Revisit when |
|---|---|
| Stripe Price catalog instead of inline `price_data` | enabling Stripe Tax, adding a currency, or running a price experiment |
| Self-serve bulk packs | there is repeat multi-post demand to serve. Spec is in the audit doc. |
| Boost or spotlight upsell | there is an upsell path worth building above the base post |
| Stripe Tax and a purchase-order path | a buyer who cannot pay by card asks |
| Per-organization verification | the discount is being farmed across registered shell domains |
| Email-change endpoint | one is built. It must call `evaluateEmailChange`, which is written and tested. |
| Automated guarantee fulfilment | manual refunds stop being manageable |

---

## Glossary

| Term | Meaning here |
|---|---|
| **First post** | The one discounted post an employer identity gets, ever. `priceKind='first'`. |
| **Standard post** | Every post after the discount is spent. `priceKind='standard'`. |
| **Employer identity** | The set of quota keys built from the session: account id, signup domain, locked company name. Not the form. |
| **Quota key collision** | A prior discounted post claimed one of this poster's keys. Removes the discount. Never refuses the post. |
| **Active posting** | `isPublished=true` and (`expiresAt` is null or in the future), linked to a user through `EmployerJob`. |
| **`hasFullAccess`** | Per-candidate gate: admin, or a previous unlock, or an active featured post. Lifetime once granted. |
| **`JobCharge`** | One row per Stripe checkout. The invoice ledger, including refunds. |
| **`ProcessedStripeEvent`** | Webhook idempotency log. Insert then process; a unique violation means already handled. |
