import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { shortlinkRedirect: {} },
}))

vi.mock('@/lib/shortlinks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shortlinks')>()
  return { ...actual, recordClick: vi.fn().mockResolvedValue(undefined) }
})

import { GET } from '@/app/r/[code]/route'
import { recordClick } from '@/lib/shortlinks'

const APOLLO_CONTACT_ID = '6a9069a5318fa10014a1e0df'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

function call(code: string, query = '', method = 'GET') {
  const req = new NextRequest(`https://pmhnphiring.com/r/${code}${query}`, {
    method,
    headers: { 'user-agent': BROWSER_UA },
  })
  return GET(req, { params: Promise.resolve({ code }) })
}

describe('/r/e<n> employer email links', () => {
  beforeEach(() => {
    vi.mocked(recordClick).mockClear()
  })

  it('redirects to the page the email names and records who clicked', async () => {
    const res = await call('e2', `?r=${APOLLO_CONTACT_ID}`)
    expect(res.status).toBe(302)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/post-job')
    expect(recordClick).toHaveBeenCalledTimes(1)
    const input = vi.mocked(recordClick).mock.calls[0][0]
    expect(input.recipientLeadId).toBe(APOLLO_CONTACT_ID)
    expect(input.resolution.platform).toBe('email')
    expect(input.bot.isBot).toBe(false)
  })

  it('still redirects when the merge field rendered empty, without a recipient', async () => {
    const res = await call('e1', '?r=')
    expect(new URL(res.headers.get('location')!).pathname).toBe('/')
    expect(vi.mocked(recordClick).mock.calls[0][0].recipientLeadId).toBeNull()
  })

  it('drops an unrendered merge tag instead of storing it', async () => {
    await call('e1', `?r=${encodeURIComponent('{{ref}}')}`)
    expect(vi.mocked(recordClick).mock.calls[0][0].recipientLeadId).toBeNull()
  })

  it('does not record HEAD probes from link checkers and mail scanners', async () => {
    const res = await call('e2', `?r=${APOLLO_CONTACT_ID}`, 'HEAD')
    expect(res.status).toBe(302)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/post-job')
    expect(recordClick).not.toHaveBeenCalled()
  })

  it('sends an unknown email placement to /jobs without recording it', async () => {
    const res = await call('e99', `?r=${APOLLO_CONTACT_ID}`)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/jobs')
    expect(recordClick).not.toHaveBeenCalled()
  })
})
