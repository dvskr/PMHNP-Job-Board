import { describe, it, expect } from 'vitest'
import { resolveShortlink } from '@/lib/shortlinks/resolver'
import { ACTIVE_CAMPAIGN, PLATFORM_BY_LETTER } from '@/lib/shortlinks/campaigns'
import type { ShortlinkCampaign } from '@/lib/shortlinks/types'

const BASE = 'https://pmhnphiring.com'

describe('resolveShortlink — invalid input', () => {
  it.each([
    ['empty', ''],
    ['too long', 'aaaaaaaaaa'],
    ['no digits', 'fff'],
    ['leading digit', '3f'],
    ['letter only', 'f'],
    ['punctuation', 'f-3'],
    ['spaces', ' f3'],
    ['null-ish string', 'null'],
    ['negative not allowed (pattern excludes minus)', '-1'],
  ])('rejects %s → %j', (_label, code) => {
    expect(resolveShortlink(code, BASE)).toBeNull()
  })

  it('rejects unknown platform letters', () => {
    expect(resolveShortlink('z3', BASE)).toBeNull()
    expect(resolveShortlink('q1', BASE)).toBeNull()
  })

  it('rejects unknown job numbers', () => {
    expect(resolveShortlink('f99', BASE)).toBeNull()
    expect(resolveShortlink('i12', BASE)).toBeNull()
  })

  it('handles non-string input defensively', () => {
    // Real route handlers receive strings from zod, but defensive
    // call sites in tests / scripts may not.
    expect(resolveShortlink(null as unknown as string, BASE)).toBeNull()
    expect(resolveShortlink(undefined as unknown as string, BASE)).toBeNull()
    expect(resolveShortlink(42 as unknown as string, BASE)).toBeNull()
  })
})

describe('resolveShortlink — browse-all (id=0)', () => {
  it('resolves to /jobs with browse-all content for every platform', () => {
    for (const [letter, source] of Object.entries(PLATFORM_BY_LETTER)) {
      const r = resolveShortlink(`${letter}0`, BASE)
      expect(r, `code ${letter}0`).not.toBeNull()
      expect(r!.destinationPath).toBe('/jobs')
      expect(r!.destination).toBe(`${BASE}/jobs`)
      expect(r!.platform).toBe(source)
      expect(r!.content).toBe('browse-all')
      expect(r!.jobId).toBe(0)
    }
  })
})

describe('resolveShortlink — active campaign', () => {
  it('produces a bare /jobs/<slug> destination with no query params', () => {
    const r = resolveShortlink('i1', BASE)
    expect(r).not.toBeNull()
    const parsed = new URL(r!.destination)
    expect(parsed.pathname).toBe(`/jobs/${ACTIVE_CAMPAIGN.jobs[0].slug}`)
    expect(parsed.search).toBe('')
    expect(r!.destinationPath).toBe(`/jobs/${ACTIVE_CAMPAIGN.jobs[0].slug}`)
    expect(r!.platform).toBe('instagram')
    expect(r!.content).toBe(ACTIVE_CAMPAIGN.jobs[0].content)
    expect(r!.jobId).toBe(1)
    expect(r!.campaign).toBe(ACTIVE_CAMPAIGN.campaign)
  })

  it('maps each platform letter to the documented source', () => {
    for (const [letter, source] of Object.entries(PLATFORM_BY_LETTER)) {
      const r = resolveShortlink(`${letter}1`, BASE)
      expect(r, `code ${letter}1`).not.toBeNull()
      expect(r!.platform).toBe(source)
    }
  })

  it('is case-insensitive on the platform letter', () => {
    const lower = resolveShortlink('f3', BASE)
    const upper = resolveShortlink('F3', BASE)
    expect(lower).not.toBeNull()
    expect(upper).toEqual(lower)
  })

  it('produces a distinct destination for every active job code', () => {
    const seen = new Set<string>()
    for (const job of ACTIVE_CAMPAIGN.jobs) {
      const r = resolveShortlink(`f${job.id}`, BASE)
      expect(r, `code f${job.id}`).not.toBeNull()
      expect(seen.has(r!.destination), `duplicate for ${job.content}`).toBe(false)
      seen.add(r!.destination)
    }
    expect(seen.size).toBe(ACTIVE_CAMPAIGN.jobs.length)
  })

  it('returns a frozen object so callers cannot mutate shared state', () => {
    const r = resolveShortlink('f1', BASE)
    expect(r).not.toBeNull()
    expect(Object.isFrozen(r!)).toBe(true)
  })

  it('trims a trailing slash on baseUrl', () => {
    const r1 = resolveShortlink('f1', 'https://example.com')
    const r2 = resolveShortlink('f1', 'https://example.com/')
    expect(r1!.destination).toBe(r2!.destination)
  })
})

describe('resolveShortlink — custom campaign', () => {
  const custom: ShortlinkCampaign = {
    campaign: 'test-campaign-2030',
    jobs: [{ id: 1, slug: 'fake-slug-abc', content: 'fake-content' }],
  }

  it('uses the passed campaign instead of the active default', () => {
    const r = resolveShortlink('l1', BASE, custom)
    expect(r).not.toBeNull()
    expect(r!.campaign).toBe('test-campaign-2030')
    expect(r!.destinationPath).toBe('/jobs/fake-slug-abc')
    expect(r!.content).toBe('fake-content')
  })

  it('still supports browse-all on a custom campaign', () => {
    const r = resolveShortlink('f0', BASE, custom)
    expect(r).not.toBeNull()
    expect(r!.content).toBe('browse-all')
    expect(r!.campaign).toBe('test-campaign-2030')
  })
})
