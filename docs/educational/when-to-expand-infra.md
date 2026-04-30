# When to Expand Infrastructure

> **Audience:** founder making "do I spend on this yet?" decisions.
> **Last updated:** 2026-04-30.
> **Premise:** Premature investment costs money + slows you down. Late investment costs deals + breach risk. This doc tells you the actual trigger for each item.

The single biggest mistake at this stage is buying enterprise tooling before enterprise customers — Vanta at month 1, dedicated DPO at 50 users, multi-region at 5 paying customers. Don't.

The second biggest mistake is hitting a customer-blocking limit and discovering you needed something three weeks ago — first big ad spend with no CAPI, first SOC 2 ask with no audit trail, first breach with no runbook.

This doc gives you the trigger for each.

---

## How to read the tiers

I've split investments into 4 tiers by cost / scale. Each tier has clear **triggers** (what condition flips it on) and a **rough cost band**. Move up a tier only when at least one trigger is hit, not on a calendar.

| Tier | Spend / month | Stage | What's in it |
|---|---|---|---|
| **0** | $0 | Today | What we already have |
| **1** | $50–200 | 100–1000 DAU or first paying employer customers | Paid Cloudmersive, Supabase Pro, paid Sentry, observability basics |
| **2** | $500–2000 | 1000+ DAU, paid acquisition, first enterprise pipeline | sGTM + CAPI, paid analytics tier, secrets manager, formal pen test |
| **3** | $5000+ | First enterprise contract, regulated customers, $1M+ ARR | SOC 2 Type 1 → Type 2, cyber insurance, contract DPO, compliance automation platform |

---

## Tier 0 — what you already have ($0)

This is your current state. Don't touch it unless a Tier 1 trigger fires.

| Capability | Source |
|---|---|
| Hosting + edge | Vercel free / hobby tier |
| Database | Supabase free tier (500 MB DB, 50k MAU) |
| Auth | Supabase Auth (free) |
| Email | Resend free tier (3k emails / month) |
| Payments | Stripe (no monthly cost; per-transaction fees) |
| Analytics | GA4 (free) + Vercel Speed Insights (~free at low traffic) |
| Error monitoring | Sentry build-time wired only (no runtime cost) |
| Virus scan | Cloudmersive free tier (800 scans/month) — currently fail-open at low scale |
| Privacy compliance | Sprint 1–4 work, all in code |
| Incident response | `docs/incident-response.md` runbook |
| DPIA | `docs/dpia.md` self-assessment |

**Capacity ceiling for Tier 0:** roughly 1k MAU, 25 resume uploads / day, 3k emails / month, no ad spend. You'll hit one of these before the others.

---

## Tier 1 — small spend, real protection ($50–200/month)

Move here when **any** of these trigger:

### 1. Paid Cloudmersive virus scan — $20–50/month

**Trigger:** Any of these:
- Resume uploads exceed 25/day (you'd blow the free tier within 7-10 days each month)
- You see scanner failures in production logs
- A customer asks "do you scan files?" and you want to honestly say "yes, every time"

**Why:** Free tier is 800 scans/month. Past that, scans fail unscanned. Paid tier (Standard plan) is ~25k scans for $50/month — comfortable for tens of thousands of users.

**When you upgrade:** flip `VIRUS_SCAN_FAIL_OPEN=false` in Vercel — paid tier reliability makes fail-closed the right posture again.

### 2. Supabase Pro tier — $25/month

**Trigger:** Any of:
- Database approaches 500 MB
- Active users (MAU) approaches 50k
- You need point-in-time recovery beyond 7 days
- You need a daily Postgres backup off-platform (Pro adds it)

**Why:** Free tier is generous but lacks PITR + restoration controls that compliance audits care about. Pro also unblocks read replicas if you ever need them.

### 3. Resend Pro tier — $20/month

**Trigger:** Outbound email exceeds 3k/month consistently. Job alerts + transactional + nudges add up faster than you'd think.

**Why:** Free tier silently throttles past quota. Pro gives 50k/month + better deliverability features.

### 4. Sentry runtime client — $26+/month

**Trigger:** Any of:
- Your error volume becomes hard to triage from logs
- You're spending >2 hours/week debugging issues without a stack trace
- A customer reports a bug you can't reproduce

**Why:** Right now Sentry is build-time wired only — meaning errors aren't actually being collected on the client. Wiring `sentry.client.config.ts` would change that. Free tier of Sentry covers ~5k errors/month, which is enough for early stage.

**Note:** Sentry is currently classified as fully gated by consent in our trust center copy. When you wire client init, audit gap #10 needs a re-tick to confirm the client SDK respects consent (Sentry has a built-in `beforeSend` hook for this).

### 5. Cloudflare in front of Vercel — free

**Trigger:** Any of:
- A scraping bot becomes a problem
- DDoS attempt
- You want to add custom firewall rules

**Why:** Cloudflare's free tier gives you bot mitigation, rate-limiting at the edge, and additional DDoS protection. Setting it up is a DNS change + 30 minutes.

---

## Tier 2 — paid acquisition + scale ($500–2000/month)

You hit this when paid ads or enterprise pipeline starts.

### 6. Server-side tagging (sGTM) + Conversions API (CAPI) — ~$50–200/month

**Trigger:** **You commit to a paid ad budget of $1k+/month.** Don't do this earlier — it's wasted setup.

**Why:** Without CAPI, attribution from Safari and Firefox visitors is garbage. You'll over-pay for ads on platforms whose conversion tracking is broken without it. With CAPI:
- Server-to-server conversion events
- Recovers ~15-30% of attribution lost to browser blocking
- Future-proofs against the rest of third-party cookie deprecation

**What to set up:**
- A subdomain like `tag.pmhnphiring.com` pointing to a Google Tag Manager *server* container
- Vercel can host this directly via a small API route, or use Google Cloud Run (~$0-50/month at low scale)
- Send GA4 events through the server container instead of directly from the browser
- Configure Meta Conversions API + Google Enhanced Conversions to receive events from the same server

**Effort:** ~1 day setup, then ongoing ~1 hour/month tuning.

See `docs/educational/cookies-and-tracking.md` §8 for context on why this matters.

### 7. Secrets manager — $0–50/month

**Trigger:** Team grows beyond 1–2 people, OR you have >20 secrets to manage.

**Options:**
- **Doppler** — startup-friendly, free for small teams, ~$10/user/month above
- **1Password Secrets Automation** — if you already use 1Password
- **HashiCorp Vault** — heavyweight; skip until much later

**Why:** Right now `.env`, `.env.local`, and Vercel env are all your secret stores. That works for a solo founder. The moment a contractor needs prod access, you need something with rotation, audit log, and revoke-on-leave.

### 8. Pen test — $5–15k one-time

**Trigger:** First **before** SOC 2 audit. Or whenever a customer's RFP requires it.

**Options:**
- **Cobalt** — pen-test-as-a-service, ~$8k for a small scope
- **HackerOne** — public bug bounty (free, but volume of low-quality reports)
- **Synack** — managed marketplace, similar to Cobalt
- Local boutique firms — sometimes cheaper for early-stage

**Why:** SOC 2 auditors don't strictly require a pen test for Type 1, but customers reading your SOC 2 report ask for one. It also catches things automated scanners miss.

**What to scope:** The job board public surface, the employer dashboard, the API. Not the marketing site.

### 9. Compliance automation platform (Vanta / Drata) — $8–15k/year

**Trigger:** First enterprise prospect asks for SOC 2. Sign up the day they ask.

**Why now, not earlier:** These platforms work by continuously verifying ~120 controls. Verification is only useful if there's an auditor about to read it. Subscribing 6 months early just burns money.

**My pick:** Drata for sub-50-employee startups. Vanta if you're already in the Vercel/Stripe ecosystem (their integrations are well-tested). Secureframe if you want the cheapest credible option.

---

## Tier 3 — enterprise customer territory ($5000+/month, real money)

Only spend here when **revenue from enterprise customers is funding it**.

### 10. SOC 2 Type 1 audit — $8–20k one-time

**Trigger:** First enterprise prospect either:
- Sends you a questionnaire that has "SOC 2 Type 1 or 2" as a hard pass/fail field
- Is in the procurement stage with a contract that requires it
- ARR is approaching $500k and you're in active sales conversations

**What it actually is:** A CPA firm verifies that your controls (the things you claim to do — encryption, access reviews, incident response, backup tests) were really in place on a specific date. They write a report you can hand to customers.

**Path:**
1. Sign up with Drata or Vanta (~$10k/year)
2. Pick the Trust Service Criteria. Minimum: **Security**. For us, also **Confidentiality** and **Privacy**.
3. Auditor: Johanson Group is the most startup-friendly (~$8k for Type 1). A-LIGN, Schellman are bigger names but more expensive.
4. ~90 days from start to report.

### 11. Cyber insurance — $1–5k/year

**Trigger:**
- Customer contract requires it (common at Fortune 1000)
- ARR > $500k
- You start handling sensitive data at higher volume

**What it covers:** First-party costs (notification expenses, forensics, business interruption) + third-party liability (regulator fines, customer lawsuits).

**Brokers worth talking to:**
- **Vouch** — startup-focused, all online
- **Embroker** — larger SaaS, more options
- **Coalition** — bundles security tools with insurance

Premiums depend on your stack and revenue. Expect $1–3k/year at our stage.

### 12. SOC 2 Type 2 audit — $20–40k

**Trigger:** Enterprise customer asks for "Type 2" (which they will, after seeing Type 1).

**What it actually is:** Type 1 says "controls were in place on date X." Type 2 says "controls *operated* correctly across a period of 3-12 months." It needs an observation window, so plan for it 6-12 months after Type 1.

**Cost trap:** Auditor fees are ~2× Type 1 because they sample evidence over the period. Drata/Vanta annual fee continues. Plan for $25–35k/year ongoing.

### 13. Hire a Data Protection Officer (DPO) — contract $500–2k/month, FTE much more

**Trigger:** GDPR Art. 37 says you **must** appoint a DPO if any of:
- You're a public authority (no)
- Core activities require **regular and systematic monitoring** of data subjects on a **large scale** — at our current volume, no
- Core activities involve **large-scale processing of special categories** under Art. 9 — borderline; depends on EEO data volume

**Practical answer:** As long as the founder is the privacy decision-maker and we can document who has authority to approve DPIA findings, we're fine. The day a regulator asks "who is your DPO?" we appoint someone — typically a fractional / virtual DPO contractor for $500–2k/month.

**Vendors:** Securiti, OneTrust DPaaS, Privado.ai. Don't sign before you actually need one — they require an annual commitment.

### 14. Multi-region deployment — usually free on Vercel + paid on Supabase

**Trigger:** EU enterprise customer demands data residency. Or a regulator question about cross-border transfers gets harder than the SCCs we already document.

**What changes:**
- Supabase Read Replicas in EU region (paid feature)
- Vercel Edge Network already serves EU traffic from EU edge nodes — no change needed
- Decision needed: do you also store **writes** in EU? That's a much bigger lift (multi-master replication, consistency model changes).

For most B2B SaaS, "data is encrypted at rest, primary region is US, EU traffic served via EU edge with EU residency for cached responses" is enough. Full data residency is a tier above that.

---

## Decision shortcut

When in doubt, ask these three questions:

1. **Will not having this lose me a deal that's currently in pipeline?** → Buy it now.
2. **Will not having this cause a compliance failure if a regulator audits us tomorrow?** → Buy it now.
3. **Is this premature optimization for a problem I might never have?** → Skip it.

If you can't answer "yes" to 1 or 2, don't move up a tier.

---

## Tracker for triggered investments

When you hit a trigger, log it here so future-you remembers when each thing happened.

| Item | Tier | Date triggered | Date implemented | Owner | Notes |
|---|---|---|---|---|---|
| Paid Cloudmersive | 1 | — | — | — | When uploads >25/day |
| Supabase Pro | 1 | — | — | — | When DB >450 MB or MAU approaching 40k |
| Resend Pro | 1 | — | — | — | When outbound mail >2.5k/month |
| Sentry client | 1 | — | — | — | When debug velocity drops |
| Cloudflare front | 1 | — | — | — | At first scrape problem |
| sGTM + CAPI | 2 | — | — | — | When paid ad budget commits |
| Secrets manager | 2 | — | — | — | When 2nd team member added |
| Pen test | 2 | — | — | — | Before SOC 2 audit |
| Drata / Vanta | 2 | — | — | — | First SOC 2 ask |
| SOC 2 Type 1 | 3 | — | — | — | First enterprise hard requirement |
| Cyber insurance | 3 | — | — | — | First contract requiring it |
| SOC 2 Type 2 | 3 | — | — | — | After Type 1 ships |
| DPO appointment | 3 | — | — | — | Regulator question or scale trigger |
| Multi-region | 3 | — | — | — | EU enterprise demand |

Update this table as you hit each trigger. It becomes your audit trail of "we knew, we waited until the right moment, here's the evidence."
