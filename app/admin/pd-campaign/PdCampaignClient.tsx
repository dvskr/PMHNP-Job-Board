'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  CheckCircle2,
  XCircle,
  Calendar,
  Box,
  AlertOctagon,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'

export interface PdLead {
  readonly id: string
  readonly tier: string
  readonly state: string
  readonly universityName: string
  readonly directorName: string | null
  readonly email: string | null
  readonly emailStatus: string | null
  readonly outreachStatus: string
  readonly lastContactedAt: string | null
  readonly widgetInstalled: boolean
  readonly widgetInstalledUrl: string | null
  readonly notes: string | null
}

interface FunnelStat {
  readonly status: string
  readonly count: number
}

interface Props {
  readonly leads: readonly PdLead[]
  readonly funnel: readonly FunnelStat[]
  readonly total: number
}

const STATUS_LABEL: Record<string, string> = {
  not_contacted: 'Not contacted',
  wave1_sent: 'Touch 1 sent',
  wave2_sent: 'Touch 2 sent',
  replied: 'Replied',
  booked: 'Call booked',
  installed: 'Widget installed',
  declined: 'Declined',
  bounced: 'Bounced',
  no_response: 'No response',
}

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  not_contacted: { bg: 'rgba(148,163,184,0.15)', text: '#64748B' },
  wave1_sent: { bg: 'rgba(45,212,191,0.15)', text: '#0D9488' },
  wave2_sent: { bg: 'rgba(168,85,247,0.15)', text: '#7C3AED' },
  replied: { bg: 'rgba(59,130,246,0.15)', text: '#2563EB' },
  booked: { bg: 'rgba(245,158,11,0.18)', text: '#B45309' },
  installed: { bg: 'rgba(16,185,129,0.18)', text: '#059669' },
  declined: { bg: 'rgba(239,68,68,0.15)', text: '#DC2626' },
  bounced: { bg: 'rgba(100,116,139,0.15)', text: '#475569' },
  no_response: { bg: 'rgba(120,113,108,0.15)', text: '#78716C' },
}

const ALL_STATUSES = Object.keys(STATUS_LABEL)

const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)',
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function PdCampaignClient({ leads, funnel, total }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installUrlPrompt, setInstallUrlPrompt] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.outreachStatus !== statusFilter) return false
      if (tierFilter !== 'all' && l.tier !== tierFilter) return false
      if (q.length === 0) return true
      const hay = [
        l.directorName ?? '',
        l.universityName,
        l.email ?? '',
        l.state,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [leads, search, statusFilter, tierFilter])

  // Quick counts in the funnel header — fill missing statuses with 0
  const funnelMap = new Map(funnel.map((f) => [f.status, f.count]))

  async function updateStatus(
    id: string,
    status: string,
    widgetInstalledUrl?: string,
  ) {
    setUpdating(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/pd-campaign', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, widgetInstalledUrl }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Update failed'
      setError(`Could not update lead: ${msg}`)
    } finally {
      setUpdating(null)
    }
  }

  function handleInstalled(id: string) {
    setInstallUrlPrompt(id)
  }

  function confirmInstall(id: string, formData: FormData) {
    const url = String(formData.get('url') ?? '').trim()
    if (!url) {
      setError('Career-services URL is required to mark as installed.')
      return
    }
    setInstallUrlPrompt(null)
    void updateStatus(id, 'installed', url)
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1280px', margin: '0 auto' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1
          style={{
            margin: '0 0 4px',
            fontSize: '28px',
            fontWeight: 800,
            color: '#1A2E35',
          }}
        >
          PD Campaign
        </h1>
        <p style={{ margin: 0, color: '#64748B', fontSize: '14px' }}>
          Mark replies, declines, bookings, and widget installs as PDs respond.
          The send script handles `wave1_sent` / `wave2_sent` automatically — use
          this page for everything downstream of that.
        </p>
      </header>

      {/* ═══ Funnel stats ═══ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        {[
          { label: 'Total', key: 'total', count: total },
          ...ALL_STATUSES.map((s) => ({
            label: STATUS_LABEL[s],
            key: s,
            count: funnelMap.get(s) ?? 0,
          })),
        ].map((stat) => {
          const colors =
            stat.key === 'total'
              ? { bg: '#F8FAFC', text: '#1A2E35' }
              : STATUS_COLOR[stat.key]!
          return (
            <button
              key={stat.key}
              onClick={() =>
                setStatusFilter(stat.key === 'total' ? 'all' : stat.key)
              }
              style={{
                ...card,
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                borderColor:
                  (stat.key === 'total' && statusFilter === 'all') ||
                  statusFilter === stat.key
                    ? '#0D9488'
                    : 'rgba(0,0,0,0.06)',
                borderWidth:
                  (stat.key === 'total' && statusFilter === 'all') ||
                  statusFilter === stat.key
                    ? '2px'
                    : '1px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: colors.text,
                  marginBottom: '4px',
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#1A2E35',
                }}
              >
                {stat.count}
              </div>
            </button>
          )
        })}
      </div>

      {/* ═══ Filters ═══ */}
      <div
        style={{
          ...card,
          padding: '16px 18px',
          marginBottom: '16px',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: 1,
            minWidth: '240px',
          }}
        >
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94A3B8',
            }}
          />
          <input
            type="text"
            placeholder="Search director, university, email, state…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: '10px',
              border: '1px solid rgba(0,0,0,0.1)',
              fontSize: '14px',
              outline: 'none',
            }}
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(0,0,0,0.1)',
            fontSize: '14px',
            outline: 'none',
            background: '#FFF',
            cursor: 'pointer',
          }}
        >
          <option value="all">All tiers</option>
          <option value="Tier 1">Tier 1</option>
          <option value="Tier 2">Tier 2</option>
          <option value="Tier 3">Tier 3</option>
        </select>
        <div style={{ fontSize: '13px', color: '#64748B', marginLeft: 'auto' }}>
          Showing <strong>{filtered.length}</strong> of {total}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '12px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* ═══ Lead table ═══ */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13.5px',
            }}
          >
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={th}>Director / University</th>
                <th style={th}>Tier</th>
                <th style={th}>Email</th>
                <th style={th}>Status</th>
                <th style={th}>Last contact</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: '#94A3B8',
                    }}
                  >
                    No PDs match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((lead) => {
                const colors = STATUS_COLOR[lead.outreachStatus] ?? STATUS_COLOR.not_contacted!
                const isUpdating = updating === lead.id
                return (
                  <tr
                    key={lead.id}
                    style={{
                      borderTop: '1px solid rgba(0,0,0,0.05)',
                      opacity: isUpdating ? 0.5 : 1,
                    }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#1A2E35' }}>
                        {lead.directorName ?? <span style={{ color: '#94A3B8' }}>— No director on file</span>}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
                        {lead.universityName} · {lead.state}
                      </div>
                      {lead.widgetInstalledUrl && (
                        <a
                          href={lead.widgetInstalledUrl}
                          target="_blank"
                          rel="noopener"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            color: '#059669',
                            marginTop: '4px',
                            textDecoration: 'none',
                          }}
                        >
                          <ExternalLink size={11} /> Live widget URL
                        </a>
                      )}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: lead.tier === 'Tier 1' ? '#059669' : lead.tier === 'Tier 2' ? '#B45309' : '#78716C',
                        }}
                      >
                        {lead.tier.replace('Tier ', 'T')}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ fontSize: '13px' }}>{lead.email ?? '—'}</div>
                      {lead.emailStatus && lead.emailStatus !== 'Valid' && (
                        <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>
                          {lead.emailStatus}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          background: colors.bg,
                          color: colors.text,
                          fontSize: '11.5px',
                          fontWeight: 700,
                        }}
                      >
                        {STATUS_LABEL[lead.outreachStatus] ?? lead.outreachStatus}
                      </span>
                    </td>
                    <td style={{ ...td, color: '#64748B', whiteSpace: 'nowrap' }}>
                      {timeAgo(lead.lastContactedAt)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: '4px',
                          flexWrap: 'wrap',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <ActionBtn
                          icon={<CheckCircle2 size={12} />}
                          label="Replied"
                          color="#2563EB"
                          disabled={isUpdating || lead.outreachStatus === 'replied'}
                          onClick={() => void updateStatus(lead.id, 'replied')}
                        />
                        <ActionBtn
                          icon={<Calendar size={12} />}
                          label="Booked"
                          color="#B45309"
                          disabled={isUpdating || lead.outreachStatus === 'booked'}
                          onClick={() => void updateStatus(lead.id, 'booked')}
                        />
                        <ActionBtn
                          icon={<Box size={12} />}
                          label="Installed"
                          color="#059669"
                          disabled={isUpdating || lead.outreachStatus === 'installed'}
                          onClick={() => handleInstalled(lead.id)}
                        />
                        <ActionBtn
                          icon={<XCircle size={12} />}
                          label="Declined"
                          color="#DC2626"
                          disabled={isUpdating || lead.outreachStatus === 'declined'}
                          onClick={() => void updateStatus(lead.id, 'declined')}
                        />
                        <ActionBtn
                          icon={<AlertOctagon size={12} />}
                          label="Bounced"
                          color="#475569"
                          disabled={isUpdating || lead.outreachStatus === 'bounced'}
                          onClick={() => void updateStatus(lead.id, 'bounced')}
                        />
                        <ActionBtn
                          icon={<RefreshCw size={12} />}
                          label="Reset"
                          color="#94A3B8"
                          disabled={isUpdating || lead.outreachStatus === 'not_contacted'}
                          onClick={() => void updateStatus(lead.id, 'not_contacted')}
                        />
                      </div>
                      {installUrlPrompt === lead.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            confirmInstall(lead.id, new FormData(e.currentTarget))
                          }}
                          style={{
                            marginTop: '8px',
                            display: 'flex',
                            gap: '6px',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                          }}
                        >
                          <input
                            name="url"
                            type="url"
                            required
                            placeholder="https://nursing.example.edu/careers"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid rgba(0,0,0,0.15)',
                              fontSize: '12px',
                              width: '260px',
                            }}
                          />
                          <button
                            type="submit"
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: '#059669',
                              color: '#FFF',
                              border: 'none',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setInstallUrlPrompt(null)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              background: '#FFF',
                              color: '#64748B',
                              border: '1px solid rgba(0,0,0,0.1)',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '11px 14px',
  fontSize: '11.5px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#64748B',
}
const td: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
}

interface ActionBtnProps {
  readonly icon: React.ReactNode
  readonly label: string
  readonly color: string
  readonly disabled?: boolean
  readonly onClick: () => void
}
function ActionBtn({ icon, label, color, disabled, onClick }: ActionBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '5px 9px',
        borderRadius: '8px',
        background: disabled ? '#F8FAFC' : '#FFFFFF',
        color: disabled ? '#CBD5E1' : color,
        border: `1px solid ${disabled ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.08)'}`,
        fontSize: '11.5px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
