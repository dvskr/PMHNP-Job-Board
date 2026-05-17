import { test, expect } from '@playwright/test'

/**
 * E2E coverage for the Program Directors campaign surfaces:
 *   - /widget route (state filter, limit param, validation, empty states)
 *   - /for-programs landing page (sections, embed builder controls)
 *
 * Read-only. No auth, no mutations. Safe against production —
 *   PLAYWRIGHT_BASE_URL=https://pmhnphiring.com npx playwright test widget-and-programs
 *
 * Run locally:
 *   npx playwright test widget-and-programs
 *   npx playwright test widget-and-programs --ui   # debug mode
 */

// ─── /widget — core render ──────────────────────────────────────────

test.describe('/widget — core', () => {
  test('renders brand wordmark, heading, CTA, and at least one job card for CA', async ({ page }) => {
    await page.goto('/widget?state=CA&program=UCSF')

    // Brand wordmark (mirrors nav bar)
    await expect(page.locator('.pd-brand-mark')).toContainText('PMHNP')
    await expect(page.locator('.pd-brand-mark-accent')).toContainText('Hiring')
    await expect(page.locator('.pd-brand-logo')).toHaveAttribute('src', /\/logo\.png/)

    // Heading + program-specific subtitle
    await expect(page.locator('.pd-heading')).toContainText('Latest PMHNP Jobs in CA')
    await expect(page.locator('.pd-sub')).toContainText('Curated for UCSF students')

    // CTA button to /jobs?location=California
    const cta = page.locator('.pd-cta')
    await expect(cta).toContainText('See all in CA')
    await expect(cta).toHaveAttribute('href', /\/jobs\?location=California/)

    // At least one job card present (CA has plenty of inventory)
    await expect(page.locator('.pd-row').first()).toBeVisible()
  })

  test('respects ?limit=3 (renders exactly 3 cards)', async ({ page }) => {
    await page.goto('/widget?state=CA&limit=3')
    await expect(page.locator('.pd-row')).toHaveCount(3)
  })

  test('respects ?limit=12 (renders up to 12 cards)', async ({ page }) => {
    await page.goto('/widget?state=CA&limit=12')
    const count = await page.locator('.pd-row').count()
    expect(count).toBeGreaterThan(6)
    expect(count).toBeLessThanOrEqual(12)
  })

  test('defaults to 6 cards when no ?limit', async ({ page }) => {
    await page.goto('/widget?state=CA')
    const count = await page.locator('.pd-row').count()
    expect(count).toBeLessThanOrEqual(6)
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

// ─── /widget — empty state + validation ─────────────────────────────

test.describe('/widget — validation & empty state', () => {
  test('renders empty state for a real but inventory-empty state (WY)', async ({ page }) => {
    const res = await page.goto('/widget?state=WY')
    expect(res?.status()).toBe(200)
    await expect(page.locator('.pd-heading')).toContainText('Jobs in WY')
    await expect(page.locator('.pd-empty')).toBeVisible()
    await expect(page.locator('.pd-empty')).toContainText('No PMHNP roles currently listed')
    await expect(page.locator('.pd-row')).toHaveCount(0)
  })

  test('rejects nonexistent state code ZZ (returns 400, empty render, generic heading)', async ({ page }) => {
    const res = await page.goto('/widget?state=ZZ')
    expect(res?.status()).toBe(400)
    // Heading should NOT say "Jobs in ZZ" any more — ZZ fails refine() so
    // we fall through to the US fallback.
    await expect(page.locator('.pd-heading')).toContainText('Jobs in US')
    await expect(page.locator('.pd-empty')).toBeVisible()
  })

  test('rejects limit=99 but preserves valid state in heading (CA, not US)', async ({ page }) => {
    const res = await page.goto('/widget?state=CA&limit=99')
    expect(res?.status()).toBe(400)
    // Only the limit was invalid; state CA is valid, so heading should
    // still say CA — this is the bug we fixed.
    await expect(page.locator('.pd-heading')).toContainText('Jobs in CA')
    await expect(page.locator('.pd-empty')).toBeVisible()
  })

  test('rejects limit=2 (below min of 3)', async ({ page }) => {
    const res = await page.goto('/widget?state=CA&limit=2')
    expect(res?.status()).toBe(400)
  })
})

// ─── /widget — job-card content ─────────────────────────────────────

test.describe('/widget — job-card content', () => {
  test('every visible job card carries title + employer + a direct/easy apply button', async ({ page }) => {
    await page.goto('/widget?state=CA')
    const rows = page.locator('.pd-row')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i)
      await expect(row.locator('.pd-title')).not.toBeEmpty()
      await expect(row.locator('.pd-employer')).not.toBeEmpty()
      // Either Direct Apply OR Easy Apply — never External
      const applyText = await row.locator('.pd-btn--direct, .pd-btn--easy').first().innerText()
      expect(applyText).toMatch(/Direct Apply|Easy Apply/)
    }
  })

  test('clicking a job card opens an external destination with UTM params', async ({ page }) => {
    await page.goto('/widget?state=CA&program=UCSF')
    const firstCard = page.locator('.pd-row').first()
    const href = await firstCard.getAttribute('href')
    expect(href).toBeTruthy()
    expect(href!).toMatch(/utm_source=widget/)
    expect(href!).toMatch(/utm_medium=embed/)
    expect(href!).toMatch(/utm_campaign=pd-ucsf/)
  })

  test('correct response headers for iframe embedding', async ({ request }) => {
    const res = await request.get('/widget?state=CA')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')
    // CSP allows .edu iframe embedding
    expect(res.headers()['content-security-policy']).toContain('frame-ancestors')
    expect(res.headers()['content-security-policy']).toContain('*.edu')
    // Cache-control supports near-realtime updates
    expect(res.headers()['cache-control']).toContain('s-maxage=60')
  })
})

// ─── /for-programs — landing page sections ──────────────────────────

test.describe('/for-programs — page sections', () => {
  test('hero, three offers, embed builder, install cards, FAQ all present', async ({ page }) => {
    await page.goto('/for-programs')

    // Hero
    await expect(page.getByRole('heading', { name: /Help Your PMHNP Students/i, level: 1 })).toBeVisible()

    // Three offer cards (Widget / Placement Report / AI Resume Reviewer)
    await expect(page.getByRole('heading', { name: /Embeddable Jobs Widget/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Quarterly Placement Report/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /AI Resume Reviewer/i })).toBeVisible()

    // Demo section
    await expect(page.getByRole('heading', { name: /See The Widget On A Real Page/i })).toBeVisible()

    // How to install (3-card install grid)
    await expect(page.getByRole('heading', { name: /How To Install The Widget/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /WordPress/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Drupal/i })).toBeVisible()

    // FAQ
    await expect(page.getByRole('heading', { name: /Frequently Asked/i })).toBeVisible()
  })

  test('email CTAs use hello@pmhnphiring.com', async ({ page }) => {
    await page.goto('/for-programs')
    const mailtos = await page.locator('a[href^="mailto:"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href') ?? ''),
    )
    expect(mailtos.length).toBeGreaterThan(0)
    for (const href of mailtos) {
      expect(href.toLowerCase()).toContain('hello@pmhnphiring.com')
    }
  })
})

// ─── /for-programs — embed builder interactivity ────────────────────

test.describe('/for-programs — embed builder', () => {
  test('changing state updates iframe src and snippet', async ({ page }) => {
    await page.goto('/for-programs')

    const stateSelect = page.locator('#pd-state')
    await stateSelect.selectOption('NY')

    // Iframe src reflects new state
    const iframe = page.locator('iframe[title*="Live PMHNP jobs widget"]')
    await expect(iframe).toHaveAttribute('src', /state=NY/)

    // Snippet code block reflects new state
    const codeBlock = page.locator('code', { hasText: '<iframe' })
    await expect(codeBlock.first()).toContainText('state=NY')

    // Fallback link reflects the full state name
    await expect(page.getByRole('link', { name: /\/jobs\?location=New\+York/i })).toBeVisible()
  })

  test('changing program updates snippet and subtitle', async ({ page }) => {
    await page.goto('/for-programs')

    const programInput = page.locator('#pd-program')
    await programInput.fill('UCSF School of Nursing')

    const codeBlock = page.locator('code', { hasText: '<iframe' })
    await expect(codeBlock.first()).toContainText('program=UCSF+School+of+Nursing')
  })

  test('changing jobs-to-show updates iframe height and snippet height attr', async ({ page }) => {
    await page.goto('/for-programs')

    const limitSelect = page.locator('#pd-limit')
    await limitSelect.selectOption('12')

    const codeBlock = page.locator('code', { hasText: '<iframe' })
    // 240 base + 170 * 12 = 2280
    await expect(codeBlock.first()).toContainText('height="2280"')

    const iframe = page.locator('iframe[title*="Live PMHNP jobs widget"]')
    await expect(iframe).toHaveAttribute('src', /limit=12/)
  })

  test('copy snippet button toggles to "Copied" after click', async ({ page, context }) => {
    // Grant clipboard permissions so writeText resolves rather than rejecting
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: page.url() || 'http://localhost:3000',
    })
    await page.goto('/for-programs')

    const copyBtn = page.getByRole('button', { name: /Copy snippet/i })
    await copyBtn.click()
    await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible()
  })

  test('fallback section shows for iframe-blocked sites', async ({ page }) => {
    await page.goto('/for-programs')
    await expect(page.getByText(/Site blocks iframes/i)).toBeVisible()
    // Fallback link points to the /jobs?location= URL
    await expect(page.getByRole('link', { name: /\/jobs\?location=/i })).toBeVisible()
  })
})

// ─── /for-programs → embedded widget → click "See all" filter sync ──

test.describe('integration: widget "See all" → /jobs filter sync', () => {
  test('CTA in widget routes to /jobs?location=California and the location filter chip shows', async ({ page }) => {
    await page.goto('/widget?state=CA&program=UCSF')

    // Capture the CTA href, then navigate to it (target=_blank breaks
    // automation; navigate directly to test the filter sync).
    const cta = page.locator('.pd-cta')
    const href = await cta.getAttribute('href')
    expect(href).toBeTruthy()

    await page.goto(href!)

    // The /jobs page should now show "California" pre-filled in the
    // location input — that's the LinkedInFilters useEffect picking up
    // `?location=California` from the URL.
    const locationInput = page.locator('input[placeholder*="ity, state"]')
    await expect(locationInput).toHaveValue(/California/i)
  })
})
