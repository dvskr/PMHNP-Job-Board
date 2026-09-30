import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import {
  ATTRIBUTION_COOKIE,
  parseAttributionCookie,
  withCampaignParams,
} from '@/lib/analytics'

/** The cookie exactly as middleware writes it when it strips utm_* params. */
function middlewareCookie(value: Record<string, string | null>): string {
  const res = NextResponse.redirect('https://pmhnphiring.com/jobs', 301)
  res.cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(value), { path: '/', sameSite: 'lax' })
  const header = res.headers.get('set-cookie') ?? ''
  return header.split(';')[0]
}

describe('parseAttributionCookie', () => {
  it('reads back what middleware writes', () => {
    const cookie = middlewareCookie({ source: 'widget', campaign: 'pd-some-program', medium: 'embed' })
    expect(parseAttributionCookie(`other=1; ${cookie}; theme=dark`)).toEqual({
      source: 'widget',
      medium: 'embed',
      campaign: 'pd-some-program',
    })
  })

  it('keeps the fields that are present when some are null', () => {
    const cookie = middlewareCookie({ source: 'linkedin', campaign: null, medium: null })
    expect(parseAttributionCookie(cookie)).toEqual({ source: 'linkedin', medium: undefined, campaign: undefined })
  })

  it('returns null when the cookie is absent', () => {
    expect(parseAttributionCookie('')).toBeNull()
    expect(parseAttributionCookie('theme=dark; x=1')).toBeNull()
  })

  it('returns null for a value that is not JSON', () => {
    expect(parseAttributionCookie(`${ATTRIBUTION_COOKIE}=not-json`)).toBeNull()
    expect(parseAttributionCookie(`${ATTRIBUTION_COOKIE}=%E0%A4%A`)).toBeNull()
  })

  it('drops values that are not plain slugs instead of forwarding them', () => {
    const cookie = middlewareCookie({
      source: '<script>',
      medium: 'a'.repeat(101),
      campaign: 'ok_campaign.1',
    })
    expect(parseAttributionCookie(cookie)).toEqual({ source: undefined, medium: undefined, campaign: 'ok_campaign.1' })
  })

  it('returns null when every value is dropped', () => {
    const cookie = middlewareCookie({ source: 'bad value', medium: null, campaign: null })
    expect(parseAttributionCookie(cookie)).toBeNull()
  })
})

describe('withCampaignParams', () => {
  it('adds utm_* params and keeps the existing query and hash', () => {
    const out = new URL(
      withCampaignParams('https://pmhnphiring.com/jobs?location=Texas#top', {
        source: 'widget',
        medium: 'embed',
        campaign: 'pd-x',
      }),
    )
    expect(out.pathname).toBe('/jobs')
    expect(out.hash).toBe('#top')
    expect(out.searchParams.get('location')).toBe('Texas')
    expect(out.searchParams.get('utm_source')).toBe('widget')
    expect(out.searchParams.get('utm_medium')).toBe('embed')
    expect(out.searchParams.get('utm_campaign')).toBe('pd-x')
  })

  it('omits params that have no value', () => {
    const out = new URL(withCampaignParams('https://pmhnphiring.com/', { source: 'linkedin' }))
    expect(out.searchParams.get('utm_source')).toBe('linkedin')
    expect(out.searchParams.has('utm_medium')).toBe(false)
    expect(out.searchParams.has('utm_campaign')).toBe(false)
  })

  it('returns the input unchanged when it is not a URL', () => {
    expect(withCampaignParams('not a url', { source: 'x' })).toBe('not a url')
  })
})

describe('trackPageView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function loadWithBrowser(cookie: string) {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST')
    const calls: unknown[][] = []
    const doc = { cookie, title: 'PMHNP Jobs' }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', {
      location: { href: 'https://pmhnphiring.com/jobs' },
      dataLayer: [],
      gtag: (...args: unknown[]) => calls.push(args),
    })
    vi.resetModules()
    const analytics = await import('@/lib/analytics')
    return { analytics, calls, doc }
  }

  it('restores utm_* on the first page view after a tagged landing, then clears the cookie', async () => {
    const cookie = middlewareCookie({ source: 'widget', campaign: 'pd-x', medium: 'embed' })
    const { analytics, calls, doc } = await loadWithBrowser(cookie)

    analytics.trackPageView('/jobs')
    const first = calls[0][2] as { page_location: string }
    const firstUrl = new URL(first.page_location)
    expect(firstUrl.searchParams.get('utm_source')).toBe('widget')
    expect(firstUrl.searchParams.get('utm_campaign')).toBe('pd-x')
    expect(doc.cookie).toContain('Max-Age=0')

    // The browser has dropped the expired cookie; the next view is untagged.
    doc.cookie = ''
    analytics.trackPageView('/jobs/x')
    const second = calls[1][2] as { page_location: string }
    expect(new URL(second.page_location).searchParams.has('utm_source')).toBe(false)
  })

  it('keeps the tagged page view as the first page view of the load', async () => {
    // On mount UserIdentitySync calls setUserId before RouteChangeTracker's
    // delayed trackPageView. GA4 takes the session source from the first
    // page_view, so setUserId must not send one.
    const cookie = middlewareCookie({ source: 'linkedin', campaign: 'page_button', medium: 'company_page' })
    const { analytics, calls } = await loadWithBrowser(cookie)

    analytics.setUserId(null)
    analytics.trackPageView('/')

    const configs = calls.filter((c) => c[0] === 'config')
    expect(configs).toHaveLength(1)
    const pageLocation = (configs[0][2] as { page_location: string }).page_location
    expect(new URL(pageLocation).searchParams.get('utm_source')).toBe('linkedin')
    expect(calls[0]).toEqual(['set', { user_id: null }])
  })

  it('sends the plain location when there is no attribution cookie', async () => {
    const { analytics, calls } = await loadWithBrowser('theme=dark')
    analytics.trackPageView('/jobs')
    expect((calls[0][2] as { page_location: string }).page_location).toBe('https://pmhnphiring.com/jobs')
  })
})
