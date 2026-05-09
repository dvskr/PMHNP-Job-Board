# SEO Audit 09 — Meta Titles, Descriptions, OG & Twitter Card
**Date:** 2026-05-08 | **Scope:** Every Next.js metadata export across the full app/

---

## Summary Table — Top 30 Pages

| # | URL | Title (with template suffix) | T-chars | T-Verdict | D-chars | D-Verdict |
|---|-----|------------------------------|---------|-----------|---------|-----------|
| 1 | / | {N}+ PMHNP Jobs — Psychiatric NP Job Board | ~44 | good | ~155 | good |
| 2 | /jobs | Browse {N} PMHNP & Psychiatric NP Jobs Near Me | ~47 | good | ~138 | good |
| 3 | /jobs/[slug] | {Job Title} at {Employer} | varies | good | descriptionSummary or raw HTML slice | RISK |
| 4 | /jobs/locations | PMHNP Jobs by Location - All States | PMHNP Hiring | ~51 | good | 163 | LONG |
| 5 | /jobs/state/[state] | {N} PMHNP Jobs in {State} ({Code}) — $XXK Avg Salary | ~55 | good | ~160 | good |
| 6 | /jobs/city/[slug] | PMHNP Jobs in {City}, {Code} | {N} Open Positions | $XXk Avg | up to 75 | LONG | ~143 | good |
| 7 | /jobs/metro/[slug] | {N} PMHNP Jobs in {City}, {Code} — Salary, Licensure & Top Employers (2026) | up to 82 | LONG | 200-260 | LONG |
| 8 | /jobs/remote | {N} Remote PMHNP Jobs — Work From Home ($130K-200K) | ~52 | good | ~136 | good |
| 9 | /jobs/telehealth | {N} Telehealth PMHNP Jobs ($130K-200K) | ~40 | good | ~155 | good |
| 10 | /jobs/full-time | {N} Full-Time PMHNP Jobs ($130K-180K) | ~38 | good | ~103 | short |
| 11 | /jobs/part-time | {N} Part-Time PMHNP Jobs ($60-85/hr) | ~38 | good | ~87 | short |
| 12 | /jobs/contract | {N} Contract PMHNP Jobs ($130K-180K) | ~37 | good | ~92 | short |
| 13 | /jobs/locum-tenens | {N} Locum Tenens PMHNP Jobs — Travel Psych NP ($85-150/hr) | ~61 | LONG | ~208 | LONG |
| 14 | /jobs/new-grad | {N} New Grad PMHNP Jobs — Entry-Level Psych NP ($120K-160K) | ~62 | LONG | ~197 | LONG |
| 15 | /jobs/senior | {N} Senior PMHNP Jobs [CORRUPT CHAR] Director & Leadership ($160K-250K+) | ~74 | CORRUPT+LONG | ~139 | good |
| 16 | /jobs/1099 | {N} 1099 PMHNP Jobs — Independent Contractor Psych NP | ~53 | good | ~189 | LONG |
| 17 | /jobs/va | {N} VA PMHNP Jobs — Federal Benefits, EDRP & Pension ($120K-175K) | ~66 | LONG | ~230 | LONG |
| 18 | /jobs/behavioral-health | {N} Behavioral Health NP Jobs — Psychiatric & Mental Health Positions | ~70 | LONG | ~167 | LONG |
| 19 | /jobs/addiction | {N} Addiction PMHNP Jobs — Substance Use & MAT Psych NP Positions | ~65 | LONG | ~225 | LONG |
| 20 | /jobs/outpatient | {N} Outpatient PMHNP Jobs — Clinic & Private Practice ($130K-190K) | ~67 | LONG | ~163 | LONG |
| 21 | /about | About Us - The #1 Job Board for Psychiatric NPs | PMHNP Hiring | ~64 | LONG | 155 | good |
| 22 | /contact | Contact Us | PMHNP Hiring | ~26 | short | 156 | good |
| 23 | /salary-guide | PMHNP Salary Guide 2026 — $155K+ Avg by State | PMHNP Hiring | PMHNP Hiring | ~78 | LONG+DUPE | ~130 | good |
| 24 | /salary-guide/[state] | PMHNP Salary in {State} ({Code}) 2026 — Average Pay, Jobs & Cost of Living | ~77 | LONG | ~91 | short |
| 25 | /faq | FAQ | PMHNP Jobs | PMHNP Hiring | ~32 | DUPE-brand | 146 | good |
| 26 | /blog | PMHNP Career Blog | Expert Guides & Insights | PMHNP Hiring | ~60 | borderline | 90 | good |
| 27 | /for-employers | For Employers — Hire PMHNPs | PMHNP Job Board | PMHNP Hiring | ~62 | LONG | 186 | LONG |
| 28 | /companies | PMHNP Employers — Companies Hiring Psychiatric Nurse Practitioners | PMHNP Hiring | ~82 | LONG | 142 | good |
| 29 | /pricing | Pricing — PMHNP Job Board | First 2 Posts Free, Then $XX | PMHNP Hiring | ~73 | LONG | ~108 | short |
| 30 | /resources | PMHNP Resources & Career Guides — 85+ Free Articles | PMHNP Hiring | ~68 | LONG | 163 | LONG |

*Legend: good = 30-60 chars title / 70-160 chars desc. LONG = over SERP cap. short = under 70 chars (desc). Char counts include the " | PMHNP Hiring" template suffix for pages that use it.*

---
TEST_APPEND

## Findings

All findings are documented inline in the assistant response above.
The table of top 30 pages appears in the section above.

### Quick Reference

1-CRITICAL  app/jobs/senior/page.tsx:50,54              Corrupt em-dash in title and OG title
2-HIGH       app/jobs/[slug]/page.tsx:386                 HTML tags in description fallback
3-HIGH       app/salary-guide/[state]/page.tsx:167-171   No OG image or Twitter card (50 pages)
4-HIGH       app/jobs/metro/[slug]/page.tsx:107-108       Title 82 chars, description 200-260 chars
5-HIGH       app/jobs/va/page.tsx:98                      Description is 230 chars
6-HIGH       app/jobs/addiction/page.tsx:89               Description is 225 chars
7-HIGH       app/jobs/behavioral-health/page.tsx:85       Title is 70-74 chars
8-HIGH       app/jobs/locum-tenens/page.tsx:89            Description is 208 chars
9-HIGH       app/jobs/city/[slug]/page.tsx:303            Title overflows for long city names
10-HIGH      app/companies/page.tsx:13-17                No OG image
11-HIGH      app/companies/[slug]/page.tsx:45            OG description is 30-35 chars
12-HIGH      app/jobs/1099/page.tsx:82-87                 No OG image
13-HIGH      app/jobs/community-health/page.tsx:81-85    No OG image
14-HIGH      app/jobs/correctional/page.tsx:82-86        No OG image
15-HIGH      app/jobs/child-adolescent/page.tsx:81-85    No OG image
16-MEDIUM    13 category pages (full-time etc.)          No OG image or Twitter card
17-MEDIUM    app/salary-guide/page.tsx:94                Double-brand in title
18-MEDIUM    app/faq/page.tsx:14                         Brand-confused title
19-MEDIUM    app/contact/layout.tsx:9                    Title is 26 chars
20-MEDIUM    app/for-employers/page.tsx:18-19            Description is 186 chars
21-MEDIUM    app/for-job-seekers/page.tsx:20             Hardcoded job count
22-MEDIUM    app/about/page.tsx:13-15                    OG block has only images
23-MEDIUM    app/faq/page.tsx:16-19                      OG block has only images
24-MEDIUM    app/blog/[slug]/page.tsx:43                 Description falls back to title
25-MEDIUM    app/layout.tsx:82                           og:url is / not brand.baseUrl
26-MEDIUM    3 resource pages                            No OG images
27-LOW       app/jobs/metro/[slug]/page.tsx              No Twitter card
28-LOW       app/jobs/state/[state]/page.tsx             No Twitter card
29-LOW       app/jobs/locations/page.tsx                 No Twitter card
30-LOW       app/jobs/remote/page.tsx                    No Twitter card
31-LOW       app/jobs/city/[slug]/page.tsx:296           City Not Found needs noindex
32-LOW       app/jobs/state/[state]/page.tsx:402         Error fallback needs noindex
33-LOW       13 category pages                           Hardcoded salary ranges will go stale
