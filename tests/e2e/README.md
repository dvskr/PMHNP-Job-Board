# E2E Test Suite

Playwright tests covering the PMHNP Job Board production site.

## Run locally

```bash
# All tests against production (default)
npx playwright test

# Just the smoke suite
npx playwright test smoke

# Just regression tests (verifies fixes from commit d916ec2)
npx playwright test regression

# Against a Vercel preview deploy
PLAYWRIGHT_BASE_URL=https://pmhnp-job-board-<deploy-id>.vercel.app npx playwright test

# UI debug mode
npx playwright test --ui
```

## Auth-gated tests

Journey tests for job seeker / employer / admin require credentials:

```bash
export E2E_SEEKER_EMAIL=testseeker@pmhnptest.com
export E2E_SEEKER_PASS='TestSeeker123!'
export E2E_EMPLOYER_EMAIL=testemployer@pmhnptest.com
export E2E_EMPLOYER_PASS='TestEmployer123!'
export E2E_ADMIN_EMAIL=<admin email>
export E2E_ADMIN_PASS=<admin password>

npx playwright test
```

If credentials aren't set, the auth-gated tests `test.skip()` automatically. The
read-only / regression / SEO tests still run.

To create seeker + employer test users in your environment:

```bash
npx ts-node create-test-users.ts
```

## Suites

| File | What it covers | Safe against production? |
|---|---|---|
| `smoke.spec.ts` | Top public pages render with key UI present | Yes |
| `regression.spec.ts` | The 6 fixes shipped in commit d916ec2 | Yes |
| `seo.spec.ts` | robots.txt, sitemap, OG tags, canonicals, structured data | Yes |
| `journeys/job-seeker.spec.ts` | Browse, filter, detail, signup form, login | Yes (read-only); mutation tests skipped |
| `journeys/employer.spec.ts` | /for-employers, /pricing, login, dashboard | Yes (read-only); mutation tests skipped |
| `journeys/admin.spec.ts` | Auth gate + admin pages render | Yes (read-only); mutation tests skipped |

Mutation tests (apply to job, post a job, send broadcast email) are written but
`.skip()`ed when `PLAYWRIGHT_BASE_URL` points at production. They run automatically
against any preview/staging URL.

## CI / scheduled runs

A remote agent runs this suite weekly via the `/schedule` skill. The results land
as a GitHub issue on regression. See routine ID at the top of the schedule list.

## Adding a new test

1. Pick the right suite file (or create a new one in `tests/e2e/`)
2. Write the test — keep it deterministic, no `setTimeout` waits
3. Run locally first: `npx playwright test <file> --headed`
4. Update this README's table if you add a new file
