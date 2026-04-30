# Data Protection Impact Assessment (DPIA)

> **Controller:** PMHNP Hiring (operated by the founding team)
> **DPIA reference:** DPIA-2026-001
> **Version:** 1.0
> **Date completed:** 2026-04-30
> **Next review:** 2027-04-30 or upon material change to processing
> **Template basis:** UK ICO DPIA template (compatible with Art. 35 GDPR & UK GDPR)
> **Lead reviewer:** Privacy lead (founding engineer)

This DPIA is a self-assessment under GDPR Art. 35. It is required because the processing carried out by PMHNP Hiring meets at least three of the criteria the EDPB lists as triggering mandatory DPIA: systematic profiling, large-scale processing of special categories of data, and innovative use of new technology with personal data.

The processing has been assessed as **medium residual risk** after mitigation. Prior consultation with a Data Protection Authority under Art. 36 is therefore not required, but this DPIA is retained on file for at least 7 years.

---

## Step 1 — Identify the need for a DPIA

### 1.1 Why is the assessment necessary?

Three Art. 35(3) triggers are present:

1. **Systematic and extensive evaluation including profiling that produces effects similar to legal effects.** PMHNP Hiring runs an AI candidate-matching algorithm that scores resumes against employer job postings. Although the algorithm does not _decide_ hiring outcomes, the score directly influences which candidates an employer reviews first.
2. **Large-scale processing of special categories of data.** Voluntary EEO fields (race/ethnicity, disability status, veteran status, gender) are GDPR Art. 9 categories. We also store DEA / NPI numbers — credentialing identifiers under HHS rules.
3. **Innovative use of new technology with personal data.** AI scoring on resume content is a novel processing activity that has not been previously risk-assessed for this user base.

### 1.2 Who is responsible for the DPIA?

| Role | Owner |
|---|---|
| Controller decision-maker | Founder (decisions of last resort on processing) |
| DPIA reviewer | Founding engineer (privacy lead) |
| Consulted parties | None externally — informal review with two healthcare-recruiter advisors prior to launch of AI matching |

---

## Step 2 — Describe the processing

### 2.1 Nature of the processing

PMHNP Hiring is a vertical job board for psychiatric mental health nurse practitioners. We:

- Aggregate public job postings from external sources (Greenhouse, Lever, Workday, Adzuna, etc.) and present them to job seekers.
- Allow employers to post jobs directly on the platform.
- Allow job seekers to create profiles, upload resumes, and apply for jobs.
- Score candidate-job pairs with an AI matching model so employers see most-relevant applicants first.

### 2.2 Scope of the processing

| Data category | Source | Volume estimate | Retention |
|---|---|---|---|
| Account email + name | User signup | All users (~thousands) | While active + 24 months dormancy → soft-delete + 30d → purge |
| Resume file (PDF/DOCX) | Job seekers, optional | ~30% of seekers | While account active; 90d retention post-application |
| Profile fields (headline, license states, salary expectations) | Job seekers, optional | All seekers | Same as account |
| EEO data (race, gender, disability, veteran) | Job seekers, optional | ~20% of seekers | Same as account; redacted in employer views unless `sensitiveDataConsent = true` |
| DEA / NPI numbers | Job seekers, optional | ~10% of seekers | Same as account |
| Job applications (resume + cover letter + screening answers) | Job seekers | All applications | Active job + 90d, then archived |
| Employer billing data | Employers | All employer accounts | 7 years (US tax) |
| Apply-click events | All visitors | All clicks | Aggregate counter forever; per-click row only with analytics consent |
| Analytics events (GA4) | Visitors with consent | Consent-only | 14 months (GA4 minimum) |

### 2.3 Context of the processing

- **Geographic scope:** Primarily US-based users. We accept EEA/UK/CH/CA/BR/AU traffic with strict consent defaults.
- **Relationship with subjects:** Direct (no resellers). Subjects are healthcare professionals — well-educated and broadly aware of data protection.
- **Children:** Out of scope. Users must be 18+. Verified via privacy policy §8 and Supabase Auth signup.
- **Technological context:** Hosted on Vercel (US) + Supabase (us-east-1). Resume files stored privately, accessed only via 1-hour signed URLs. Stripe handles payments (hosted Checkout — card data never touches us).
- **Lawful basis (Art. 6):**
  - Account & application data: contract performance (Art. 6(1)(b))
  - Marketing email & analytics: consent (Art. 6(1)(a))
  - Anti-fraud / billing records: legitimate interest (Art. 6(1)(f))
  - Legal hold during dispute resolution: legitimate interest

### 2.4 Purposes of the processing

1. Connect PMHNP job seekers with relevant openings (primary purpose).
2. Allow employers to receive and review applications.
3. Improve candidate-job matching quality via AI scoring.
4. Send notification, alert, and transactional emails.
5. Process employer payments for job postings.
6. Aggregate platform analytics to improve the product.

---

## Step 3 — Consultation process

### 3.1 Internal stakeholders

- Founding engineer (privacy + technical lead) — primary author.
- Privacy review against the existing audit document `docs/compliance-audit.md`.

### 3.2 External stakeholders

- Two healthcare-recruiter advisors reviewed the AI matching feature pre-launch and confirmed the score is treated as decision-support, not an automated hiring decision.
- No formal consultation with data subjects has been carried out at this stage. _Action:_ a one-question consent capture on signup ("Are you comfortable with our AI suggesting your profile to relevant employers?") will be added in the next product cycle and referenced in DPIA v1.1.

---

## Step 4 — Assess necessity and proportionality

### 4.1 Lawful basis

Mapped per data category in §2.2. Each rests on contract performance, explicit consent, or legitimate interest. No reliance on Art. 6(1)(d) "vital interests" or Art. 6(1)(e) "public task."

### 4.2 Special categories (Art. 9)

EEO fields are processed only with the data subject's explicit consent (Art. 9(2)(a)). The `sensitiveDataConsent` flag on UserProfile records this consent and gates display in employer-facing views. Sensitive fields are never used to train the AI matching model and are never shared with sub-processors beyond what is required to display them in the application form to the applying employer.

### 4.3 Necessity

For each non-essential field we asked: can the purpose be achieved without it? Outcomes:

- **Resume content** — necessary; replaces it would require a hand-built structured-data form that nobody would complete. Retained.
- **EEO fields** — not necessary for matching; useful only for employers reporting voluntary diversity targets. Made strictly optional + separately consented + redacted by default.
- **DEA / NPI** — necessary for clinical roles requiring credential verification. Retained, scoped to applying employer only.

### 4.4 Function creep & retention

- Data collected for account purposes is not reused for marketing without separate consent.
- Retention timers are codified in `app/api/cron/purge-soft-deleted` and `app/api/cron/purge-inactive-users`. The cron is idempotent and audit-logged.
- Sub-processors are listed publicly at `/sub-processors` and reviewed annually.

### 4.5 Data subject rights

Self-service mechanisms in production:

- Account deletion: `/api/auth/delete-account` (soft-delete with 30-day grace)
- Restore: `/api/auth/restore-account` during grace
- Export: `/api/profile/export` (returns structured JSON)
- DSAR for non-self-service requests: `/data-request` form, persisted in `data_requests` table with `dueBy` deadline set at insert
- CCPA "Do Not Sell or Share" page: `/do-not-sell`
- Cookie preferences: footer "Cookie Settings" link
- Unsubscribe: List-Unsubscribe header on every marketing email

### 4.6 International transfers

Most sub-processors are US-based. Transfers covered by Standard Contractual Clauses included in each vendor's DPA, plus encryption in transit + at rest, IP anonymization on GA4, and access controls. Documented in `app/sub-processors/page.tsx`.

---

## Step 5 — Identify and assess risks

For each risk we score Likelihood (1–5) × Severity (1–5) to produce a raw risk score (max 25). Then we list the mitigation in place and re-score the residual risk.

| # | Risk | Subject impact | Likelihood | Severity | Raw |
|---|---|---|---|---|---|
| R1 | Unauthorized access to resume bucket exposes resumes | Identity theft, employment risk | 2 | 5 | 10 |
| R2 | Account takeover via password reset abuse | Identity theft, harassment | 3 | 4 | 12 |
| R3 | AI matching produces biased ranking against protected categories | Discrimination, lost opportunity | 3 | 4 | 12 |
| R4 | EEO data visible to employer without explicit consent | Discrimination, regulatory action | 3 | 4 | 12 |
| R5 | Resume content used to train external models | Loss of control, secondary use | 2 | 4 | 8 |
| R6 | Pre-consent analytics fires on EU traffic | GDPR fine, reputational | 4 | 3 | 12 |
| R7 | DSAR request missed past the 30-day deadline | Regulatory complaint | 3 | 3 | 9 |
| R8 | Soft-deleted account hard-purged before user could restore | Lost data, distress | 2 | 3 | 6 |
| R9 | Sub-processor breach exposes our data | Identity theft, distress | 3 | 4 | 12 |
| R10 | Malware uploaded as resume infects employer device | Indirect harm | 3 | 4 | 12 |
| R11 | Re-identification from purportedly anonymized analytics | Identity exposure | 2 | 3 | 6 |
| R12 | Children sign up and provide PII | COPPA / GDPR violation | 1 | 4 | 4 |

---

## Step 6 — Identify mitigations

| # | Risk | Mitigation in place | Residual L × S | Acceptance |
|---|---|---|---|---|
| R1 | Resume bucket exposure | Private Supabase bucket, signed URLs (1h), no public-read by default. Annual bucket audit on `pre-incident readiness checklist` (incident-response.md §7). | 1 × 5 = 5 | Accepted |
| R2 | Password reset abuse | New `/api/auth/forgot-password` route rate-limits 3/hr/IP. Identical 200 OK avoids account enumeration. Supabase Auth enforces password complexity. | 1 × 4 = 4 | Accepted |
| R3 | AI bias | EEO fields are excluded from the matching model input. Score is decision-support, not decision-making — humans make the hiring call. Right-to-object via `/data-request` (type: object) routes to human review. | 2 × 4 = 8 | Accepted, with periodic fairness review (DPIA v1.1 commitment) |
| R4 | EEO display without consent | New `sensitiveDataConsent` flag on UserProfile (false by default). Employer-facing serializers redact when false. UI toggle in profile form is a Q3 2026 commitment. | 1 × 4 = 4 | Accepted |
| R5 | Resume re-use for training | Internal policy: resume content is not used to train models. No vendor in the sub-processor list has model-training rights to our data. Privacy policy §13 explicit. | 1 × 4 = 4 | Accepted |
| R6 | Pre-consent EU analytics | GA Consent Mode v2 defaults to denied. GPC and DNT honored as binding opt-out. Region detection routes EU/UK/CH/CA/BR/AU to strict opt-in. Vercel Speed Insights gated by `ConsentGatedTelemetry`. Verified end-to-end with Playwright. | 1 × 3 = 3 | Accepted |
| R7 | DSAR SLA missed | DSAR persisted with `dueBy` computed at insert (30d GDPR / 45d CCPA). Daily admin review of overdue rows is a process commitment. Audit log records receipt. | 2 × 3 = 6 | Accepted |
| R8 | Premature hard-purge | 30-day grace window, restore endpoint, inactive-user warning email 30d before soft-delete. Hard-purge cron logs each row to `audit_logs` so a misfire is recoverable from backup. | 1 × 3 = 3 | Accepted |
| R9 | Sub-processor breach | Each sub-processor listed at `/sub-processors` with DPA link. Incident-response runbook §4 defines sub-processor breach handling. Quarterly review of sub-processor list. | 2 × 4 = 8 | Accepted with quarterly review |
| R10 | Resume malware | Cloudmersive Advanced Virus Scan runs synchronously inside `uploadResume` before write to Supabase Storage. Refuses executables, scripts, password-protected archives, macros, XXE. Fails closed by default. | 1 × 4 = 4 | Accepted |
| R11 | Re-identification from analytics | GA4 with `anonymize_ip: true` and `allow_google_signals: false`. No user_id sent to GA4 without consent. Aggregate-only fields exposed in the click-analytics dashboard. | 1 × 3 = 3 | Accepted |
| R12 | Underage signup | Privacy policy §8 prohibits under-18 signup. Terms of service confirms. No active processing of known minors. | 1 × 4 = 4 | Accepted |

**Aggregate residual risk:** medium. No risk remains scored "high" (15+) after mitigation.

---

## Step 7 — Sign-off and outcomes

| Item | Decision | By | Date |
|---|---|---|---|
| Has the DPIA identified all material risks? | Yes | Privacy lead | 2026-04-30 |
| Are the proposed mitigations proportionate? | Yes | Privacy lead | 2026-04-30 |
| Is residual risk acceptable to proceed with processing? | Yes | Founder | 2026-04-30 |
| Is prior DPA consultation under Art. 36 required? | No (no high residual) | Privacy lead | 2026-04-30 |
| Date of next mandatory review | 2027-04-30 | — | — |
| Trigger for ad-hoc review | Material change to AI matching model, new sub-processor, expansion to new jurisdiction with stricter rules, or any reportable incident under `docs/incident-response.md` | — | — |

---

## Step 8 — Integration with the rest of compliance

This DPIA pulls forward and references work already completed:

- `docs/compliance-audit.md` — 25-gap audit and Sprint 1–4 closure status.
- `docs/incident-response.md` — incident-response runbook and 72-hour notification clock.
- `app/privacy/page.tsx` — public privacy policy with all GDPR / CCPA disclosures.
- `app/sub-processors/page.tsx` — public sub-processor list with DPAs.
- `app/data-request/page.tsx` — DSAR intake form.
- `app/do-not-sell/page.tsx` — CCPA opt-out.
- `prisma/migrations/*` — `audit_logs`, `data_requests`, soft-delete columns, double opt-in for alerts, sensitive-data consent flag.

The DPIA is not a one-time deliverable. It is reviewed annually and reissued as v1.1 / v2.0 / etc. on each material processing change.

---

## Appendix A — Commitments captured for v1.1

1. Add a one-question consent prompt at signup asking whether the user is comfortable with AI matching, with a documented opt-out path.
2. Add the `sensitiveDataConsent` toggle to the profile form so users can grant or revoke explicit consent for EEO / DEA / NPI display in employer-facing views.
3. Run an annual fairness review of the AI matching model against the EEO categories the user volunteered.
4. Run a quarterly sub-processor security check (status, DPA renewal, breach history).
5. Run a Supabase backup-restore drill and document the result (incident-response §7 readiness).

---

## Appendix B — Useful template / regulator links

- UK ICO DPIA template: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/>
- French CNIL PIA tool (free desktop app): <https://www.cnil.fr/en/open-source-pia-software-helps-carry-out-data-protection-impact-assesment>
- EDPB Guidelines on DPIAs (WP248 rev.01): <https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-2017-data-protection-impact-assessment-dpia_en>
- Lead Supervisory Authority directory (EEA): <https://edpb.europa.eu/about-edpb/about-edpb/members_en>
- ICO breach reporting (UK): <https://ico.org.uk/for-organisations/report-a-breach/>
