# E2E Test Suite

Playwright tests for the PMHNP Job Board.

**Default target: `http://localhost:3000`** — your local dev server. Playwright will auto-start `npm run dev:nomigrate` if no server is already running.

## Quick start

```bash
# 1. Install Playwright browser (one-time)
npm run test:e2e:install

# 2. Copy and fill in test credentials
cp .env.test.example .env.test
# edit .env.test with your real test-user emails/passwords

# 3. (Optional) Drop a sample resume PDF into fixtures
# tests/e2e/fixtures/sample-resume.pdf

# 4. Run!
npm run test:e2e               # full suite (auto-starts dev server)
npm run test:e2e:smoke         # just smoke tests (~30s)
npm run test:e2e:regression    # verify the d916ec2 fixes
npm run test:e2e:seo           # SEO checks
npm run test:e2e:ui            # visual debug mode
```

## Targets

By default, tests run against `http://localhost:3000`. Override with `PLAYWRIGHT_BASE_URL`:

```bash
# Against a Vercel preview deploy
PLAYWRIGHT_BASE_URL=https://pmhnp-job-board-<deploy>.vercel.app npm run test:e2e

# Against production (read-only tests only — mutations auto-skip)
PLAYWRIGHT_BASE_URL=https://pmhnphiring.com npm run test:e2e:smoke
```

The `webServer` block in `playwright.config.ts` only auto-starts the dev server when the URL is `localhost` or `127.0.0.1`.

## Credentials & .env.test

Tests load credentials from `.env.test` (gitignored). If a credential is missing, dependent tests `test.skip()` cleanly. See `.env.test.example` for the full list:

| Variable | Used by | If unset |
|---|---|---|
| `E2E_SEEKER_EMAIL` / `E2E_SEEKER_PASS` | seeker journey | auth tests skip |
| `E2E_EMPLOYER_EMAIL` / `E2E_EMPLOYER_PASS` | employer journey | auth tests skip |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASS` | admin journey | auth tests skip |
| `E2E_TEST_RESUME_PATH` | seeker resume upload | resume test skips |
| `E2E_TEST_JOB_ID` | seeker apply test | falls back to first job from listings |
| `E2E_STRIPE_TEST_CARD` etc. | (reserved for future post-job checkout) | n/a |

To create the seeker + employer test users in your local DB:

```bash
npx ts-node scripts/create-test-users.ts
```

## Suite map

| File | What it covers | Mutates data? |
|---|---|---|
| `smoke.spec.ts` | 24 tests — every top public page renders, no error boilerplate | No |
| `regression.spec.ts` | 14 tests — the 6 fixes shipped in commit d916ec2 | No |
| `seo.spec.ts` | 10 tests — robots, sitemap, OG, canonicals, JSON-LD | No |
| `journeys/job-seeker.spec.ts` | 19 tests — browse/login/save/apply/upload-resume/signup | Yes (local only) |
| `journeys/employer.spec.ts` | 13 tests — login/post-job/applicants/settings/signup | Yes (local only) |
| `journeys/admin.spec.ts` | 17 tests — gate checks, all admin pages, blog/email/jobs | Yes (local only) |

**Mutation tests auto-skip when `PLAYWRIGHT_BASE_URL` contains `pmhnphiring.com`.** This protects production from test pollution. Against localhost they run fully.

## Reading test output

```
✓ smoke: Homepage loads (/)                     (2.1s)
✓ regression: returns expected Cache-Control    (450ms)
✘ seeker: can apply to a job                    (12s)
  Error: locator.click: Timeout 20000ms exceeded
  ...
- (skipped) admin: can view /admin/users        (E2E_ADMIN_EMAIL not set)
```

- **✓** passed
- **✘** failed → check the trace in `tests/e2e/.results/` (also in the HTML report)
- **(skipped)** missing creds or production-blocked

## Debugging a failure

```bash
# Re-run just the failing test, with the browser visible
npx playwright test seeker --grep "can apply" --headed

# Open the trace viewer for a captured failure
npx playwright show-trace tests/e2e/.results/<test-name>/trace.zip

# Open the HTML report
npx playwright show-report
```

## Adding a new test

1. Pick the right suite file (smoke / regression / seo / journeys)
2. Use `getByRole`, `getByLabel`, or `getByPlaceholder` for selectors — more stable than CSS classes
3. Run with `--headed` first so you can see what's happening
4. If your test mutates data (creates a user, posts a job), wrap it in the `mutations` `describe` block so it auto-skips against production
5. Update this README's table if you add a new file

## Manual run (no schedule)

There is no scheduled run — you trigger E2E manually. The previously-set
`Weekly E2E suite` routine is disabled. To re-enable, manage routines at
https://claude.ai/code/routines

## Known limits

- **Stripe checkout flow** — the post-job test fills the form but doesn't submit (Stripe needs explicit setup; we'd add `STRIPE_TEST_KEY` env wiring + iframe filling)
- **Email sending** — admin email composer test fills the subject but doesn't click Send (would actually deliver mail)
- **Resume upload** — needs a real PDF at `tests/e2e/fixtures/sample-resume.pdf`. The .txt fixture in this folder is for documentation only; the parser requires PDF/DOCX.
- **Selectors are role/label-based** — if you rename a button from "Apply" to "Apply Now", that's fine (regex matches both); if you rename to "Send Application", update the test
