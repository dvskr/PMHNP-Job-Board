/**
 * /admin/dmarc
 *
 * Pulls the weekly DMARC digest from Postmark and renders it inline so
 * we don't have to leave the admin to see "is our domain being spoofed
 * or are sends getting authenticated correctly."
 *
 * Postmark DMARC reports arrive daily-to-weekly depending on the
 * receiving mail server's reporting cadence (Gmail = daily, Yahoo =
 * weekly). For the first 24-48h after `_dmarc` record activation, this
 * page will be empty — that's normal, not a bug.
 *
 * Auth: gated by app/admin/layout.tsx's requireAdmin().
 */
import { Metadata } from 'next'
import Link from 'next/link'
import { brand } from '@/config/brand'
import { logger } from '@/lib/logger'
import { ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // 1 hour — reports arrive daily, no need to hammer

export const metadata: Metadata = {
  title: 'DMARC — Admin',
  robots: { index: false, follow: false },
}

interface DmarcDigest {
  readonly week_start: string
  readonly emails_processed?: number
  readonly emails_passed?: number
  readonly emails_failed?: number
  readonly compliance_rate?: number
}

interface DmarcSource {
  readonly source_name: string
  readonly total: number
  readonly spf_pass_rate: number
  readonly dkim_pass_rate: number
}

interface DmarcData {
  readonly digests: readonly DmarcDigest[]
  readonly sources: readonly DmarcSource[]
  readonly fetchedAt: string
  readonly error: string | null
}

async function fetchDmarc(): Promise<DmarcData> {
  const token = process.env.POSTMARK_DMARC_API_TOKEN
  if (!token) {
    return {
      digests: [],
      sources: [],
      fetchedAt: new Date().toISOString(),
      error: 'POSTMARK_DMARC_API_TOKEN env var is not set',
    }
  }

  // Postmark DMARC's REST endpoints are at dmarc.postmarkapp.com/api/.
  // Two we care about: weekly digest summaries + current-week source
  // breakdown. Both honor the X-Api-Token header.
  const headers = {
    Accept: 'application/json',
    'X-Api-Token': token,
  } as const

  const [digestsRes, sourcesRes] = await Promise.allSettled([
    fetch('https://dmarc.postmarkapp.com/records/my/digests', {
      headers,
      next: { revalidate: 3600 },
    }),
    fetch('https://dmarc.postmarkapp.com/records/my/sources', {
      headers,
      next: { revalidate: 3600 },
    }),
  ])

  const digests: DmarcDigest[] = []
  const sources: DmarcSource[] = []
  let errorMessage: string | null = null

  if (digestsRes.status === 'fulfilled' && digestsRes.value.ok) {
    try {
      const body = (await digestsRes.value.json()) as
        | { digests?: DmarcDigest[] }
        | DmarcDigest[]
      const arr = Array.isArray(body) ? body : body.digests ?? []
      digests.push(...arr)
    } catch (err) {
      logger.warn('[/admin/dmarc] failed to parse digests JSON', { error: err })
    }
  } else if (digestsRes.status === 'rejected') {
    errorMessage = `Postmark API unreachable: ${digestsRes.reason}`
  } else if (digestsRes.status === 'fulfilled' && !digestsRes.value.ok) {
    errorMessage = `Postmark API returned ${digestsRes.value.status}`
  }

  if (sourcesRes.status === 'fulfilled' && sourcesRes.value.ok) {
    try {
      const body = (await sourcesRes.value.json()) as
        | { sources?: DmarcSource[] }
        | DmarcSource[]
      const arr = Array.isArray(body) ? body : body.sources ?? []
      sources.push(...arr)
    } catch (err) {
      logger.warn('[/admin/dmarc] failed to parse sources JSON', { error: err })
    }
  }

  return {
    digests,
    sources,
    fetchedAt: new Date().toISOString(),
    error: errorMessage,
  }
}

const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)',
  padding: '20px 22px',
}

const eyebrow: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#64748B',
  marginBottom: '4px',
}

const statValue: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 800,
  color: '#1A2E35',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

export default async function DmarcAdminPage() {
  const data = await fetchDmarc()
  const latest = data.digests[0]
  const hasData = latest !== undefined

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1080px', margin: '0 auto' }}>
      <header style={{ marginBottom: '28px' }}>
        <h1
          style={{
            margin: '0 0 4px',
            fontSize: '28px',
            fontWeight: 800,
            color: '#1A2E35',
          }}
        >
          DMARC monitoring
        </h1>
        <p style={{ margin: 0, color: '#64748B', fontSize: '14px' }}>
          Email authentication health for <strong>{brand.domain}</strong>. Reports
          arrive daily from Gmail/Yahoo/Outlook receivers and are aggregated
          into weekly digests by Postmark. First report typically appears
          24-48 hours after `_dmarc` DNS record activation.
        </p>
      </header>

      {/* ═══ Error banner (token missing / API down) ═══ */}
      {data.error && (
        <div
          style={{
            background: '#FEF3C7',
            border: '1px solid #FCD34D',
            color: '#92400E',
            padding: '14px 18px',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <AlertTriangle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>
              Couldn&rsquo;t fetch live data
            </div>
            <div style={{ fontSize: '13px' }}>{data.error}</div>
            <div style={{ fontSize: '12px', marginTop: '6px' }}>
              You can still view reports directly at{' '}
              <a
                href="https://dmarc.postmarkapp.com"
                target="_blank"
                rel="noopener"
                style={{ color: '#92400E', textDecoration: 'underline' }}
              >
                dmarc.postmarkapp.com →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Stats — latest digest ═══ */}
      {hasData ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div style={card}>
            <div style={eyebrow}>Week of</div>
            <div style={statValue}>
              {new Date(latest.week_start).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
          <div style={card}>
            <div style={eyebrow}>Emails processed</div>
            <div style={statValue}>
              {(latest.emails_processed ?? 0).toLocaleString()}
            </div>
          </div>
          <div style={card}>
            <div style={eyebrow}>Compliance rate</div>
            <div
              style={{
                ...statValue,
                color:
                  (latest.compliance_rate ?? 0) >= 0.95
                    ? '#059669'
                    : (latest.compliance_rate ?? 0) >= 0.85
                      ? '#B45309'
                      : '#DC2626',
              }}
            >
              {Math.round((latest.compliance_rate ?? 0) * 100)}%
            </div>
          </div>
          <div style={card}>
            <div style={eyebrow}>Failed authentication</div>
            <div
              style={{
                ...statValue,
                color: (latest.emails_failed ?? 0) > 0 ? '#DC2626' : '#059669',
              }}
            >
              {(latest.emails_failed ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      ) : !data.error ? (
        <div
          style={{
            ...card,
            padding: '40px 24px',
            textAlign: 'center',
            marginBottom: '24px',
          }}
        >
          <ShieldCheck size={32} color="#0D9488" style={{ marginBottom: '12px' }} />
          <div style={{ fontWeight: 700, fontSize: '17px', color: '#1A2E35' }}>
            No reports yet
          </div>
          <p
            style={{
              margin: '6px auto 0',
              color: '#64748B',
              fontSize: '14px',
              maxWidth: '420px',
              lineHeight: 1.55,
            }}
          >
            Receiving mail servers send DMARC reports daily, so the first
            digest will appear here within 24-48 hours of your first send
            from a domain with the new <code>_dmarc</code> TXT record. If it&rsquo;s
            been longer than 48h, check the DNS propagation.
          </p>
          <Link
            href="https://dmarc.postmarkapp.com"
            target="_blank"
            rel="noopener"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '16px',
              padding: '8px 16px',
              borderRadius: '10px',
              background: '#0D9488',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open Postmark DMARC dashboard
            <ExternalLink size={13} />
          </Link>
        </div>
      ) : null}

      {/* ═══ Sources breakdown ═══ */}
      {data.sources.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1A2E35' }}>
              Top sending sources this week
            </h2>
            <p style={{ margin: '2px 0 0', color: '#64748B', fontSize: '13px' }}>
              Where receivers saw <strong>{brand.domain}</strong> coming from.
              Anything not on this list saying it&rsquo;s you is a spoofing attempt.
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={th}>Source</th>
                <th style={th}>Volume</th>
                <th style={th}>SPF pass</th>
                <th style={th}>DKIM pass</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((src) => (
                <tr key={src.source_name} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{src.source_name}</td>
                  <td style={td}>{src.total.toLocaleString()}</td>
                  <td style={{ ...td, color: src.spf_pass_rate >= 0.95 ? '#059669' : '#DC2626' }}>
                    {Math.round(src.spf_pass_rate * 100)}%
                  </td>
                  <td style={{ ...td, color: src.dkim_pass_rate >= 0.95 ? '#059669' : '#DC2626' }}>
                    {Math.round(src.dkim_pass_rate * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Domain config snapshot ═══ */}
      <div style={card}>
        <h2 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#1A2E35' }}>
          Current DMARC policy
        </h2>
        <table style={{ fontSize: '13px', width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ color: '#64748B', padding: '4px 12px 4px 0', whiteSpace: 'nowrap' }}>
                Domain
              </td>
              <td style={{ padding: '4px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {brand.domain}
              </td>
            </tr>
            <tr>
              <td style={{ color: '#64748B', padding: '4px 12px 4px 0', whiteSpace: 'nowrap' }}>
                Policy (p=)
              </td>
              <td style={{ padding: '4px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                quarantine
              </td>
            </tr>
            <tr>
              <td style={{ color: '#64748B', padding: '4px 12px 4px 0', whiteSpace: 'nowrap' }}>
                Report destination
              </td>
              <td style={{ padding: '4px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                Postmark (re+xebnjekkry8@dmarc.postmarkapp.com)
              </td>
            </tr>
            <tr>
              <td style={{ color: '#64748B', padding: '4px 12px 4px 0', whiteSpace: 'nowrap' }}>
                Last refresh
              </td>
              <td style={{ padding: '4px 0', color: '#64748B' }}>
                {new Date(data.fetchedAt).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#64748B',
}
const td: React.CSSProperties = {
  padding: '10px 16px',
}
