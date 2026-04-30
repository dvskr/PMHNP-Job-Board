# Educational Notes

Reference material for the founder / future maintainers. Not engineering tickets, not policies — just the explanations behind decisions we've already made. Read these when:

- A regulator / customer / contractor asks "why did you choose X?" and you want a coherent answer.
- You're about to add a feature and want to know what compliance / privacy / scaling implications it has.
- You're forking the codebase for a new niche and want a refresher.

## What's in here

| Doc | When to read it |
|---|---|
| [cookies-and-tracking.md](cookies-and-tracking.md) | Before adding any tracking, ad pixel, or analytics tool. Or when a customer asks "what cookies do you use?" |
| [when-to-expand-infra.md](when-to-expand-infra.md) | At each growth milestone (first 100 users, first paid ads, first enterprise prospect, $1M ARR). Tells you which infra investment is worth making at which stage. |
| [compliance-faq.md](compliance-faq.md) | When you get a question that sounds like "are we compliant with X?" — answers in plain English with pointers to the source-of-truth docs. |

## Source-of-truth docs (NOT educational, actual policies)

These are the binding documents. Educational notes above are commentary on these:

| Doc | Purpose |
|---|---|
| [../compliance-audit.md](../compliance-audit.md) | The 25-gap audit + closure status |
| [../dpia.md](../dpia.md) | GDPR Art. 35 Data Protection Impact Assessment |
| [../incident-response.md](../incident-response.md) | Breach runbook + 72-hour notification clock |
| [../fork-checklist.md](../fork-checklist.md) | How to spin up a sister job board for a new niche |

## House rules for this folder

1. **Plain English.** Avoid jargon. When you must use a term, define it the first time.
2. **Mark dates.** Browser policies, regulator interpretations, and pricing tables move. Date everything.
3. **Pragmatic over comprehensive.** Don't include trivia. Include the things that change a decision.
4. **Reference, don't duplicate.** If something is in `dpia.md`, link to it instead of restating.

Last updated: 2026-04-30.
