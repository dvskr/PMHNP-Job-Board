# Runbook — `docs/` index

> 30-second navigation. If you can't find what you need, search the repo by filename — every doc starts with a one-line description of who it's for.

## Table of contents

| Doc | Type | Use when… |
|---|---|---|
| **Compliance + privacy** | | |
| [compliance-audit.md](compliance-audit.md) | Status tracker | You need the 25-gap audit, closure status, sprint roadmap |
| [dpia.md](dpia.md) | Policy | A regulator asks for your Data Protection Impact Assessment |
| [incident-response.md](incident-response.md) | Runbook | A breach is happening or might be happening |
| [fork-checklist.md](fork-checklist.md) | Process | You're cloning this repo for a different niche job board |
| **Job pipeline** | | |
| [ingestion-pipeline-audit.md](ingestion-pipeline-audit.md) | Reference | An ingestion source is misbehaving |
| [pipeline-issues-and-crons.md](pipeline-issues-and-crons.md) | Reference | A cron is failing or pipeline output looks wrong |
| [job-health-architecture.md](job-health-architecture.md) | Architecture | You're changing how dead-link detection works |
| [job-health-runbook.md](job-health-runbook.md) | Runbook | Jobs are getting flagged dead incorrectly, or alerts are firing |
| [presence-threshold-rationale.md](presence-threshold-rationale.md) | Rationale | Tuning source-presence thresholds |
| **Educational (background, not policy)** | | |
| [educational/README.md](educational/README.md) | Index | Browsing the educational folder |
| [educational/cookies-and-tracking.md](educational/cookies-and-tracking.md) | Primer | Adding tracking, ad pixels, or analytics; explaining cookies to a stakeholder |
| [educational/when-to-expand-infra.md](educational/when-to-expand-infra.md) | Decision guide | "Should I buy this tool yet?" — has the trigger thresholds for paid Cloudmersive, sGTM, SOC 2, etc. |
| [educational/compliance-faq.md](educational/compliance-faq.md) | FAQ | A customer / regulator / contractor asks "are we compliant with X?" |

## Quick lookups by question

| Question | Open this |
|---|---|
| "What's our SOC 2 status?" | [educational/compliance-faq.md](educational/compliance-faq.md) → SOC 2 |
| "How do I report a breach?" | [incident-response.md](incident-response.md) §2 (first 30 min) |
| "Where's my data stored?" | [educational/compliance-faq.md](educational/compliance-faq.md) → data storage |
| "Which sub-processors do we use?" | `app/sub-processors/page.tsx` is the public truth; [dpia.md](dpia.md) §2.3 has the internal version |
| "What happens when a user deletes their account?" | [educational/compliance-faq.md](educational/compliance-faq.md) → account deletion |
| "How do I fork this repo for a new niche?" | [fork-checklist.md](fork-checklist.md) |
| "When do we buy paid Cloudmersive / sGTM / SOC 2?" | [educational/when-to-expand-infra.md](educational/when-to-expand-infra.md) tracker table |
| "Why are some jobs being unpublished?" | [job-health-runbook.md](job-health-runbook.md) |
| "An ingestion source returned 0 jobs — what now?" | [ingestion-pipeline-audit.md](ingestion-pipeline-audit.md) |

## What lives where (source-of-truth chain)

When the public site, the internal docs, and the code disagree, the priority order is:

1. **Public commitments** — `app/privacy/page.tsx`, `app/sub-processors/page.tsx`, `app/security/page.tsx`, `app/do-not-sell/page.tsx`. These are what we promised the world. They override everything else.
2. **Internal policies** — `docs/compliance-audit.md`, `docs/dpia.md`, `docs/incident-response.md`, `docs/fork-checklist.md`. These describe what we do behind the scenes.
3. **Code** — the actual behaviour at runtime.

If 1 and 3 disagree, **fix the code, don't downgrade the public commitment**.

## Conventions

- Every doc starts with `> Audience:` so you know if you're the intended reader
- Every doc has a `Last updated:` date — update it when you change the doc
- Migration files in `prisma/migrations/<date>_<name>/` are themselves documentation; read them when in doubt about why a column exists
- Verify scripts in `scripts/verify-*.mjs` are runnable regression tests — re-run after changing anything privacy-related

## When you add a new doc

1. Drop it under `docs/` (or `docs/educational/` if it's commentary on a policy, not a policy itself)
2. Add it to this RUNBOOK in the right table row
3. Start the file with `> Audience:` and `> Last updated:`
4. Reference, don't duplicate — if a fact is in another doc, link to it

Last updated: 2026-04-30.
