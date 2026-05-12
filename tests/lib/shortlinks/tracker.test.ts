import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashIp, recordClick } from '@/lib/shortlinks/tracker'
import type { ShortlinkResolution } from '@/lib/shortlinks/types'

const RESOLUTION: ShortlinkResolution = Object.freeze({
  destination: 'https://pmhnphiring.com/jobs/foo',
  destinationPath: '/jobs/foo',
  platform: 'facebook',
  campaign: 'test-campaign',
  content: 'foo-content',
  jobId: 3,
})

const NOT_A_BOT = { isBot: false, botName: null } as const
const A_BOT = { isBot: true, botName: 'facebookexternalhit' } as const

describe('hashIp', () => {
  it('returns null when ip is missing or blank', () => {
    expect(hashIp(null)).toBeNull()
    expect(hashIp(undefined)).toBeNull()
    expect(hashIp('')).toBeNull()
    expect(hashIp('   ')).toBeNull()
  })

  it('returns the same hash for the same IP on the same day', () => {
    const fixed = new Date('2026-05-12T10:00:00Z')
    const a = hashIp('1.2.3.4', fixed)
    const b = hashIp('1.2.3.4', new Date('2026-05-12T23:59:59Z'))
    expect(a).toBe(b)
  })

  it('returns a different hash for the same IP on a different day', () => {
    const a = hashIp('1.2.3.4', new Date('2026-05-12T10:00:00Z'))
    const b = hashIp('1.2.3.4', new Date('2026-05-13T10:00:00Z'))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different IPs on the same day', () => {
    const fixed = new Date('2026-05-12T10:00:00Z')
    expect(hashIp('1.2.3.4', fixed)).not.toBe(hashIp('5.6.7.8', fixed))
  })

  it('returns a sha256-shaped hex string (64 chars)', () => {
    const h = hashIp('1.2.3.4', new Date('2026-05-12T10:00:00Z'))
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not include the raw IP in the hash output', () => {
    const h = hashIp('203.0.113.42', new Date('2026-05-12T10:00:00Z'))!
    expect(h.includes('203')).toBe(false)
    expect(h.includes('113')).toBe(false)
  })
})

describe('recordClick', () => {
  beforeEach(() => {
    vi.mocked(prisma.shortLinkClick.findFirst).mockReset()
    vi.mocked(prisma.shortLinkClick.create).mockReset()
  })

  it('writes a row for a real (non-bot) click', async () => {
    vi.mocked(prisma.shortLinkClick.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.shortLinkClick.create).mockResolvedValueOnce({} as never)

    await recordClick({
      resolution: RESOLUTION,
      code: 'f3',
      bot: NOT_A_BOT,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: 'https://www.facebook.com/',
      country: 'us',
    })

    expect(prisma.shortLinkClick.create).toHaveBeenCalledOnce()
    const arg = vi.mocked(prisma.shortLinkClick.create).mock.calls[0][0]
    expect(arg.data.code).toBe('f3')
    expect(arg.data.campaign).toBe('test-campaign')
    expect(arg.data.platform).toBe('facebook')
    expect(arg.data.jobId).toBe(3)
    expect(arg.data.destinationPath).toBe('/jobs/foo')
    expect(arg.data.isBot).toBe(false)
    expect(arg.data.botName).toBeNull()
    expect(arg.data.country).toBe('US')
    expect(arg.data.ipHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('writes a row for a bot click WITHOUT a dedup lookup', async () => {
    vi.mocked(prisma.shortLinkClick.create).mockResolvedValueOnce({} as never)

    await recordClick({
      resolution: RESOLUTION,
      code: 'f3',
      bot: A_BOT,
      ip: '1.2.3.4',
      userAgent: 'facebookexternalhit/1.1',
      referer: null,
      country: null,
    })

    expect(prisma.shortLinkClick.findFirst).not.toHaveBeenCalled()
    expect(prisma.shortLinkClick.create).toHaveBeenCalledOnce()
    const arg = vi.mocked(prisma.shortLinkClick.create).mock.calls[0][0]
    expect(arg.data.isBot).toBe(true)
    expect(arg.data.botName).toBe('facebookexternalhit')
  })

  it('skips insert if the same (code, ipHash) clicked within the dedup window', async () => {
    vi.mocked(prisma.shortLinkClick.findFirst).mockResolvedValueOnce({ id: 'existing' } as never)

    await recordClick({
      resolution: RESOLUTION,
      code: 'f3',
      bot: NOT_A_BOT,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: null,
      country: null,
    })

    expect(prisma.shortLinkClick.findFirst).toHaveBeenCalledOnce()
    expect(prisma.shortLinkClick.create).not.toHaveBeenCalled()
  })

  it('proceeds with insert if the dedup lookup fails', async () => {
    vi.mocked(prisma.shortLinkClick.findFirst).mockRejectedValueOnce(new Error('db down'))
    vi.mocked(prisma.shortLinkClick.create).mockResolvedValueOnce({} as never)

    await expect(
      recordClick({
        resolution: RESOLUTION,
        code: 'f3',
        bot: NOT_A_BOT,
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        referer: null,
        country: null,
      }),
    ).resolves.toBeUndefined()
    expect(prisma.shortLinkClick.create).toHaveBeenCalledOnce()
  })

  it('never throws even if the create fails — it must not break the redirect', async () => {
    vi.mocked(prisma.shortLinkClick.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.shortLinkClick.create).mockRejectedValueOnce(new Error('insert failed'))

    await expect(
      recordClick({
        resolution: RESOLUTION,
        code: 'f3',
        bot: NOT_A_BOT,
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        referer: null,
        country: null,
      }),
    ).resolves.toBeUndefined()
  })

  it('truncates oversized user-agent and referer strings', async () => {
    vi.mocked(prisma.shortLinkClick.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.shortLinkClick.create).mockResolvedValueOnce({} as never)

    const longUa = 'X'.repeat(2000)
    const longRef = 'Y'.repeat(2000)

    await recordClick({
      resolution: RESOLUTION,
      code: 'f3',
      bot: NOT_A_BOT,
      ip: '1.2.3.4',
      userAgent: longUa,
      referer: longRef,
      country: null,
    })

    const arg = vi.mocked(prisma.shortLinkClick.create).mock.calls[0][0]
    expect(arg.data.userAgent!.length).toBeLessThanOrEqual(512)
    expect(arg.data.referer!.length).toBeLessThanOrEqual(512)
  })

  it('normalizes 2-letter country codes to uppercase; drops invalid codes', async () => {
    vi.mocked(prisma.shortLinkClick.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.shortLinkClick.create).mockResolvedValueOnce({} as never)

    await recordClick({
      resolution: RESOLUTION,
      code: 'f3',
      bot: NOT_A_BOT,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: null,
      country: 'us',
    })
    expect(vi.mocked(prisma.shortLinkClick.create).mock.calls[0][0].data.country).toBe('US')

    vi.mocked(prisma.shortLinkClick.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.shortLinkClick.create).mockResolvedValueOnce({} as never)
    await recordClick({
      resolution: RESOLUTION,
      code: 'f3',
      bot: NOT_A_BOT,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      referer: null,
      country: 'USA',
    })
    expect(vi.mocked(prisma.shortLinkClick.create).mock.calls[1][0].data.country).toBeNull()
  })

  it('skips the dedup lookup when no ip is provided', async () => {
    vi.mocked(prisma.shortLinkClick.create).mockResolvedValueOnce({} as never)

    await recordClick({
      resolution: RESOLUTION,
      code: 'f3',
      bot: NOT_A_BOT,
      ip: null,
      userAgent: 'Mozilla/5.0',
      referer: null,
      country: null,
    })

    expect(prisma.shortLinkClick.findFirst).not.toHaveBeenCalled()
    expect(prisma.shortLinkClick.create).toHaveBeenCalledOnce()
    const arg = vi.mocked(prisma.shortLinkClick.create).mock.calls[0][0]
    expect(arg.data.ipHash).toBeNull()
  })
})
