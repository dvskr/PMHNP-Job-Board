'use client'

import { useState, useMemo, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'

/**
 * Interactive embed builder for the /for-programs page.
 *
 * Lets a PD pick their state + type their program name, then renders
 * (a) a live preview of the widget for those values, and (b) the
 * one-line iframe snippet they paste on their career-services page.
 *
 * Why client component: the snippet and demo need to react to user
 * input. Surrounding /for-programs page stays server-rendered.
 */

const US_STATES: readonly { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

// Same regex used by the widget (app/widget/route.ts). Programs
// containing other characters get sanitized in-line so the iframe URL
// stays well-formed.
const PROGRAM_ALLOWED = /[^A-Za-z0-9 .'&-]/g

// Row-count picker — matches the widget's clamped 3–12 range. Iframe
// height is computed from the count (header chrome + per-row height).
const LIMIT_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 3, label: '3 jobs' },
  { value: 6, label: '6 jobs (recommended)' },
  { value: 9, label: '9 jobs' },
  { value: 12, label: '12 jobs' },
]
const HEIGHT_BASE = 240 // brand + heading + footer + paddings
const HEIGHT_PER_ROW = 170 // one clay card with margin
function iframeHeightFor(limit: number): number {
  return HEIGHT_BASE + HEIGHT_PER_ROW * limit
}

// Code → full name lookup for the static-link fallback URL.
const STATE_NAMES_LOCAL: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(US_STATES.map((s) => [s.code, s.name])),
)

const clayCard: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(0,0,0,0.1)',
  background: '#FFFFFF',
  fontSize: '14px',
  fontFamily: 'inherit',
  color: '#1A2E35',
  fontWeight: 500,
  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.8)',
  outline: 'none',
}

interface Props {
  readonly baseUrl: string
}

export default function ProgramEmbedBuilder({ baseUrl }: Props) {
  const [stateCode, setStateCode] = useState('CA')
  const [program, setProgram] = useState('Your Program')
  const [limit, setLimit] = useState(6)
  const [copied, setCopied] = useState(false)

  const cleanProgram = useMemo(
    () => program.replace(PROGRAM_ALLOWED, '').slice(0, 80).trim(),
    [program],
  )

  const iframeHeight = useMemo(() => iframeHeightFor(limit), [limit])

  const widgetUrl = useMemo(() => {
    const u = new URL(`${baseUrl}/widget`)
    u.searchParams.set('state', stateCode)
    if (cleanProgram && cleanProgram !== 'Your Program') {
      u.searchParams.set('program', cleanProgram)
    } else {
      u.searchParams.set('program', 'Your Program')
    }
    if (limit !== 6) {
      u.searchParams.set('limit', String(limit))
    }
    return u.toString()
  }, [baseUrl, stateCode, cleanProgram, limit])

  const embedSnippet = useMemo(
    () => `<iframe src="${widgetUrl}" width="100%" height="${iframeHeight}" style="border:0;border-radius:14px" loading="lazy"></iframe>`,
    [widgetUrl, iframeHeight],
  )

  const fallbackUrl = useMemo(() => {
    // Plain link target when the host site blocks iframes via CSP.
    // Sends students to a state-filtered /jobs page with the same UTM
    // attribution the iframe uses.
    const u = new URL(`${baseUrl}/jobs`)
    u.searchParams.set('location', STATE_NAMES_LOCAL[stateCode] ?? stateCode)
    u.searchParams.set('utm_source', 'widget')
    u.searchParams.set('utm_medium', 'link')
    if (cleanProgram && cleanProgram !== 'Your Program') {
      u.searchParams.set('utm_campaign', `pd-${cleanProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)}`)
    } else {
      u.searchParams.set('utm_campaign', 'pd-generic')
    }
    return u.toString()
  }, [baseUrl, stateCode, cleanProgram])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Older browsers without clipboard API — leave the snippet
      // selected so the user can hit ⌘C manually.
    }
  }

  const stateName =
    US_STATES.find((s) => s.code === stateCode)?.name ?? stateCode

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          ...clayCard,
          padding: '24px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.5fr 0.9fr',
            gap: '16px',
            marginBottom: '16px',
          }}
          className="pd-builder-grid"
        >
          <div>
            <label
              htmlFor="pd-state"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: '#5A4A42',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Your State
            </label>
            <select
              id="pd-state"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235A4A42' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px center',
                paddingRight: '36px',
              }}
            >
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="pd-program"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: '#5A4A42',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Your Program Name
            </label>
            <input
              id="pd-program"
              type="text"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              placeholder="e.g., UCSF PMHNP"
              maxLength={80}
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="pd-limit"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: '#5A4A42',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Jobs To Show
            </label>
            <select
              id="pd-limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235A4A42' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px center',
                paddingRight: '36px',
              }}
            >
              {LIMIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '12.5px',
            color: '#7A6A62',
            lineHeight: 1.5,
          }}
        >
          The widget below updates as you type. Pick your state, name your
          program, and copy the snippet at the bottom.
        </p>
      </div>

      {/* Live preview */}
      <div
        style={{
          ...clayCard,
          padding: '14px',
        }}
      >
        <iframe
          key={`${stateCode}-${cleanProgram}-${limit}` /* force refresh when params change */}
          src={`/widget?state=${stateCode}&program=${encodeURIComponent(cleanProgram || 'Your Program')}${limit !== 6 ? `&limit=${limit}` : ''}`}
          title={`Live PMHNP jobs widget — ${stateName}`}
          loading="lazy"
          style={{
            width: '100%',
            height: `${iframeHeight}px`,
            border: '0',
            borderRadius: '14px',
            display: 'block',
          }}
        />
      </div>

      {/* Embed snippet */}
      <div
        style={{
          ...clayCard,
          marginTop: '20px',
          padding: '20px 24px',
          background: '#FFFFFF',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#7A6A62',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            One-line install
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="clay-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '12px',
              background: copied ? '#0D9488' : '#FFFFFF',
              color: copied ? '#FFFFFF' : '#1A2E35',
              border: '1px solid rgba(0,0,0,0.08)',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 180ms ease, color 180ms ease',
            }}
            aria-label="Copy embed snippet"
          >
            {copied ? (
              <>
                <Check size={14} /> Copied
              </>
            ) : (
              <>
                <Copy size={14} /> Copy snippet
              </>
            )}
          </button>
        </div>
        <code
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#1A2E35',
            background: '#F7FBF8',
            padding: '14px 16px',
            borderRadius: '10px',
            border: '1px solid rgba(0,0,0,0.06)',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            lineHeight: 1.5,
          }}
        >
          {embedSnippet}
        </code>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: '12px',
            color: '#7A6A62',
            lineHeight: 1.5,
          }}
        >
          Paste this anywhere on your career-services page. No login, no
          API key. The jobs refresh automatically.
        </p>
      </div>

      {/* Fallback link — for the small number of .edu sites that set a
          strict Content-Security-Policy frame-src 'self' and block all
          iframes. They can link to the same state-filtered jobs page
          instead. Same UTM attribution as the iframe so we can tell the
          referrals apart. */}
      <div
        style={{
          ...clayCard,
          marginTop: '12px',
          padding: '18px 22px',
          background: 'linear-gradient(135deg, #FFFBEB, #FFFFFF)',
          border: '1px solid rgba(217,119,6,0.18)',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#B45309',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '8px',
          }}
        >
          Site blocks iframes? Use this link instead
        </div>
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '13px',
            color: '#5A4A42',
            lineHeight: 1.55,
          }}
        >
          A small number of universities block all embedded content via a
          strict Content-Security-Policy. If the iframe above shows up
          blank or refuses to load, link your students to this page
          instead — it filters to {stateName} PMHNP roles.
        </p>
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener"
          style={{
            display: 'inline-block',
            fontSize: '12.5px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#0D9488',
            background: '#F7FBF8',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(0,0,0,0.06)',
            wordBreak: 'break-all',
            textDecoration: 'none',
            lineHeight: 1.5,
            maxWidth: '100%',
          }}
        >
          {fallbackUrl}
        </a>
      </div>
    </div>
  )
}
