import { describe, expect, it } from 'vitest'
import { contactedFromLog } from '../../scripts/marketing/outreach-report'

const A = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', company: 'Example Psychiatry', domain: 'example-psych.test' }
const B = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', company: 'Sample Therapy', domain: 'sample-therapy.test' }
const C = { id: 'cccccccccccccccccccccccc', company: 'Example Psychiatry', domain: 'Example-Psych.test' }

describe('contactedFromLog', () => {
  it('drops a contact stopped before their first email', () => {
    const out = contactedFromLog({
      events: [
        { at: '2026-01-01T10:00Z', action: 'enrolled', contacts: [A, B] },
        { at: '2026-01-01T12:00Z', action: 'stopped before touch 1 sent', contacts: [B] },
      ],
    })
    expect([...out.contacts.keys()]).toEqual([A.id])
    expect([...out.domains.keys()]).toEqual(['example-psych.test'])
  })

  it('keeps a contact re-enrolled after an earlier stop, whatever order the log is written in', () => {
    const out = contactedFromLog({
      events: [
        { at: '2026-01-05T10:00Z', action: 'enrolled', contacts: [B] },
        { at: '2026-01-01T10:00Z', action: 'enrolled', contacts: [A, B] },
        { at: '2026-01-02T10:00Z', action: 'stopped before touch 1 sent', contacts: [B] },
      ],
    })
    expect(out.contacts.has(B.id)).toBe(true)
    expect(out.domains.get('sample-therapy.test')!.firstEnrolled.toISOString()).toBe('2026-01-05T10:00:00.000Z')
  })

  it('dates each domain from its own first enrollment, case-insensitively', () => {
    const out = contactedFromLog({
      events: [
        { at: '2026-01-01T10:00Z', action: 'enrolled', contacts: [B] },
        { at: '2026-01-03T10:00Z', action: 'enrolled', contacts: [C] },
        { at: '2026-01-02T10:00Z', action: 'enrolled', contacts: [A] },
      ],
    })
    expect(out.since.toISOString()).toBe('2026-01-01T10:00:00.000Z')
    expect(out.domains.get('example-psych.test')!.firstEnrolled.toISOString()).toBe('2026-01-02T10:00:00.000Z')
  })

  it('refuses a log in which nobody was actually emailed', () => {
    expect(() =>
      contactedFromLog({
        events: [
          { at: '2026-01-01T10:00Z', action: 'enrolled', contacts: [A] },
          { at: '2026-01-01T11:00Z', action: 'stopped before touch 1 sent', contacts: [A] },
        ],
      }),
    ).toThrow(/nobody|no contact/)
  })
})
