# Forking Checklist

> Take this codebase and turn it into a different niche job board (e.g., RN Hiring, PA Hiring, Dental NP Hiring) without losing the compliance posture you've already built.

## TL;DR — What you change

1. **`config/brand.ts`** — single source of truth. Edit ~10 values.
2. **DB** — point a new Supabase project, run `prisma migrate deploy`.
3. **Marketing copy** — rewrite home, about, FAQ, blog (niche-specific anyway).
4. **Reissue DPIA** — `docs/dpia.md` is a template; replace brand placeholders.
5. **Confirm sub-processor list** — same vendors usually, but verify.

## What carries over for free

Everything in Sprints 1–4 is generic compliance infrastructure:

- Schema (`audit_logs`, `data_requests`, soft-delete columns, double opt-in alerts, sensitive-data consent)
- API routes (`/api/consent`, `/api/data-request`, `/api/auth/*`, `/api/jobs/*`)
- Crons (`purge-soft-deleted`, `purge-inactive-users`, `cleanup-expired`)
- Audit logging (`lib/audit-log.ts` writes to `audit_logs`)
- Resume virus scan (`lib/virus-scan.ts`)
- GA Consent Mode v2, GPC handling, region detection, CSP, HttpOnly consent cookie
- Incident-response runbook (`docs/incident-response.md`) — template, swap brand
- Privacy/terms/security/sub-processors/do-not-sell/data-request pages — read from `config/brand.ts`

You **do not** redo any of this per fork. It's library code now.

## What's still hardcoded (intentionally) and needs per-fork work

These were considered for `config/brand.ts` and rejected because they're too varied / niche-specific to parameterize:

| Surface | Why hardcoded |
|---|---|
| Home page hero & marketing copy | Different value prop per niche |
| About / FAQ / Contact pages | Founder story, niche FAQs |
| Blog posts | Editorial work |
| Job category routes (`/jobs/inpatient`, `/jobs/lgbtq`, etc.) | Different niches have different categories |
| pSEO templates (`lib/pseo/*`) | Niche-specific keyword targeting |
| AI matching prompts | Tuned per role family |
| EEO field values (race, disability, veteran) | Federal forms — same across forks |
| Email confirmation copy in `app/api/job-alerts/route.ts` (most of it) | Already partially branded; rewrite per fork |
| Logo / favicon / social images in `/public` | Brand assets — replace files |
| `next.config.ts` redirects | Niche-specific URL consolidations |
| `robots.txt`, `humans.txt`, `ai.txt`, `llms.txt` (in `/public`) | Brand-specific |

## Step-by-step fork procedure

```bash
# 1. Clone
gh repo clone yourorg/<original-repo> <new-fork-repo>
cd <new-fork-repo>

# 2. Edit the brand config (one file, ~10 lines)
$EDITOR config/brand.ts

# 3. Replace brand assets
#    /public/logo.png, /public/favicon-*.png, /public/apple-touch-icon.png
#    /public/og-default.png, /public/site.webmanifest

# 4. Set up the new database
#    Create a fresh Supabase project for the new fork
#    Update DATABASE_URL + DIRECT_URL in Vercel env
npx prisma migrate deploy

# 5. Rewrite niche-specific surfaces
#    - app/page.tsx (home)
#    - app/about/page.tsx
#    - app/faq/page.tsx
#    - app/contact/page.tsx
#    - app/jobs/[category]/page.tsx (category landing pages — keep
#      structure, swap copy + filters)
#    - lib/pseo/* (programmatic SEO templates)

# 6. Reissue compliance docs (privacy + DPIA)
#    Most content auto-updates from config/brand.ts. Verify:
$EDITOR docs/dpia.md           # confirm processing description still accurate
$EDITOR app/sub-processors/page.tsx  # check vendors list (same usually)

# 7. Rotate environment secrets in Vercel
#    - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (new project)
#    - STRIPE_SECRET / STRIPE_WEBHOOK_SECRET (new account or product)
#    - RESEND_API_KEY (new account or domain)
#    - GA_MEASUREMENT_ID (new GA4 property)
#    - SENTRY_* (new project, optional)
#    - CLOUDMERSIVE_API_KEY (can reuse — same account)

# 8. DNS + Vercel
#    Point new domain at the Vercel project. SSL auto.

# 9. Smoke tests
npm run dev
#    Visit /, /privacy, /sub-processors, /security, /data-request,
#    /do-not-sell, /jobs. Confirm brand swapped everywhere visible.
```

## Things to NOT change per fork

- The `data_requests` schema — keep as-is so a future enterprise customer audit shows consistent DSAR structure across products.
- The `audit_logs` table — same reason.
- `lib/consent.ts` cookie names (`pmhnp_consent_v2`) — these are scoped to the domain so they don't conflict across forks.
- The 25-gap audit doc structure (`docs/compliance-audit.md`) — re-run the audit per fork using the same checklist; don't rewrite the framework.

## When to invest in further consolidation

If you end up with three or more forks, consider:

- Promote the compliance scaffolding to a private `npm` package (`@yourorg/job-board-compliance`).
- Move shared UI to a private design system.
- Use Turborepo to manage the monorepo of forks with shared internals.

Until then, plain forking + `config/brand.ts` is the right level of abstraction.
