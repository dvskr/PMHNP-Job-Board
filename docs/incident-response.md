# Incident Response & Breach Notification Runbook

> **Owner:** Privacy & Security lead (currently the founding engineer).
> **Last updated:** 2026-04-30
> **Reference:** GDPR Art. 33 (72-hour notification), CCPA §1798.82, HIPAA-adjacent practices.

This runbook is the single page anyone on call should reach for when they suspect a security incident or data breach. Steps are sequential — work top-down.

---

## 1. Define what counts

We treat the following as a **reportable incident** that triggers this runbook:

- Confirmed unauthorized access to the Supabase database, the Vercel project, the Stripe dashboard, or the Resend account.
- Resume / profile data exposed to a party that should not have it (public bucket misconfiguration, sub-processor incident, leaked share link).
- Credential leak suspected from any sub-processor (`Vercel`, `Supabase`, `Stripe`, `Resend`, `Google Analytics`, `Sentry`).
- Successful account takeover (someone else logging in as a real user).
- Any DDoS / availability incident lasting more than 60 minutes.
- A regulator, customer, or security researcher contacts us alleging a breach.

Things that **don't** trigger this runbook (handle as a normal bug):

- Single-user issue with no data exposure (e.g. a user can't log in).
- Failed brute-force attempts that the existing rate limits absorbed.
- A vulnerability disclosed without evidence of exploitation — track in the issue tracker as `security`.

---

## 2. The first 30 minutes (Triage)

| Step | Action |
|---|---|
| 1 | **Acknowledge.** Open a private Slack thread or DM with the on-call engineer + privacy lead. Do not discuss in public channels yet. |
| 2 | **Stop the bleeding.** If the source is known and active, kill it: rotate the leaked secret, disable the affected endpoint via Vercel env flag, or take the affected feature offline. |
| 3 | **Snapshot.** Capture HTTP logs (Vercel), DB query logs (Supabase Logs Explorer), and Sentry traces from the last 24h to a private S3 bucket or Drive folder. **Do not modify them after capture.** |
| 4 | **Open the incident ticket.** GitHub private security advisory (`Security → Advisories → New draft`) or a tracked private repo issue. Title: `INCIDENT YYYY-MM-DD <one-line>`. |
| 5 | **Assign roles.** Incident Commander (decisions), Communications Lead (drafts external messages), Technical Lead (digs into root cause). For us-of-one, write down which hat you're wearing each hour. |

---

## 3. Classification (within 4 hours)

Classify the incident along two axes — these drive the notification clock.

### Severity

- **Critical** — confirmed exfiltration of resumes, passwords, or payment data; full DB read; admin account takeover.
- **High** — confirmed exposure of email + name pairs; partial DB read; sub-processor breach affecting our data.
- **Medium** — limited PII leak (single user, single record); access without confirmed exfiltration.
- **Low** — vulnerability with no evidence of exploitation; non-PII data exposure.

### Affected populations

- EEA / UK residents (GDPR clock — 72 hours)
- California residents (CCPA — "expedient" with reasonable diligence)
- All other users (commercial best practice — 7 days)

The shortest applicable clock wins.

---

## 4. Notification matrix

| Severity / Region | EEA / UK | California | Rest of world |
|---|---|---|---|
| **Critical** | ICO / DPA in 72h + affected users without undue delay | AG + affected users in 45 days | Affected users within 7 days |
| **High** | ICO / DPA in 72h if "risk to rights"; users if "high risk" | AG + users in 45 days if covered data | Users within 14 days |
| **Medium** | Document but no notification unless risk escalates | Document; notify only if 500+ residents | Document only |
| **Low** | Document only | Document only | Document only |

### Where to notify (regulators)

- **EEA / UK:** [Lead Supervisory Authority via the One-Stop-Shop](https://edpb.europa.eu/about-edpb/about-edpb/members_en) — for a US-based controller without an EU lead, contact the DPA where the affected residents live. Default to the [UK ICO](https://ico.org.uk/for-organisations/report-a-breach/) and [Ireland's DPC](https://www.dataprotection.ie/) since most EU traffic routes through Vercel's Frankfurt edge.
- **California AG:** Submit via [oag.ca.gov/privacy/databreach](https://oag.ca.gov/privacy/databreach/reporting) when 500+ Californians are affected.
- **Other US states:** [Perkins Coie state law tracker](https://www.perkinscoie.com/en/news-insights/security-breach-notification-chart.html) is the practical reference.
- **Health-data adjacency (HIPAA):** we are not a Covered Entity. If a Covered Entity customer ever shares PHI with us under a BAA, additional 60-day notification rules apply — engage counsel immediately.

### Sub-processor incidents

If the source is a sub-processor, get their incident report in writing **before** notifying our users. Pin the Slack thread; their RCA timeline often extends ours.

---

## 5. User notification template

When user notification is required, send via Resend from `privacy@pmhnphiring.com`. Avoid marketing-style language.

```
Subject: Security incident affecting your PMHNP Hiring account

We are writing to inform you of a security incident we became aware of on
<DATE>. We believe the following information of yours may have been
affected: <SHORT BULLET LIST OF DATA TYPES>.

What happened: <2-3 sentence neutral description, no jargon>

What we are doing: <containment, sub-processor coordination, 3rd-party
investigators, additional monitoring>

What you should do: <password reset link / credit-monitoring / specific
guidance — only what is genuinely useful>

We sincerely apologize for the exposure and the worry it causes.
You can reach us at privacy@pmhnphiring.com with any question. The full
incident report will be linked from /security-incidents once available.
```

Include the breach reference ID (`INCIDENT-YYYY-MM-DD`) in the body.

---

## 6. Post-incident review (within 30 days)

Structured retro in a private doc:

1. **Timeline** — first observation, containment, mitigation, notification, resolution.
2. **Root cause** — five whys.
3. **What worked** — specific tools, decisions, or people.
4. **What didn't** — gaps in detection, response, or communication.
5. **Action items** — owner, ETA, ticket. Land them.
6. **Were we GDPR-compliant?** — was the 72-hour clock met? If not, why, and what changes prevent recurrence?

Archive the timeline + RCA into `/docs/incidents/INCIDENT-YYYY-MM-DD.md` (private). Keep it for at least 7 years (GDPR/CCPA evidentiary expectation).

---

## 7. Pre-incident checklist (do this *before* you need to)

These are the items that make the runbook executable, not aspirational. Verify quarterly.

- [ ] `privacy@pmhnphiring.com` is monitored and forwards to a real human.
- [ ] On-call rotation documented somewhere shared.
- [ ] Sub-processor list (`/sub-processors`) is current — incident reports are emailed to the contacts on each vendor's DPA.
- [ ] Sentry alert routing → on-call notification.
- [ ] Supabase Logs Explorer access works for at least two team members.
- [ ] Vercel env flags exist for kill-switching: `KILL_SWITCH_API`, `KILL_SWITCH_PUBLIC` (toggling these returns 503 from the relevant routes).
- [ ] We have a static `/security-incidents` page ready to publish status to.
- [ ] Counsel relationship pre-arranged for the inevitable "do we have to notify?" call.
- [ ] Cyber-insurance carrier contact + claim hotline saved offline (paper or password manager).

---

## 8. Severity playbooks (specific)

### Resume bucket misconfiguration → public read

1. Make the bucket private immediately via Supabase dashboard.
2. Audit `getPublicUrl()` callers in `lib/supabase-storage.ts` — convert to signed URLs.
3. Identify exposed file URLs from Supabase storage logs.
4. Crawl with `curl` to confirm the URLs are now 401/403.
5. Notify affected job seekers.

### Stripe webhook secret leak

1. Rotate the webhook signing secret in Stripe dashboard.
2. Update `STRIPE_WEBHOOK_SECRET` in Vercel env. Force redeploy.
3. Replay any missed webhooks from the Stripe Events log.
4. Audit `app/api/webhooks/stripe/route.ts` for IP-based fallback.
5. Stripe doesn't release card data — user notification is usually unnecessary.

### Supabase service-role key leak

1. Rotate the key in Supabase dashboard.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel + GitHub Actions secrets.
3. Audit Supabase Logs Explorer for queries using the leaked key during the exposure window.
4. If queries unrelated to our app appear → escalate to Critical.

### Account takeover

1. Force-logout the affected user via `auth.admin.signOut`.
2. Trigger a password reset email.
3. Audit the user's last 30 days of actions (applications, message threads).
4. If financial data was touched → also rotate Stripe customer reference.
