# PMHNP Hiring — Master TODO

**Last updated:** 2026-05-08
**Owner:** Sathish Kumar

Living checklist across product, SEO, ops, compliance, and marketing. Mark items as you complete them. When all items in a section close, archive that section.

Status legend: `[x]` done · `[~]` in progress · `[ ]` open · `[!]` blocked · `[-]` skipped/N/A
Priority: **P0** = blocking launch / safety · **P1** = ship within 2 weeks · **P2** = backlog
Effort: **S** = ≤2h · **M** = half-day · **L** = ≥1 day

---

## Section A — Already shipped (archive list)

| Item | Status |
|---|---|
| 0. Check all pSEO links | `[x]` |
| 1. Clay marquee | `[x]` |
| 2. Search bar fix | `[x]` |
| 3. Job cards restructure (row/column, detail page, direct apply popup, verification mark) | `[x]` |
| 4. About page | `[x]` |
| 6. Ingestion analysis | `[x]` |
| 7. SEO remediation (75-issue runbook) | `[x]` — see [seo-2026-05-remediation.md](runbooks/seo-2026-05-remediation.md) |
| 9. Code cleanup (initial pass) | `[x]` — final repeat pass at end of release cycle (B2) |
| 11. Email campaign optimization + delivery test | `[x]` |
| 12. AI features testing | `[x]` |
| 14. Cookies + compliance | `[x]` |
| 19. GSC fixes | `[x]` |
| 20. Stripe prod + Mercury | `[x]` |
| Recommended jobs polish | `[x]` |
| Refunds flow | `[x]` |

---

## Section B — In progress / partially done (finish these)

| ID | Item | Priority | Effort | Notes |
|---|---|---|---|---|
| B1 | 5. Co-worker run-through for bugs | P1 | M | Partially done — pending second pass with fresh eyes |
| B2 | Final code cleanup pass (re-do of item 9 at release time) | P1 | M | Initial pass already done; this is the pre-release sweep |
| B3 | 10. Mobile view polish (footer, etc.) | P1 | M | Partially done — Phase A/B/D fixed several mobile items; final QA at 320/375/768 still pending |
| B4 | 22. Unit tests + GitHub Actions | P1 | L | Partially done — 730 vitest tests passing; CI/Actions wiring still partial |

---

## Section C — Product / engineering — open

### C1. End-to-end testing (P0 — pre-launch must-do)

| Sub-task | Effort | Notes |
|---|---|---|
| Job seeker flow (signup → profile → search → save → apply) | M | Use Playwright; smoke tests exist |
| Employer flow (signup → post job → checkout → dashboard → message candidate) | M | Stripe + email + dashboard surfaces all touched |
| Admin flow (login → moderate jobs → email send → analytics) | M | |
| Document failure modes found | S | One issue/file per finding |

### C2. Email infrastructure

| ID | Item | Priority | Effort |
|---|---|---|---|
| C2a | 16. Newsletter (template + list management + opt-in flow) | P1 | L |
| C2b | Test all transactional emails end-to-end | P1 | M |

### C3. Analytics + tracking

| ID | Item | Priority | Effort |
|---|---|---|---|
| C3a | 15. GA4 + GTM tag audit | P1 | M | Tags present; need a verification pass |
| C3b | User-source tracking (UTM capture, referrer attribution) | P2 | M |
| C3c | Re-verify GA4 page_view fix from SEO Phase D (no double-counting) | P1 | S |

### C4. Content + SEO follow-ups

| ID | Item | Priority | Effort |
|---|---|---|---|
| C4a | 18. Upload licensure videos to YouTube + embed in blog posts | P1 | L | Drives video impressions in GSC + adds video schema |
| C4b | New-grad jobs optimization (content + filters) | P2 | M | |
| C4c | Index employer-jobs with SEO (canonical, schema, OG) | P2 | M | |
| C4d | Product video covering top features | P2 | L | Reusable for marketing + onboarding |
| C4e | NPI registry integration (verify clinician licenses) — `https://npiregistry.cms.hhs.gov/api/?version=2.1` | P2 | L | Trust signal for employers |

### C5. UX / onboarding

| ID | Item | Priority | Effort |
|---|---|---|---|
| C5a | Onboarding wizard for new candidates | P1 | L |
| C5b | Clean up popups + feedback widget (consolidate, dedupe) | P2 | M | Phase C OverlayCoordinator helps; UX pass still wanted |
| C5c | Job icon alignment polish | P2 | S |
| C5d | Duplicate-application check on easy-apply | P2 | M | Avoid spam-apply via same email |
| C5e | Shared employer account management (multi-user per org) | P2 | L |

### C6. Admin

| ID | Item | Priority | Effort |
|---|---|---|---|
| C6a | Admin panel — full feature verification | P1 | M |
| C6b | Failed-migrations check / dashboard | P1 | M | We just shipped `db:check-schema` — extend to flag any failed/pending migrations |

### C7. Infrastructure

| ID | Item | Priority | Effort |
|---|---|---|---|
| C7a | Performance — final CWV audit on prod | P1 | M | Phase C trimmed Sentry/fonts/etc; still need real PageSpeed scores |
| C7b | Sentry — verify dashboards + alert routes wired | P1 | S |
| C7c | Redis — verify Upstash usage in prod (rate-limit hits, cache hits) | P2 | S |
| C7d | Supabase custom domain | P2 | M | Currently on `*.supabase.co`; adds branding + slight perf |
| C7e | 404 page polish + comprehensive status code coverage | P2 | M | Includes 410, 403, 401, 500 states |

### C8. Compliance / legal / ops

| ID | Item | Priority | Effort |
|---|---|---|---|
| C8a | Migrate all SaaS accounts under Akari Labs LLC (F1 visa compliance) | P0 | M | Same Sathish-as-Creator / Pavan-as-LLC-member pattern as the website |
| C8b | 24. Supabase RLS / backup | — | L | `[!]` **parked by you** — captured in SEO runbook as M5 with re-entry steps |
| C8c | 23. Claude skills + MCPs setup for the project | P2 | S | |

---

## Section D — Marketing / growth (separate sprint)

### D1. Listings + directories

| ID | Item | Priority | Effort |
|---|---|---|---|
| D1a | Submit to SaaS directories (Product Hunt, Indie Hackers, Saashub, etc.) | P1 | M |
| D1b | G2 / Capterra listings | P1 | M |
| D1c | Backlinks campaign (HARO, niche directories, healthcare directories) | P2 | L |

### D2. Outbound

| ID | Item | Priority | Effort |
|---|---|---|---|
| D2a | LinkedIn Sales Navigator outreach | P1 | L |
| D2b | Apollo.io outreach (employers) | P1 | L |
| D2c | Email campaign — PMHNP grad programs | P1 | M |
| D2d | Personal emails to early users for testimonials | P1 | M |

### D3. Community + content

| ID | Item | Priority | Effort |
|---|---|---|---|
| D3a | Reddit marketing (r/PMHNP, r/nursepractitioner, etc.) | P1 | M |
| D3b | Reddit r/pmhnphiring (own subreddit — set up + seed content) | P2 | M |
| D3c | Collect testimonials from current users | P1 | M | Replaces the placeholder testimonials we removed in SEO Phase B |
| D3d | Relaunch announcement on all platforms (X, LI, FB, IG, Reddit) | P1 | S |

### D4. Social posts (paused)

| ID | Item | Priority | Effort |
|---|---|---|---|
| D4a | 17. Social posts optimization | P2 | M | Crons paused 2026-05-08 (Facebook + Instagram). Re-enable via vercel.json once strategy is finalized |

---

## Section E — Marketing experiments (P2 backlog)

| Item | Notes |
|---|---|
| Track user source on landing | UTM + referrer + source DB column on signups |
| Reddit r/pmhnphiring engagement strategy | Weekly value posts, AMA candidates |
| Long-tail blog content campaign | Pair with C4a (YouTube videos) |

---

## Cross-references

- SEO remediation runbook: [docs/runbooks/seo-2026-05-remediation.md](runbooks/seo-2026-05-remediation.md)
- Schema-parity tooling: `npm run db:check-schema` / `db:check-schema:dev` / `db:migrate:prod`
- Audit scripts: `npm run audit:thin` / `backfill:region`

## Recommended next 7-day focus

If you can only pick 5 things this week:

1. **C1 — End-to-end testing** (P0, prevents launch embarrassment)
2. **C8a — Account migration to Akari Labs LLC** (P0, compliance)
3. **B3 — Mobile view final QA** (P1, can't recover from a broken mobile launch)
4. **C7a — Performance / CWV audit on prod** (P1, validates the SEO work and surfaces any remaining LCP issues)
5. **D3c — Collect 3-5 real testimonials** (P1, unblocks content marketing + replaces the placeholders we removed)

Everything else is real but slottable around those.
