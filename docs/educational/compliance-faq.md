# Compliance FAQ

> **Audience:** founder fielding questions from customers, regulators, contractors, and curious employees.
> **Last updated:** 2026-04-30.
> **Format:** the question, the short answer, then where the source-of-truth lives.

These are the questions you'll get asked over and over. Read once, refer back when needed.

---

## "Are we GDPR-compliant?"

**Yes, aligned. Not certified — there's no such thing as a GDPR certificate.**

GDPR is a regulation, not a checklist with a stamp at the end. Compliance is demonstrated by your records:

- The privacy policy at `/privacy` discloses every required item (data categories, purposes, legal basis, retention, recipient list, cross-border safeguards, rights, supervisory authority).
- The DPIA at `docs/dpia.md` records the Art. 35 self-assessment.
- The audit trail at `audit_logs` table records every DSAR, deletion, export, and admin action.
- The sub-processor list at `/sub-processors` discloses every vendor we share data with.
- We honor GPC and DNT signals and respect EU/UK/CH/CA/BR/AU strict-region opt-in rules.

If a regulator asks for evidence, we hand them this set. That **is** GDPR compliance for a controller our size.

**Source-of-truth:** [docs/compliance-audit.md](../compliance-audit.md), [docs/dpia.md](../dpia.md), `app/privacy/page.tsx`, `app/sub-processors/page.tsx`.

---

## "Are we CCPA / CPRA compliant?"

**Yes.** Specifically:

- We honor the **Global Privacy Control** signal — when a Californian's browser sends `Sec-GPC: 1`, we treat it as a binding opt-out (no banner, no analytics, no marketing).
- We have a public **/do-not-sell** page that lets a user opt out of "sale or sharing" with one click on this device.
- Privacy policy §14 lists all CCPA rights and gives users a 45-day SLA route via the **/data-request** form.
- We don't sell personal information for money. Loading analytics meets the broader CPRA "sharing" definition, which is precisely why the opt-out + GPC honor matters.

**Source-of-truth:** `middleware.ts` (GPC + region detection), `app/do-not-sell/page.tsx`, `app/api/data-request/route.ts`.

---

## "Do you have SOC 2?"

**Not yet.** Honest answer: SOC 2 Type 1 takes ~90 days and ~$15-20k once we commit to it. Most of the controls are already in place — see `docs/compliance-audit.md` for the gap analysis. We trigger the audit the moment an enterprise customer requires it.

If a customer asks you to "share what you have today," you can offer:
- Privacy policy + sub-processors + Trust Center page
- Incident-response runbook
- DPIA self-assessment
- The 25-gap audit closure evidence

90% of SMB customers accept this in lieu of a SOC 2 report. Enterprise procurement won't.

**Source-of-truth:** [docs/educational/when-to-expand-infra.md](when-to-expand-infra.md) Tier 3 §10, `app/security/page.tsx` compliance posture table.

---

## "Are you HIPAA compliant?"

**Not applicable, and we don't pretend otherwise.**

HIPAA covers Protected Health Information (PHI) under a Covered Entity / Business Associate relationship. We are neither — we run a job board, not a clinical record system. Job seekers may *voluntarily* mention health-related items in their resumes, but we don't parse them as clinical data and we don't have a Business Associate Agreement (BAA) with any healthcare provider.

If we ever receive a customer request to handle PHI under a BAA, the answer is **no until we re-architect** for HIPAA — full encryption controls, access logging at the row level, BAAs with every sub-processor (Stripe and Resend specifically don't sign general BAAs).

**Source-of-truth:** `app/security/page.tsx` compliance posture table, `app/privacy/page.tsx` §13 sensitive data.

---

## "What's our incident response plan?"

**Documented in `docs/incident-response.md`.** Highlights:

- 30-minute triage protocol (acknowledge, stop bleeding, snapshot logs, open ticket, assign roles)
- Severity classification (Critical / High / Medium / Low) drives the notification clock
- 72-hour GDPR notification commitment for incidents affecting EEA residents
- 45-day CCPA notification window for California residents (500+)
- Severity-specific playbooks for the most likely scenarios (Stripe webhook leak, Supabase service-role leak, resume bucket misconfiguration, account takeover)
- Post-incident review template — every incident gets archived with timeline, RCA, and action items

**Source-of-truth:** [docs/incident-response.md](../incident-response.md).

---

## "Where is our data stored, and is it encrypted?"

- **Database (Supabase Postgres):** `us-east-1`. Encrypted at rest by default. TLS 1.3 in transit.
- **Resume files (Supabase Storage):** Same region. Private bucket — accessed only via 1-hour signed URLs.
- **Payments (Stripe):** Card data captured on Stripe-hosted Checkout pages. Never touches our servers (PCI-DSS SAQ-A scope).
- **Email (Resend):** Recipient + content at Resend's infrastructure. We send only the message data they need.
- **Analytics (Google):** Aggregated usage data with anonymized IPs. Stored at Google's discretion under their DPA, retention set to 14 months (GA4's shortest setting).
- **Errors (Sentry):** When client init is wired (Tier 1 trigger). Error stack traces with PII scrubbed.

For EEA→US transfers, we rely on Standard Contractual Clauses (SCCs) included in each sub-processor's DPA. Documented at `/sub-processors`.

**Source-of-truth:** `app/sub-processors/page.tsx`, `app/privacy/page.tsx` §16, `docs/dpia.md` §2.3 + §4.6.

---

## "What happens to a user's data when they delete their account?"

1. They click "Delete Account" in settings → `DELETE /api/auth/delete-account`
2. We **soft-delete**: set `deleted_at = now()`, `purge_at = now() + 30 days`, hide profile from search, suppress email
3. The user can restore via `/api/auth/restore-account` during the 30-day grace
4. After 30 days, the daily `purge-soft-deleted` cron hard-deletes:
   - The `UserProfile` row (cascades through applications, messages, saved jobs, etc.)
   - The Supabase Auth identity (so the email becomes re-registerable)
   - Logs the purge event in `audit_logs` for the audit trail

**Source-of-truth:** `app/api/auth/delete-account/route.ts`, `app/api/auth/restore-account/route.ts`, `app/api/cron/purge-soft-deleted/route.ts`.

---

## "What happens to inactive users?"

- 23 months of no `last_seen_at` activity → daily `purge-inactive-users` cron sets `purge_warning_email_sent_at` and (when wired) sends the warning email
- 30 days post-warning → cron soft-deletes (sets `deleted_at`, `purge_at`)
- 30 days after that → `purge-soft-deleted` hard-purges
- Total dormancy → hard-delete: ~25 months

GDPR storage-limitation principle: don't keep PII longer than the purpose requires. 25 months is comfortably inside enterprise expectations.

**Source-of-truth:** `app/api/cron/purge-inactive-users/route.ts`.

---

## "Can I get a copy of my data?"

Two paths:

1. **Self-service:** Logged-in users can hit `/api/profile/export` from their settings page → returns structured JSON with profile, applications, certifications, work experience, education, screening answers.
2. **Formal DSAR:** `/data-request` form → goes into `data_requests` table with a 30-day GDPR / 45-day CCPA deadline computed at insert time.

Both flows write an `audit_logs` row so we can prove we responded.

**Source-of-truth:** `app/api/profile/export/route.ts`, `app/api/data-request/route.ts`, `app/data-request/page.tsx`.

---

## "What sub-processors do you use?"

The current list lives at `/sub-processors` (also `app/sub-processors/page.tsx`). As of writing:

| Vendor | Purpose | Location |
|---|---|---|
| Vercel | Hosting + edge + Speed Insights | US |
| Supabase | DB + auth + storage | us-east-1 |
| Stripe | Payments (hosted Checkout) | US/EU |
| Resend | Email | US |
| Google Analytics 4 | Aggregate analytics | Global, US |
| Sentry | Error monitoring (build-time wired only) | US |
| Cloudmersive | Resume virus scanning | US |

Each row links to the vendor's DPA + privacy policy. This list is maintained as part of the public privacy commitment — we notify customers 30 days before adding a new sub-processor.

**Source-of-truth:** `app/sub-processors/page.tsx`, [docs/dpia.md](../dpia.md) §2.3.

---

## "Is the AI candidate matching legal?"

GDPR Art. 22 grants a right not to be subject to a decision based **solely** on automated processing that produces legal or similarly significant effects. Our matching is **decision-support, not decision-making** — the score influences which candidates an employer reviews first, but humans (the employer) make the actual hiring call.

Privacy policy §12 discloses the processing and gives users a route to object via `/data-request` (request type: `object`). DPIA §5 risk R3 + §6 records the bias mitigations (EEO fields excluded from the model input, annual fairness review committed for v1.1).

**Source-of-truth:** `app/privacy/page.tsx` §12, [docs/dpia.md](../dpia.md) risks R3 + R5.

---

## "Why don't you have a cookie banner that pre-checks Accept All?"

GDPR Art. 4(11) defines consent as "freely given, specific, informed and unambiguous indication... by a clear affirmative action." The Court of Justice of the European Union (CJEU) ruled in *Planet49* (October 2019) that pre-ticked boxes are not valid consent.

So in the strict region (EEA + UK + CH + CA + BR + AU), default-checked toggles would **be a GDPR violation**. The "Accept All" button is the one-click path to flip everything on with a clear affirmative action — that's the legally-compliant version of pre-checked.

For US users (except California with GPC), we already auto-grant analytics consent and **suppress the banner entirely**. They get zero friction.

**Source-of-truth:** `components/CookieConsent.tsx`, `lib/consent.ts`, [docs/educational/cookies-and-tracking.md](cookies-and-tracking.md) §6.

---

## "What if someone reports a vulnerability?"

`security@pmhnphiring.com` — published on `/security`. We commit to:

- Acknowledge within 1 business day
- Triage update within 5 business days
- Not pursue legal action against good-faith researchers
- Public credit if the reporter wants it

We don't currently run a paid bug bounty. If/when we do, the platform of choice is HackerOne (free public program tier). Trigger: Tier 2-3 in [when-to-expand-infra.md](when-to-expand-infra.md).

**Source-of-truth:** `app/security/page.tsx` §"Reporting a vulnerability".

---

## "How do you handle children's data?"

We don't accept users under 18. Privacy policy §8 states this explicitly. There's no age verification gate beyond the policy statement — the realistic risk of an under-18 PMHNP applicant is zero given the credential requirements.

If we ever expanded to a niche where minors could plausibly use the service (e.g., student internship portal), we'd need a COPPA-compliant age gate before collecting any data.

**Source-of-truth:** `app/privacy/page.tsx` §8, [docs/dpia.md](../dpia.md) risk R12.

---

## "What's the breach notification timeline?"

| Region | Notification clock | Triggers |
|---|---|---|
| EEA / UK | **72 hours** to the Lead Supervisory Authority | Any breach "likely to result in risk" |
| California | "Most expedient time" + 45-day right-to-know window | Loss of unencrypted personal info of 500+ residents |
| US (other states) | Varies — 30 days typical | State-specific breach notification statutes |

The runbook at `docs/incident-response.md` operationalizes these. The shortest applicable clock wins.

**Source-of-truth:** [docs/incident-response.md](../incident-response.md) §4 (notification matrix).

---

## "How are we going to know about a breach in the first place?"

Today, primarily via:
- Sentry alerts (when client init wired — Tier 1 trigger)
- Vercel logs / Supabase Logs Explorer
- A user / researcher contacting `security@pmhnphiring.com`
- Stripe / Resend / Supabase notifying us of an issue on their side

The runbook `§7 Pre-incident readiness checklist` lists the items that need to be verified quarterly. That's the closest thing we have to "monitoring for breaches" today.

When we move to Tier 2-3, dedicated SIEM / log aggregation becomes worth the spend.

**Source-of-truth:** [docs/incident-response.md](../incident-response.md) §7.

---

## When in doubt

If a question doesn't have a clear answer here, the priority order to consult is:

1. The **public-facing** docs first (`/privacy`, `/sub-processors`, `/security`, `/do-not-sell`, `/data-request`) — those are what we've publicly committed to.
2. The **internal** policies (`docs/compliance-audit.md`, `docs/dpia.md`, `docs/incident-response.md`) — those are what we've documented internally.
3. The **code** — the source-of-truth for actual behaviour.

If those three disagree, **the public commitment wins** and we update internal docs + code to match. Never the other way around.
