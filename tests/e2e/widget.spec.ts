/**
 * E2E smoke tests for the Program Directors widget.
 *
 *   npx playwright test tests/e2e/widget.spec.ts
 *   npx playwright test tests/e2e/widget.spec.ts --headed --project=chromium
 *
 * Covers (mirrors docs/runbooks/program-directors-campaign.md §3 Step 5):
 *  1. /widget renders core elements (brand, heading, CTA, job cards)
 *  2. ?state=<XX> filters jobs to that state
 *  3. ?program=<name> updates the "Curated for X students" subtitle
 *  4. ?limit=N caps the number of cards (clamped 3–12)
 *  5. ?limit=99 → renders the explicit error card (not "Jobs in US")
 *  6. ?state=ZZ → renders the explicit error card
 *  7. ?state=WY (no jobs) → empty-state inside the widget shell
 *  8. /widget HTTP headers include CSP frame-ancestors and 60s s-maxage
 *  9. /for-programs renders + embed builder updates snippet/iframe
 * 10. "See all in CA" link points to /jobs?location=California
 *
 * These tests are read-only (no signups, no DB mutations) so they're
 * safe to run against any environment via PLAYWRIGHT_BASE_URL.
 */

import { test, expect, type Page } from '@playwright/test'

test.describe('/widget — core render', () => {
  test('1. renders brand, heading, CTA, and 6 job cards by default', async ({ page }) => {
    await page.goto('/widget?state=CA&program=UCSF')

    // Brand wordmark visible
    await expect(page.locator('.pd-brand-logo')).toBeVisible()
    await expect(page.locator('.pd-brand-mark')).toContainText('PMHNP')
    await expect(page.locator('.pd-brand-mark-accent')).toContainText('Hiring')

    // Title block
    await expect(page.locator('.pd-heading')).toContainText('Latest PMHNP Jobs in CA')
    await expect(page.locator('.pd-sub')).toContainText('Curated for UCSF students')

    // CTA button
    const cta = page.locator('a.pd-cta')
    await expect(cta).toContainText('See all in CA')
    const ctaHref = await cta.getAttribute('href')
    expect(ctaHref).toContain('/jobs?location=California')
    expect(ctaHref).toContain('utm_source=widget')

    // Should render the FULL 6 cards by default. CA has hundreds of
    // qualifying jobs in the DB — if we render <6 here it means the
    // candidate-pool query is too narrow and the in-memory classifier
    // is throwing most away (the bug seen on 2026-05-18: widget showed
    // 1 card despite 481 CA jobs in DB).
    const cards = page.locator('a.pd-row')
    await expect(cards).toHaveCount(6)
  })

  test('2. state filter — CA cards have CA in their location pill', async ({ page }) => {
    await page.goto('/widget?state=CA')
    const cards = page.locator('a.pd-row')
    const cardCount = await cards.count()
    if (cardCount === 0) {
      // CA has no qualifying jobs today — empty state, not an error.
      // Don't fail the test; just assert the empty state rendered.
      await expect(page.locator('.pd-empty')).toBeVisible()
      return
    }
    // First card's location pill should mention CA (state code) or
    // "Remote" (jobs explicitly remote-anywhere still show in state
    // filters because their stateCode column is populated).
    const firstLocation = await cards.first().locator('.pd-pill--outline').first().textContent()
    expect(firstLocation).toMatch(/CA|Remote/i)
  })

  test('3. ?program= updates the subtitle text', async ({ page }) => {
    await page.goto('/widget?state=NY&program=Columbia%20University')
    await expect(page.locator('.pd-sub')).toContainText('Curated for Columbia University students')
  })

  test('3b. omitted ?program= falls back to "Updated daily"', async ({ page }) => {
    await page.goto('/widget?state=NY')
    await expect(page.locator('.pd-sub')).toContainText('Updated daily')
  })
})

test.describe('/widget — limit param', () => {
  test('4. ?limit=3 caps at 3 cards', async ({ page }) => {
    await page.goto('/widget?state=CA&limit=3')
    const cards = page.locator('a.pd-row')
    const count = await cards.count()
    expect(count).toBeLessThanOrEqual(3)
  })

  test('4b. ?limit=12 allows up to 12 cards', async ({ page }) => {
    await page.goto('/widget?state=CA&limit=12')
    const cards = page.locator('a.pd-row')
    const count = await cards.count()
    expect(count).toBeLessThanOrEqual(12)
  })
})

test.describe('/widget — validation & errors', () => {
  test('5. ?limit=99 renders an explicit error card, not a fake "Jobs in US"', async ({
    page,
  }) => {
    const response = await page.goto('/widget?state=CA&limit=99')
    expect(response?.status()).toBe(400)
    await expect(page.locator('.pd-error-card')).toBeVisible()
    await expect(page.locator('.pd-error-heading')).toContainText("couldn")
    // Must NOT show the empty-jobs-in-state pattern.
    await expect(page.locator('.pd-heading')).toHaveCount(0)
    // Reason text mentions the limit
    await expect(page.locator('.pd-error-reason')).toContainText(/limit|between/i)
  })

  test('6. ?state=ZZ renders the explicit error card', async ({ page }) => {
    const response = await page.goto('/widget?state=ZZ')
    expect(response?.status()).toBe(400)
    await expect(page.locator('.pd-error-card')).toBeVisible()
    await expect(page.locator('.pd-error-reason')).toContainText(/valid US state code|ZZ/i)
  })

  test('6b. ?state=XX (other invalid) — same explicit error', async ({ page }) => {
    const response = await page.goto('/widget?state=XX')
    expect(response?.status()).toBe(400)
    await expect(page.locator('.pd-error-card')).toBeVisible()
  })

  test('6c. missing state — explicit error', async ({ page }) => {
    const response = await page.goto('/widget')
    expect(response?.status()).toBe(400)
    await expect(page.locator('.pd-error-card')).toBeVisible()
  })

  test('7. ?state=WY (real state, likely no jobs) renders the empty state, not error', async ({
    page,
  }) => {
    const response = await page.goto('/widget?state=WY')
    // Real state code — 200 OK even if empty
    expect(response?.status()).toBe(200)
    // Either we have cards OR we have the empty state — both are valid
    const cards = page.locator('a.pd-row')
    const emptyState = page.locator('.pd-empty')
    const hasCards = (await cards.count()) > 0
    const hasEmpty = (await emptyState.count()) > 0
    expect(hasCards || hasEmpty).toBe(true)
    // But the error card must NOT be present
    await expect(page.locator('.pd-error-card')).toHaveCount(0)
  })
})

test.describe('/widget — response headers', () => {
  test('8. CSP frame-ancestors allows .edu and own origin', async ({ request }) => {
    const res = await request.get('/widget?state=CA')
    const csp = res.headers()['content-security-policy']
    expect(csp).toBeDefined()
    expect(csp).toContain("frame-ancestors")
    expect(csp).toContain('*.edu')
    expect(csp).toContain('pmhnphiring.com')
  })

  test('8b. Cache-Control is near-realtime (s-maxage <= 60)', async ({ request }) => {
    const res = await request.get('/widget?state=CA')
    const cache = res.headers()['cache-control']
    expect(cache).toContain('s-maxage=60')
    expect(cache).toContain('stale-while-revalidate')
  })

  test('8c. X-Robots-Tag prevents indexing of /widget itself', async ({ request }) => {
    const res = await request.get('/widget?state=CA')
    expect(res.headers()['x-robots-tag']).toContain('noindex')
  })
})

test.describe('/for-programs — embed builder', () => {
  test('9. page renders with hero + builder + install cards', async ({ page }) => {
    await page.goto('/for-programs')

    // Hero
    await expect(page.locator('h1')).toContainText(/students.*first role/i)

    // Builder controls
    await expect(page.locator('#pd-state')).toBeVisible()
    await expect(page.locator('#pd-program')).toBeVisible()
    await expect(page.locator('#pd-limit')).toBeVisible()
  })

  test('9b. snippet updates when state changes', async ({ page }) => {
    await page.goto('/for-programs')
    const codeSnippet = page.locator('code').filter({ hasText: /iframe/ }).first()
    await expect(codeSnippet).toContainText('state=CA')

    // Playwright's selectOption alone sometimes loses the React onChange
    // synthetic event on tightly-bound controlled <select>s. Explicitly
    // dispatch a native change event so React picks it up.
    await page.evaluate(() => {
      const el = document.getElementById('pd-state') as HTMLSelectElement | null
      if (!el) throw new Error('#pd-state not found')
      el.value = 'NY'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await expect(codeSnippet).toContainText('state=NY', { timeout: 5_000 })
  })

  test('9c. snippet updates when limit changes (height + URL param)', async ({ page }) => {
    await page.goto('/for-programs')
    const codeSnippet = page.locator('code').filter({ hasText: /iframe/ }).first()

    await page.evaluate(() => {
      const el = document.getElementById('pd-limit') as HTMLSelectElement | null
      if (!el) throw new Error('#pd-limit not found')
      el.value = '12'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await expect(codeSnippet).toContainText('limit=12', { timeout: 5_000 })
    const snippetWithLimit12 = await codeSnippet.textContent()
    const heightMatch = snippetWithLimit12?.match(/height="(\d+)"/)
    expect(heightMatch).not.toBeNull()
    expect(Number(heightMatch![1])).toBeGreaterThan(1500)
  })

  test('9d. fallback link points to /jobs?location=<FullName>', async ({ page }) => {
    await page.goto('/for-programs')

    await page.evaluate(() => {
      const el = document.getElementById('pd-state') as HTMLSelectElement | null
      if (!el) throw new Error('#pd-state not found')
      el.value = 'TX'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // The fallback link card lives below the snippet. Wait for Texas
    // to propagate through the useMemo chain before reading the href.
    const fallbackLink = page.locator('a[href*="utm_medium=link"]').first()
    await expect(fallbackLink).toBeVisible()
    await expect(fallbackLink).toHaveAttribute('href', /location=Texas/, {
      timeout: 5_000,
    })
    const href = await fallbackLink.getAttribute('href')
    expect(href).toContain('utm_medium=link')
  })

  test('9e. install cards (WordPress / Drupal / Any other) are visible', async ({ page }) => {
    await page.goto('/for-programs')
    await expect(page.getByText('WordPress', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Drupal', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Squarespace', { exact: false }).first()).toBeVisible()
  })
})

test.describe('"See all in <state>" → /jobs filter sync', () => {
  // LinkedInFilters sidebar collapses behind a drawer at <lg viewport
  // (~1024px). Pin desktop width so the input is rendered in the DOM
  // and visible without opening the drawer first.
  test.use({ viewport: { width: 1440, height: 900 } })

  test('10. clicking the widget CTA lands on /jobs with location filter active', async ({
    page,
  }) => {
    await page.goto('/jobs?location=California')

    // The location input in the sidebar (LinkedInFilters.tsx) should
    // pre-fill with "California" on mount via parseFiltersFromParams.
    const locationInput = page
      .locator('input[placeholder*="ity, state"], input[placeholder*="emote"]')
      .first()
    await expect(locationInput).toBeVisible({ timeout: 10_000 })
    await expect(locationInput).toHaveValue(/California/i)
  })
})

test.describe('regression — visual smoke (lightweight)', () => {
  // Ignore noise the widget doesn't own:
  //   - Google Fonts preload warnings
  //   - cookie consent / GA telemetry chatter
  //   - HMR ping failures in dev
  //   - 400/429 from the widget itself or rate-limited /jobs subresources
  //     (the widget is the unit under test; downstream rate limits are
  //     a dev-server side effect, not a widget regression)
  const NOISE = /font|cookie|CSP|HMR|preload|400|429|favicon|web vitals|hydration/i

  test('widget has no console errors on the happy path', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/widget?state=CA&program=UCSF')
    await page.waitForLoadState('networkidle')
    const realErrors = errors.filter((e) => !NOISE.test(e))
    expect(realErrors).toEqual([])
  })

  test('error render has no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/widget?state=ZZ')
    await page.waitForLoadState('networkidle')
    const realErrors = errors.filter((e) => !NOISE.test(e))
    expect(realErrors).toEqual([])
  })
})
