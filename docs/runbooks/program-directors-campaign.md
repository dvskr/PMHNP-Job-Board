# Program Directors Campaign Runbook

**Created:** 2026-05-12
**Owner:** Sathish Kumar
**Goal:** Convert 4–6 of ~160 PMHNP program directors (PDs) into active distribution partners within 90 days, putting `pmhnphiring.com` in front of ~600–1,200 graduating PMHNPs per cohort and compounding annually.

**Why PDs (not employers) for this campaign:** PDs control the supply side. One PD partnership = 20–50 graduating students per year, multi-year. They have three real pains we can solve (accreditation reporting, understaffed career services, cohort recruitment marketing) — none of which competing job boards address. The pitch is a B2B partnership, not a sales pitch.

**Why now:** The APNA Graduate Programs Directory CSV (`APNA_Graduate_Programs_Directory .csv`) already contains 161 segmented rows with 96 verified emails. Phase 1 (list build) is collapsed from ~15 hours to ~30 minutes of import work.

---

## 1. Success metrics & guardrails

### 90-day targets

| Metric | Wave 1 (77 Tier 1) | Wave 2 (84 Tier 2+3) | Combined |
|---|---|---|---|
| Email open rate | ≥35% | ≥30% | ≥32% |
| Reply rate | ≥10% | ≥7% | ≥8% |
| Reply-with-times scheduling requests | 3–5 | 4–7 | 7–12 |
| Widget installs (live on .edu site) | 1–2 | 2–4 | **4–6** ← primary success metric |
| Bounce rate | <8% | <8% | <8% |
| Spam complaint rate | 0 | 0 | 0 (kill switch) |

### Guardrails

- **Deliverability gate:** SPF, DKIM, DMARC must be valid on `pmhnphiring.com` before Wave 1. Run `dig TXT pmhnphiring.com` and confirm in Resend dashboard. Skipping this is the #1 way to torch the campaign.
- **Send velocity:** Maximum 100 cold emails/day from a single sending domain. Resend's recommendation; exceeding triggers Gmail throttling.
- **Stop-the-bleed thresholds:** If bounce rate >10% or any spam complaint after first 50 sends, **PAUSE and diagnose** before continuing. Do not power through.

---

## 2. Asset inventory

### What we have

| Asset | Status | Location |
|---|---|---|
| APNA directory CSV | ✓ in repo root | `APNA_Graduate_Programs_Directory .csv` (161 rows, 96 valid emails) |
| Shortlinks system | ✓ live | [lib/shortlinks/](../../lib/shortlinks/) — letters f/i/l/x/r/t already wired |
| Email send infrastructure | ✓ live | [lib/email-service.ts](../../lib/email-service.ts), Resend Batch API |
| Email tracking | ✓ live | `EmailBroadcast`, `EmailSend` Prisma models |
| Email templates | ✓ live | `EmailTemplate` model, [lib/email-templates-v2.ts](../../lib/email-templates-v2.ts) |
| Per-recipient attribution | ✗ missing | Need `?r=<lead_id>` query param + click recording |
| Program Director lead table | ✗ missing | Need new `ProgramDirectorLead` Prisma model |
| `p` shortlink letter | ✗ missing | One-line add in [lib/shortlinks/campaigns.ts:9](../../lib/shortlinks/campaigns.ts#L9) |
| `/for-programs` landing page | ✗ missing | New route + copy |
| Embeddable jobs widget | ✗ missing | New `/widget?state=XX&program=YY` route |
| Booking tool | ✓ not needed | Scheduling handled via email reply ("send 2–3 times that work"). Avoids new tool dependency. |

---

## 3. Engineering build (must complete before Wave 1)

> All steps are additive and reversible by reverting the PR. No destructive migrations.

### Step 1 — Add `p` letter to shortlinks (15 min)

File: [lib/shortlinks/campaigns.ts](../../lib/shortlinks/campaigns.ts)

```typescript
export const PLATFORM_BY_LETTER: Readonly<Record<string, string>> = Object.freeze({
  f: 'facebook',
  i: 'instagram',
  l: 'linkedin',
  x: 'x',
  r: 'reddit',
  t: 'threads',
  p: 'program-director', // ← new
})
```

**Verify:** `curl -I https://pmhnphiring.com/r/p1` should 302 to a job slug (uses the same `ACTIVE_CAMPAIGN` fallback). The `p` letter itself just attributes traffic; we'll override the destination via `?dest=` in §3.3.

### Step 2 — Per-recipient tracking (`?r=<lead_id>`) (half day)

Add to [lib/shortlinks/resolver.ts](../../lib/shortlinks/resolver.ts):
- Parse `?r=<lead_id>` from incoming requests
- Write `recipientLeadId` to the existing click-event table
- Preserve the existing redirect behavior

**Verify:** Visit `/r/p1?r=test-lead-abc`, check that the recorded click event has `recipientLeadId = 'test-lead-abc'` and the redirect still works.

### Step 3 — `ProgramDirectorLead` Prisma model (3–4 hours)

Mirror `EmployerLead` ([prisma/schema.prisma:392](../../prisma/schema.prisma#L392)):

```prisma
model ProgramDirectorLead {
  id                    String    @id @default(uuid())
  state                 String
  tier                  String    // "Tier 1" | "Tier 2" | "Tier 3"
  universityName        String    @map("university_name")
  directorName          String?   @map("director_name")
  email                 String?
  emailStatus           String?   @map("email_status") // "Valid" | "Needs Verification" | null
  phone                 String?
  programTypes          String?   @map("program_types") // "DNP; MSN; PMHNP; ..."
  distanceEducation     String?   @map("distance_education")
  programWebsiteUrl     String?   @map("program_website_url")
  linkedInUrl           String?   @map("linkedin_url")
  cohortSize            Int?      @map("cohort_size")
  graduationMonth       String?   @map("graduation_month")
  outreachStatus        String    @default("not_contacted") @map("outreach_status")
  // not_contacted | wave1_sent | replied | booked | installed | declined | bounced
  notes                 String?
  lastContactedAt       DateTime? @map("last_contacted_at")
  nextFollowUpAt        DateTime? @map("next_follow_up_at")
  widgetInstalled       Boolean   @default(false) @map("widget_installed")
  widgetInstalledUrl    String?   @map("widget_installed_url") // the .edu page hosting it
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  @@index([outreachStatus])
  @@index([tier])
  @@index([state])
  @@index([email])
  @@map("program_director_leads")
}
```

Run:
```bash
npx prisma migrate dev --name add_program_director_lead
npx prisma generate
```

### Step 4 — CSV import script (2–3 hours)

Create `scripts/import-program-directors.ts`:
- Read `APNA_Graduate_Programs_Directory .csv`
- Trim whitespace, normalize empty strings to `null`
- Upsert by `(universityName, directorName)` so reruns are idempotent
- Skip rows where both `email` and `directorName` are empty
- Log: rows processed, rows inserted, rows skipped, validation issues

Run once locally, verify counts (expect 161 rows, ~96 with valid emails), then run against prod.

**Verify:**
```bash
npx tsx scripts/import-program-directors.ts --dry-run
npx tsx scripts/import-program-directors.ts
# Expected: ~161 rows imported, 96 with emailStatus='Valid'
```

### Step 5 — `/widget` embeddable jobs feed (1–2 days)

New route: `app/widget/page.tsx`
- Query params: `state` (required, 2-letter), `program` (optional, displays "Curated for {program}")
- Renders a single-purpose page with 10 most-recent active jobs in `state`, sorted by `featured` then `createdAt desc`
- No site chrome (no nav, no footer) — designed for `<iframe>` embedding
- Inline minimal CSS, ~30KB total page weight, no client JS beyond click tracking
- Each job link includes UTM: `?utm_source=widget&utm_medium=embed&utm_campaign=pd-{program-slug}`
- Footer: "Powered by pmhnphiring.com" (small, with logo)
- Set `X-Frame-Options: ALLOW-FROM` and CSP `frame-ancestors *.edu` so it embeds on `.edu` domains

**Verify:**
- `curl https://pmhnphiring.com/widget?state=CA&program=UCSF | head -100` returns minimal HTML
- Visit in iframe locally; confirm no console errors, no layout overflow at 320/600/800px widths

### Step 6 — `/for-programs` landing page (1 day)

New route: `app/for-programs/page.tsx`. Sections:

1. **Hero:** "Help your PMHNP students land their first job."
2. **The offer (3 cards):** (a) Free embeddable jobs widget, (b) Quarterly placement report, (c) Free AI resume reviewer for seniors
3. **Live widget demo:** Render the actual widget for the visitor's geo or default to CA
4. **Sample placement report:** PDF preview image with "Sample — see what your program's quarterly report would look like"
5. **Social proof placeholder:** "Used by program directors at [logos]" — leave blank until first install, then add logos
6. **CTA:** Contact form (name + email + 1-line message) or `mailto:hello@pmhnphiring.com` with prefilled subject. No booking widget — scheduling is handled by email reply.

Static page, no auth, no DB write on visit (just GSC + click tracking via existing analytics).

### Step 7 — Email templates (4 hours)

Register 3 templates in `EmailTemplate`:
- `pd-touch-1-intro` — initial cold email
- `pd-touch-2-follow-up` — day 5 follow-up with widget demo
- `pd-touch-3-soft-bump` — day 12 final soft nudge

Merge tags: `{{director_name}}`, `{{university_name}}`, `{{state}}`, `{{program_types}}`, `{{shortlink}}` (resolves to `/r/p<lead_id>?r=<lead_id>`).

Copy in §6 below.

### Step 8 — DNS deliverability check (30 min + propagation)

```bash
dig TXT pmhnphiring.com | grep -E "v=spf1|v=DMARC"
dig TXT resend._domainkey.pmhnphiring.com
```

Confirm in Resend dashboard: domain shows "Verified" with green checks on SPF, DKIM, and DMARC. If DMARC is missing or set to `p=none`, set it to `p=quarantine` for outbound.

**This is a hard gate. Do not send Wave 1 if any of these fail.**

### Engineering checklist

- [ ] Step 1 — `p` letter added & deployed
- [ ] Step 2 — `?r=` tracking deployed, verified with test click
- [ ] Step 3 — `ProgramDirectorLead` migrated to prod
- [ ] Step 4 — CSV imported, 161 rows in `program_director_leads`
- [ ] Step 5 — `/widget?state=CA` returns valid embeddable HTML
- [ ] Step 6 — `/for-programs` deployed with widget demo + contact form / mailto CTA
- [ ] Step 7 — 3 `EmailTemplate` rows present with merge tags
- [ ] Step 8 — SPF/DKIM/DMARC all verified
- [ ] Smoke test: Send Touch 1 to your own email; confirm it renders, links resolve, tracking fires

---

## 4. Enrichment pass (Week 2, 2–3 hours)

Before sending, enrich the imported leads:

1. **Verify the 9 "Needs Verification" emails** — visit each program's website, find the current director, update email + `emailStatus`.
2. **Find LinkedIn URLs** for the 96 "Valid" PDs. Manual search: `site:linkedin.com/in {director_name} {university}`. Store in `linkedInUrl`. ~1 min per PD = 90 min for 96 records.
3. **Skip Tier 3 enrichment** until Wave 1 results are in.

A VA (Virtual Assistant, $5–15/hr via Upwork or OnlineJobs.ph) can do this in 2 hours for ~$20. Optional — defer if speed matters more than completeness.

---

## 5. Outreach sequence

### Cadence per PD

| Touch | Day | Channel | Trigger to skip |
|---|---|---|---|
| 1 | 0 | Email | — |
| 2 | +5 | Email | Touch 1 replied, bounced, or unsubscribed |
| 3 | +12 | LinkedIn DM | Replied at any prior touch, or no LinkedIn URL |

After Touch 3 with no response, mark `outreachStatus = 'no_response'` and re-evaluate in 90 days.

### Wave plan

| Wave | Audience | Send date | Daily cap |
|---|---|---|---|
| Wave 0 | 5 personal contacts as smoke test | T+0 (post-build) | — |
| Wave 1 | 77 Tier 1 PDs | T+2 (after Wave 0 deliverability green) | 50/day across 2 days |
| Wave 2 | 84 Tier 2 + Tier 3 PDs | T+21 (3 weeks after Wave 1) | 50/day across 2 days |

3-week gap between waves lets us learn from Wave 1 reply data before reusing copy.

---

## 6. Email & DM copy

### Touch 1 — Cold intro email

**Subject line A/B (split Wave 1 50/50):**
- A: `Helping {{university_name}} PMHNP grads find jobs`
- B: `A free tool for your PMHNP students, {{director_name}}`

**Body:**

```
Hi {{director_name}},

I run pmhnphiring.com — a job board built specifically for PMHNPs. Right
now we list ~3,000 active PMHNP roles across the US, and we've noticed
that your students at {{university_name}} are some of the most sought-
after candidates in the {{state}} market.

I'm reaching out because we built something program directors have been
asking for: a free embeddable jobs widget you can drop on your career
services page. It shows your students the most recent PMHNP roles in
{{state}}, updates daily, and we can co-brand it with your program.

Two-minute demo of what it looks like for a peer program:
{{shortlink}}

If it's useful, I'd love to set up a 15-minute call. Either way, I'd
welcome any feedback — we're building this for programs like yours.

Best,
Sathish
Creator, pmhnphiring.com
```

**Notes:**
- "Two-minute demo" links to `/for-programs?utm=pd-touch-1` via the shortlink (per-recipient tracked).
- Sender address: `hello@pmhnphiring.com`. Generic mailbox but the signature (`Sathish, Creator, pmhnphiring.com`) carries the human signal. Lets the inbox transition if someone else takes over outreach later.
- Plain text only for first send to maximize deliverability; switch to HTML in Touch 2 once the relationship is opened.

### Touch 2 — Day 5 follow-up with demo

**Subject:** `Re: {{Touch 1 subject}}` (threading matters for Gmail's Promotions filter)

**Body:**

```
Hi {{director_name}},

Following up on my note last week — I wanted to share what the widget
looks like in practice. Here's a 60-second walkthrough:

{{shortlink}}  →  takes you to /for-programs with the live widget

A few program directors have asked about a quarterly placement report
as well — it tracks where your grads are applying and getting hired
through us, which I know matters for CCNE/ACEN reporting. Happy to set
that up alongside the widget if it's useful.

If you'd like to talk for 15 minutes, reply with 2–3 times that work
for you this week or next and I'll send a calendar invite.

And if this isn't a fit, no worries — just reply with "not interested"
and I'll take you off the list.

Best,
Sathish
```

### Touch 3 — LinkedIn DM (day 12)

**Message (300 char limit):**

```
Hi {{director_name}} — I sent a couple of notes last week about a free
PMHNP jobs widget for {{university_name}}'s career services page. No
worries if it's not a fit; happy to share the placement-report sample
if it's useful for your accreditation file. Either way, hope your
{{semester_or_term}} is going well.
```

Send manually via your LinkedIn personal account, not Sales Navigator (PDs respond better to direct messages from a real person).

### Reply playbook

| If they reply with… | Do this |
|---|---|
| "Tell me more" | 1-paragraph plain answer + offer to talk: "Reply with a few times that work this week and I'll send a calendar invite." Do not send a deck. |
| "Send the embed code" | Send the iframe snippet + a personalized demo URL (`/widget?state={{state}}&program={{slug}}`) |
| "How do I track installs?" | Explain UTM params; offer to add their domain to a whitelist |
| "Can you send the placement report?" | Generate a sample for their state (manual for now); promise quarterly cadence |
| "Not interested" | `outreachStatus = 'declined'`. Reply "Understood, thanks for letting me know." Do not push. |
| Bounce | `outreachStatus = 'bounced'`; if hard bounce, set `email = null`. Re-find via website if Tier 1. |

---

## 7. Tracking & analytics

### Per-PD attribution

Every link in every email/DM resolves through `/r/p<lead_id>?r=<lead_id>`. This records:
- Click timestamp
- Recipient lead ID
- Source platform (email, linkedin)
- Final destination after redirect

### Daily dashboard query (run during waves)

```sql
SELECT
  outreach_status,
  COUNT(*) AS pds,
  AVG(CASE WHEN widget_installed THEN 1 ELSE 0 END) AS install_rate
FROM program_director_leads
WHERE tier = 'Tier 1'  -- swap during Wave 2
GROUP BY outreach_status
ORDER BY pds DESC;
```

### Weekly review cadence

Every Monday during the campaign:
1. Pull funnel metrics (sent → opened → replied → booked → installed)
2. Read any "not interested" replies for pattern signals
3. Review bounced addresses; re-find Tier 1 only
4. Update `outreachStatus` in bulk if needed

---

## 8. Failure modes & response

| Failure | Detection | Response |
|---|---|---|
| Bounce rate >10% in first 50 sends | Resend dashboard | **PAUSE Wave 1.** Diagnose: stale emails, bad domain reputation, or template flagged as spam. Re-verify SPF/DKIM/DMARC. |
| Spam complaint received | Resend webhook | **STOP all sending immediately.** Investigate which template/wave triggered it. Do not resume until root cause fixed. |
| Open rate <20% | After first 30 sends | Subject line is the problem. Pause, A/B test 2 new subjects on next 20 sends. |
| Reply rate <3% | After first 50 sends | The offer or body copy isn't resonating. Pause Wave 1 send schedule, get 2 PD friends to rewrite Touch 1 with you. |
| Zero "reply with times" requests after 50 sends | Day 7 of Wave 1 | The CTA is too soft or too late in the email. Move the scheduling ask into Touch 1, or rewrite Touch 1 to make the offer feel more concrete. |
| Widget renders broken on a real .edu site | Install report | Check `frame-ancestors` CSP, X-Frame-Options. Test in Firefox + Chrome + Safari. Some universities run CSP that blocks all iframes — document workaround (static link instead). |

---

## 9. Open decisions

These must be resolved before Wave 1. None block the engineering build.

| Decision | Options | Recommendation | Status |
|---|---|---|---|
| Sender address | `hello@pmhnphiring.com` vs. personal vs. `partnerships@` | ✓ `hello@pmhnphiring.com` — signature carries the human signal, mailbox is transferable later |
| Wave 1 send dates | T+2 weekday morning, ET vs. PT | Tuesday or Wednesday, 9am ET — PDs check email before classes | ⏳ |
| Touch 1 subject A/B | "Helping…" vs. "A free tool…" | Run both 50/50 on Tier 1; winner goes to Wave 2 | ⏳ |
| Co-branding offer scope | Logo only vs. logo + custom welcome message | Logo only for v1; custom message in Touch 2 if they engage | ✓ logo only |
| Placement report v1 | Real data vs. template with placeholder data | Template with state-aggregate real data; per-program data ships when widget hits 30 days of installs | ✓ template |

---

## 10. Post-campaign review (Day 90)

Schedule a 2-hour review on T+90:

1. **Funnel waterfall:** sent → delivered → opened → clicked → replied → booked → widget installed. Calculate conversion at each step.
2. **Reply-tag analysis:** classify every reply into ~5 buckets (interested, not now, not interested, wrong person, request more info). Look for the dominant objection.
3. **Install pattern:** for the 4–6 (hopeful) installs, what did they have in common? Tier? State? Program type? This shapes Wave 3 targeting.
4. **Cost per install:** total hours × your effective hourly rate + Resend cost ÷ installs = true CAC per program partnership. Compare to expected LTV (cohort_size × 5 years × % who click through ÷ candidate conversion rate).
5. **Decide:** double down (Wave 3 with refined copy), pivot offer (B or C lead), or sunset (move to next channel — employer email blast).

---

## Quick-start: what to do right now

If you're sitting down to execute this for the first time:

1. **Today:** ship Step 1 (`p` letter) and Step 3 (`ProgramDirectorLead` model). 4 hours total.
2. **Tomorrow:** ship Step 4 (CSV import) + Step 8 (DNS check). 3 hours total.
3. **Day 3–4:** ship Steps 5–7 (widget, landing page, email templates). 2.5 days.
4. **Day 5:** Wave 0 smoke test (5 personal contacts).
5. **Day 7:** Wave 1 launch.

Total time from go to first send: **~1 week of focused work.**

---

## Appendix A — Tier definitions (inferred)

The APNA CSV uses Tier 1/2/3 without an embedded legend. Working assumption based on which schools are in Tier 1 (UCSF, Penn, Rush, Vanderbilt):

- **Tier 1 (77):** Established programs at major research universities; largest cohort sizes; highest hire-through rates likely
- **Tier 2 (37):** Mid-sized programs at regional universities; consistent grads
- **Tier 3 (47):** Smaller programs, newer programs, or programs without strong APNA participation

If APNA publishes a tier definition that contradicts this, update the working assumption and re-prioritize.

## Appendix B — Files & locations

| Purpose | Path |
|---|---|
| This runbook | `docs/runbooks/program-directors-campaign.md` |
| Source data | `APNA_Graduate_Programs_Directory .csv` |
| Shortlinks | [lib/shortlinks/campaigns.ts](../../lib/shortlinks/campaigns.ts) |
| Lead model | [prisma/schema.prisma](../../prisma/schema.prisma) (search `ProgramDirectorLead`) |
| Import script | `scripts/import-program-directors.ts` (to be created) |
| Widget route | `app/widget/page.tsx` (to be created) |
| Landing page | `app/for-programs/page.tsx` (to be created) |
| Email templates | DB rows in `EmailTemplate`; reference IDs `pd-touch-1-intro`, `pd-touch-2-follow-up`, `pd-touch-3-soft-bump` |

## Appendix C — Related work

- Employer email blast campaign (separate runbook, future): same `?r=<lead_id>` infrastructure, `e` letter instead of `p`
- Salary insights gated PDF (separate play): the placement report's data ingestion logic informs this
- Social shortlinks playbook (already live): same domain, same tracking, different audience
