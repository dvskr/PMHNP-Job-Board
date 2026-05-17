import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { classifyJob, HEALTH_DEAD_THRESHOLD } from '@/lib/ai/job-classifier'

/**
 * Embeddable jobs widget for the Program Directors campaign.
 *
 *   /widget?state=CA&program=UCSF
 *
 * Visually mirrors components/JobCard.tsx (viewMode='list') so a PD's
 * career-services page shows the same clay-pill job rows students will
 * see on the main site. Server-rendered HTML, no React on the client.
 *
 * Inclusion rule (mirrors lib/ai/job-classifier.isPlatformRevenueJob):
 *   - employer-submitted (sourceType='employer') → highest weight
 *   - aggregated jobs whose applyLink hits an ATS host (direct_apply) → included
 *   - external aggregator redirects (tier='external') → excluded
 *   - dead-link risk (healthConsecutiveMissing ≥ 3, non-employer) → excluded
 *
 * Why a Route Handler (not a page.tsx): the root layout adds Header,
 * Footer, BottomNav, GA, fonts, CookieConsent — none of which should
 * run inside an iframe on a third-party `.edu` host. Route Handler
 * returns a bare Response and bypasses the layout entirely.
 *
 * See docs/runbooks/program-directors-campaign.md §3 Step 5 for spec.
 */

const STATE_PATTERN = /^[A-Z]{2}$/
const PROGRAM_PATTERN = /^[A-Za-z0-9 .'&-]{1,80}$/

// Full state names. Used to build the "See all in <state>" URL with
// ?location=<FullName> so the /jobs sidebar location input auto-syncs
// from the URL (the sidebar reads `location`, not `stateCode`).
const STATE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska',
  NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
})

// Allow PDs to request a different number of cards via ?limit=N.
// Clamped 3–12: anything lower is too small to be useful, anything
// higher overflows most career-services page layouts.
const LIMIT_MIN = 3
const LIMIT_MAX = 12
const LIMIT_DEFAULT = 6

const QUERY_SCHEMA = z.object({
  // State must (a) be a 2-letter code and (b) actually be a real US
  // state/territory we ship widgets for. `ZZ` passes the regex but
  // isn't a state — refine() catches that so we don't render an empty
  // widget for it.
  state: z
    .string()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(STATE_PATTERN, 'state must be a 2-letter code'))
    .refine((s) => s in STATE_NAMES, { message: 'unknown US state code' }),
  program: z.string().regex(PROGRAM_PATTERN).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(LIMIT_MIN)
    .max(LIMIT_MAX)
    .optional(),
})

// Pull a wider candidate pool than the requested limit so the in-memory
// classify+sort still has enough employer-tier rows after the
// tier='external' filter. 6× the request, with a floor so a request for
// just 3 still pulls 18 candidates.
function candidatePoolFor(limit: number): number {
  return Math.max(18, limit * 6)
}

interface WidgetJob {
  readonly id: string
  readonly slug: string | null
  readonly title: string
  readonly employer: string
  readonly location: string | null
  readonly city: string | null
  readonly stateCode: string | null
  readonly isRemote: boolean
  readonly isHybrid: boolean
  readonly mode: string | null
  readonly jobType: string | null
  readonly displaySalary: string | null
  readonly salaryRange: string | null
  readonly normalizedMinSalary: number | null
  readonly normalizedMaxSalary: number | null
  readonly salaryPeriod: string | null
  readonly isFeatured: boolean
  readonly isVerifiedEmployer: boolean
  readonly applyLink: string | null
  readonly applyOnPlatform: boolean
  readonly sourceType: string | null
  readonly healthConsecutiveMissing: number | null
  readonly createdAt: Date
  readonly originalPostedAt: Date | null
  readonly companyLogoUrl: string | null
}

interface RenderedJob extends WidgetJob {
  readonly tier: 'easy_apply' | 'direct_apply'
  readonly score: number
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function slugifyProgram(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    'https://pmhnphiring.com'
  )
}

function jobUrl(job: WidgetJob, program: string | undefined): string {
  const path = job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`
  const utm = new URLSearchParams({
    utm_source: 'widget',
    utm_medium: 'embed',
    utm_campaign: program ? `pd-${slugifyProgram(program)}` : 'pd-generic',
  })
  return `${baseUrl()}${path}?${utm.toString()}`
}

// Truncate long locations — mirrors components/JobCard.tsx:127
function shortLocationOf(job: WidgetJob): string {
  if (!job.location) return 'Remote'
  const first = job.location.split(';')[0].split(',').slice(0, 2).join(',').trim()
  return first.length > 35 ? first.slice(0, 33) + '…' : first
}

function displayModeOf(job: WidgetJob): string {
  return job.isRemote ? 'Remote' : job.isHybrid ? 'Hybrid' : job.mode || 'In-Person'
}

function buildSalaryDisplay(job: WidgetJob): string | null {
  if (job.displaySalary) return job.displaySalary
  const min = job.normalizedMinSalary
  const max = job.normalizedMaxSalary
  if (!min && !max) return job.salaryRange
  const fmt = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toLocaleString()}`)
  const period = job.salaryPeriod === 'hourly' ? '/hr' : '/yr'
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}${period}`
  if (min) return `${fmt(min)}${period}`
  if (max) return `${fmt(max)}${period}`
  return null
}

function postedLabel(job: WidgetJob): string {
  const posted = job.originalPostedAt ?? job.createdAt
  return `Posted ${posted.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function avatarColor(name: string): string {
  const code = (name || '?').charCodeAt(0)
  return `hsl(${(code * 7) % 360}, 40%, 50%)`
}

function selectJobs(
  candidates: readonly WidgetJob[],
  limit: number,
): readonly RenderedJob[] {
  const rendered: RenderedJob[] = []
  for (const job of candidates) {
    const cls = classifyJob({
      sourceType: job.sourceType,
      applyOnPlatform: job.applyOnPlatform,
      applyLink: job.applyLink,
      healthConsecutiveMissing: job.healthConsecutiveMissing,
    })
    if (cls.tier === 'external' || !cls.isHealthy) continue
    // Score: featured > employer easy_apply > direct_apply.
    // Within tier, recency breaks ties (handled by stable input order).
    let score = 0
    if (job.isFeatured) score += 1000
    if (cls.tier === 'easy_apply') score += 500
    else score += 250
    rendered.push({ ...job, tier: cls.tier, score })
  }
  // Sort: highest score first; input order already DESC by createdAt so
  // ties resolve to "newer first" implicitly.
  rendered.sort((a, b) => b.score - a.score)
  return rendered.slice(0, limit)
}

function renderJobCard(job: RenderedJob, program: string | undefined): string {
  const salary = buildSalaryDisplay(job)
  const salaryText = salary
    ? salary.startsWith('$')
      ? salary
      : `$${salary}`
    : null
  const loc = shortLocationOf(job)
  const mode = displayModeOf(job)
  const featuredBorder = job.isFeatured
    ? '2px solid #0D9488'
    : '1px solid rgba(255,255,255,0.5)'

  const logo = job.companyLogoUrl
    ? `<img src="${escape(job.companyLogoUrl)}" alt="${escape(job.employer)} logo" width="48" height="48" loading="lazy" decoding="async" class="pd-avatar-img">`
    : `<div class="pd-avatar" style="background:${avatarColor(job.employer)};">${escape((job.employer[0] || '?').toUpperCase())}</div>`

  // Lucide BadgeCheck shape — same icon JobCard.tsx renders at line 238.
  // Two paths in this order: scalloped blue badge (filled, no stroke),
  // then white check (stroked, no fill) on top.
  const verifiedBadge = job.isVerifiedEmployer
    ? `<span class="pd-verified" aria-label="Verified employer">
        <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#1d9bf0" stroke="none"/>
          <path d="m9 12 2 2 4-4" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>`
    : ''

  const featuredPill = job.isFeatured
    ? `<span class="pd-pill pd-pill--featured">⚡ Featured</span>`
    : ''

  const salaryBadge = salaryText
    ? `<span class="pd-pill pd-pill--salary">${escape(salaryText)}</span>`
    : ''

  const directApplyBtn = job.tier === 'easy_apply'
    ? `<span class="pd-btn pd-btn--easy">⚡ Easy Apply</span>`
    : `<span class="pd-btn pd-btn--direct">Direct Apply</span>`

  return `<a class="pd-row" href="${escape(jobUrl(job, program))}" target="_blank" rel="noopener" style="border:${featuredBorder};">
    <div class="pd-avatar-wrap">
      ${logo}
      ${verifiedBadge}
    </div>
    <div class="pd-body">
      <h3 class="pd-title">${escape(job.title)}</h3>
      <div class="pd-employer-row">
        <span class="pd-employer">${escape(job.employer)}</span>
        ${featuredPill}
      </div>
      <div class="pd-pills">
        ${salaryBadge}
        <span class="pd-pill pd-pill--outline">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${escape(loc)}
        </span>
        ${job.jobType ? `<span class="pd-pill pd-pill--outline">${escape(job.jobType)}</span>` : ''}
        <span class="pd-pill pd-pill--outline">${escape(mode)}</span>
      </div>
    </div>
    <div class="pd-actions">
      <div class="pd-action-row">
        <span class="pd-btn pd-btn--neutral">Save</span>
        <span class="pd-btn pd-btn--neutral">View Job →</span>
        ${directApplyBtn}
      </div>
      <span class="pd-posted">${escape(postedLabel(job))}</span>
    </div>
  </a>`
}

function renderHtml(args: {
  state: string
  program: string | undefined
  jobs: readonly RenderedJob[]
}): string {
  const { state, program, jobs } = args
  const heading = `Latest PMHNP Jobs in ${escape(state)}`
  const subheading = program
    ? `Curated for ${escape(program)} students`
    : 'Updated daily'

  const utmCampaign = program ? `pd-${slugifyProgram(program)}` : 'pd-generic'

  const cards = jobs.map((j) => renderJobCard(j, program)).join('')

  const emptyState =
    jobs.length === 0
      ? `<div class="pd-empty">
          <p>No PMHNP roles currently listed in <strong>${escape(state)}</strong>.</p>
          <p>New jobs are added daily — <a href="${escape(baseUrl())}/jobs?utm_source=widget&amp;utm_medium=embed&amp;utm_campaign=${utmCampaign}" target="_blank" rel="noopener">browse all PMHNP jobs →</a></p>
        </div>`
      : ''

  // Use ?location=<FullName> so the /jobs sidebar location input
  // auto-populates from the URL (LinkedInFilters.tsx:111 reads
  // `parsed.location`). The location filter does `state equals` OR
  // `city contains` (lib/filters.ts:514), which matches CA jobs whose
  // state field is "California". Pure ?stateCode= would filter but
  // leave the sidebar UI blank.
  const stateFullName = STATE_NAMES[state] ?? state
  const seeAllUrl = `${baseUrl()}/jobs?location=${encodeURIComponent(stateFullName)}&utm_source=widget&utm_medium=embed&utm_campaign=${utmCampaign}`
  const brandUrl = `${baseUrl()}?utm_source=widget&utm_medium=embed&utm_campaign=${utmCampaign}`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escape(heading)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    color-scheme: light;
    --pd-ink: #1A2E35;
    --pd-ink-soft: #4A5568;
    --pd-ink-muted: #718096;
    /* Match /jobs page body (#F5F0EB warm cream, --bg-primary in
       globals.css). Cards keep their #F7FBF8 mint so the widget reads
       identically to the live /jobs list-mode page. */
    --pd-cream-body: #F5F0EB;
    --pd-card: #F7FBF8;
    --pd-peach: #F0BFB5;
    --pd-peach-soft: #FBE8D8;
    --pd-teal: #0D9488;
    --pd-teal-dark: #0F766E;
    --pd-mint: #B2F5EA;
    --pd-outline-bg: #EDF2EE;
    --pd-outline-text: #374151;
    --pd-featured-bg: #FDE68A;
    --pd-featured-text: #78350F;
    --pd-direct-bg: #BFDBFE;
    --pd-direct-text: #1E40AF;
    --pd-divider: rgba(26,46,53,0.08);
    --pd-serif: 'Lora', Georgia, 'Times New Roman', serif;
    --pd-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    --pd-clay-shadow:
      8px 8px 20px rgba(0,0,0,0.07),
      -4px -4px 12px rgba(255,255,255,0.9),
      inset 2px 2px 4px rgba(255,255,255,0.6),
      inset -1px -1px 2px rgba(0,0,0,0.02);
    --pd-btn-shadow:
      4px 4px 10px rgba(0,0,0,0.06),
      -2px -2px 6px rgba(255,255,255,0.8),
      inset 2px 2px 4px rgba(255,255,255,0.7),
      inset -1px -1px 2px rgba(0,0,0,0.03);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--pd-cream-body); }
  body {
    font-family: var(--pd-sans);
    font-size: 14px;
    line-height: 1.5;
    color: var(--pd-ink);
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }

  .pd-wrap {
    max-width: 980px;
    margin: 0 auto;
    /* Top padding clears the parent iframe's border-radius rounding;
       without it the eyebrow text gets clipped at the corners on the
       /for-programs demo embed. */
    padding: 28px 22px 28px;
  }
  /* Two-tier header:
       row 1 (.pd-header-top): brand wordmark left, CTA right
       row 2 (.pd-header-title): heading + subtitle
     Each tier is a self-contained flex row so the brand and CTA align
     properly to one another, and the title block has its own spacing. */
  .pd-header {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 4px 0 22px;
  }
  /* Negative inline margin pulls the brand left and the CTA right past
     the wrap's 22px horizontal padding, so they read like a nav bar
     spanning the full iframe width, while the title underneath stays
     aligned to the content column. */
  .pd-header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin: 0 -14px;
  }
  .pd-header-title { min-width: 0; }

  /* Brand wordmark — larger than the nav-bar variant since the widget
     header is the only branding moment in the embed. Logo 72px,
     wordmark 24px, -8px overlap so they read as one unit. */
  .pd-brand {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    text-decoration: none;
  }
  .pd-brand-logo {
    width: 72px;
    height: 72px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .pd-brand-mark {
    font-family: var(--pd-serif);
    font-size: 24px;
    font-weight: 700;
    color: #3D2E24;
    letter-spacing: -0.01em;
    line-height: 1;
    margin-left: -8px;
  }
  .pd-brand-mark-accent {
    font-style: italic;
    color: var(--pd-teal);
    font-weight: 600;
  }

  .pd-heading {
    margin: 0;
    font-family: var(--pd-serif);
    font-size: 22px;
    font-weight: 800;
    color: var(--pd-ink);
    line-height: 1.2;
  }
  .pd-sub {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--pd-ink-muted);
    font-weight: 500;
  }

  /* "See all in <state>" — clay CTA button (matches site primary
     button color #0D9488 with the same neumorphic shadow as buttons
     on /for-employers). */
  .pd-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 20px;
    border-radius: 14px;
    background: var(--pd-teal);
    color: #FFFFFF;
    font-size: 13.5px;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
    border: 1px solid rgba(255,255,255,0.3);
    box-shadow:
      5px 5px 12px rgba(13,148,136,0.22),
      -2px -2px 6px rgba(255,255,255,0.4),
      inset 2px 2px 4px rgba(255,255,255,0.2),
      inset -1px -1px 2px rgba(0,0,0,0.06);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .pd-cta:hover {
    transform: translateY(-1px);
    box-shadow:
      7px 7px 16px rgba(13,148,136,0.28),
      -3px -3px 8px rgba(255,255,255,0.5),
      inset 2px 2px 4px rgba(255,255,255,0.25),
      inset -1px -1px 2px rgba(0,0,0,0.06);
  }
  .pd-cta:active {
    transform: translateY(1px);
    box-shadow:
      2px 2px 5px rgba(13,148,136,0.18),
      inset 3px 3px 6px rgba(0,0,0,0.12),
      inset -2px -2px 4px rgba(255,255,255,0.15);
  }

  /* ── Job row card ───────────────────────────────────────────── */
  .pd-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 18px 22px;
    background: var(--pd-card);
    border-radius: 20px;
    box-shadow: var(--pd-clay-shadow);
    margin-bottom: 12px;
    /* min-width: 0 on row + body lets flex children shrink properly so
       long titles ellipsis-truncate instead of forcing horizontal
       overflow. Without these two lines a long "Outpatient PMHNP —
       Telehealth …" title pushes the actions column off-screen. */
    min-width: 0;
    overflow: hidden;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }
  .pd-row:hover {
    transform: translateY(-1px);
    box-shadow:
      10px 10px 24px rgba(0,0,0,0.08),
      -4px -4px 14px rgba(255,255,255,0.9),
      inset 2px 2px 4px rgba(255,255,255,0.6),
      inset -1px -1px 2px rgba(0,0,0,0.02);
  }

  /* Avatar */
  .pd-avatar-wrap {
    flex-shrink: 0;
    position: relative;
  }
  .pd-avatar, .pd-avatar-img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 18px;
    font-weight: 700;
    font-family: var(--pd-sans);
  }
  .pd-avatar-img {
    object-fit: contain;
    background: #FFFFFF;
    border: 1px solid rgba(0,0,0,0.06);
  }
  .pd-verified {
    position: absolute;
    bottom: -2px; right: -2px;
    background: #FFFFFF;
    border-radius: 50%;
    width: 18px; height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  /* Body */
  .pd-body { flex: 1; min-width: 0; }
  .pd-title {
    margin: 0 0 4px;
    font-family: var(--pd-serif);
    font-size: 18px;
    font-weight: 700;
    color: var(--pd-ink);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pd-employer-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    min-width: 0;
  }
  .pd-employer {
    font-size: 14px;
    font-weight: 500;
    color: var(--pd-ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* Pills (badges) */
  .pd-pills {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .pd-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    border-radius: 20px;
    padding: 5px 14px;
    font-size: 12px;
    border: 1px solid rgba(255,255,255,0.5);
    box-shadow: var(--pd-btn-shadow);
  }
  .pd-pill--salary {
    background: var(--pd-mint);
    color: var(--pd-teal-dark);
    font-weight: 700;
    font-size: 13px;
  }
  .pd-pill--outline {
    background: var(--pd-outline-bg);
    color: var(--pd-outline-text);
    font-weight: 500;
  }
  .pd-pill--featured {
    background: var(--pd-featured-bg);
    color: var(--pd-featured-text);
    font-weight: 700;
    font-size: 11px;
    padding: 3px 8px;
    flex-shrink: 0;
  }

  /* Right column — actions */
  .pd-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }
  .pd-action-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 16px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid rgba(255,255,255,0.5);
    box-shadow: var(--pd-btn-shadow);
  }
  .pd-btn--neutral {
    background: var(--pd-outline-bg);
    color: var(--pd-outline-text);
  }
  .pd-btn--direct {
    background: var(--pd-direct-bg);
    color: var(--pd-direct-text);
    font-weight: 600;
    box-shadow:
      4px 4px 10px rgba(59,130,246,0.12),
      -2px -2px 6px rgba(255,255,255,0.8),
      inset 2px 2px 4px rgba(255,255,255,0.7),
      inset -1px -1px 2px rgba(0,0,0,0.03);
  }
  .pd-btn--easy {
    background: linear-gradient(135deg, #2DD4BF, #0D9488);
    color: #FFF;
    font-weight: 700;
    border: 1px solid rgba(255,255,255,0.3);
    box-shadow:
      4px 4px 10px rgba(13,148,136,0.25),
      -2px -2px 6px rgba(255,255,255,0.3),
      inset 2px 2px 4px rgba(255,255,255,0.25),
      inset -1px -1px 2px rgba(0,0,0,0.08);
  }
  .pd-posted {
    font-size: 12px;
    color: var(--pd-ink-muted);
  }

  /* Empty state */
  .pd-empty {
    background: var(--pd-card);
    border-radius: 20px;
    box-shadow: var(--pd-clay-shadow);
    padding: 32px 22px;
    text-align: center;
    color: var(--pd-ink-soft);
    line-height: 1.65;
  }
  .pd-empty p { margin: 0 0 6px; font-size: 14px; }
  .pd-empty a { color: var(--pd-teal); font-weight: 700; }
  .pd-empty a:hover { text-decoration: underline; }

  /* Footer stamp */
  .pd-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-top: 14px;
    padding: 6px 6px 0;
    font-size: 12px;
    color: var(--pd-ink-muted);
  }
  .pd-stamp {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .pd-stamp a {
    color: var(--pd-ink);
    text-decoration: none;
    font-weight: 700;
  }
  .pd-stamp a:hover { color: var(--pd-teal); }

  /* Responsive: keep the avatar | body | actions horizontal layout at
     iframe widths down to ~500px — same as the /jobs list-mode card
     does on the live site. Only stack below that (true mobile). */
  @media (max-width: 500px) {
    .pd-wrap { padding: 16px 12px 24px; }
    .pd-heading { font-size: 19px; }
    .pd-row {
      flex-direction: column;
      gap: 12px;
      padding: 14px 16px;
    }
    .pd-actions {
      width: 100%;
      align-items: flex-start;
    }
    .pd-action-row { flex-wrap: wrap; }
    .pd-title { white-space: normal; }
    .pd-btn { padding: 7px 12px; font-size: 12px; }
    .pd-pill { padding: 4px 10px; font-size: 11.5px; }
  }
</style>
</head>
<body>
<div class="pd-wrap">
  <header class="pd-header">
    <!-- Top row: brand wordmark (left) + primary CTA (right), vertically aligned. -->
    <div class="pd-header-top">
      <a class="pd-brand" href="${escape(brandUrl)}" target="_blank" rel="noopener" aria-label="PMHNP Hiring">
        <img class="pd-brand-logo" src="${escape(baseUrl())}/logo.png" alt="" width="72" height="72" loading="eager" decoding="async">
        <span class="pd-brand-mark">PMHNP <span class="pd-brand-mark-accent">Hiring</span></span>
      </a>
      <a class="pd-cta" href="${escape(seeAllUrl)}" target="_blank" rel="noopener">
        See all in ${escape(state)}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
      </a>
    </div>
    <!-- Content header: heading + subtitle. -->
    <div class="pd-header-title">
      <h2 class="pd-heading">${heading}</h2>
      <p class="pd-sub">${subheading}</p>
    </div>
  </header>
  ${cards}${emptyState}
  <div class="pd-footer">
    <span class="pd-stamp">
      Powered by <a href="${escape(brandUrl)}" target="_blank" rel="noopener">pmhnphiring.com</a>
    </span>
  </div>
</div>
</body>
</html>`
}

/**
 * Render the validation-failure response. Reuses the widget shell (brand
 * wordmark + cream body + footer) so a broken iframe still looks like
 * ours, but the body explicitly says "this request was invalid" with a
 * CTA to browse all PMHNP jobs. No fake "Jobs in <state>" header.
 */
function renderErrorHtml(args: { reason: string }): string {
  const browseAllUrl = `${baseUrl()}/jobs?utm_source=widget&utm_medium=embed&utm_campaign=pd-error`
  const brandUrl = `${baseUrl()}?utm_source=widget&utm_medium=embed&utm_campaign=pd-error`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>PMHNP Hiring — widget</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #F5F0EB; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: #1A2E35;
    -webkit-font-smoothing: antialiased;
    line-height: 1.55;
  }
  a { color: inherit; text-decoration: none; }
  .pd-wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 28px 22px;
  }
  .pd-brand {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 28px;
    text-decoration: none;
  }
  .pd-brand-logo { width: 56px; height: 56px; object-fit: contain; }
  .pd-brand-mark {
    font-family: 'Lora', Georgia, serif;
    font-size: 20px; font-weight: 700;
    color: #3D2E24; letter-spacing: -0.01em; line-height: 1;
    margin-left: -6px;
  }
  .pd-brand-mark-accent {
    font-style: italic; color: #0D9488; font-weight: 600;
  }
  .pd-error-card {
    background: #FFFFFF;
    border-radius: 20px;
    padding: 36px 28px;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.5);
    box-shadow:
      8px 8px 20px rgba(0,0,0,0.07),
      -4px -4px 12px rgba(255,255,255,0.9),
      inset 2px 2px 4px rgba(255,255,255,0.6);
  }
  .pd-error-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    background: #FEF3C7;
    color: #92400E;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  .pd-error-heading {
    margin: 0 0 10px;
    font-family: 'Lora', Georgia, serif;
    font-size: 20px;
    font-weight: 800;
    color: #1A2E35;
    line-height: 1.25;
  }
  .pd-error-reason {
    margin: 0 0 22px;
    font-size: 14px;
    color: #4A5568;
    max-width: 460px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.6;
  }
  .pd-error-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 22px;
    border-radius: 14px;
    background: #0D9488;
    color: #FFFFFF;
    font-size: 13.5px;
    font-weight: 700;
    border: 1px solid rgba(255,255,255,0.3);
    box-shadow:
      5px 5px 12px rgba(13,148,136,0.22),
      inset 2px 2px 4px rgba(255,255,255,0.2);
  }
  .pd-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
    padding: 6px 6px 0;
    font-size: 12px;
    color: #718096;
  }
  .pd-footer a {
    color: #1A2E35;
    font-weight: 700;
  }
  .pd-footer a:hover { color: #0D9488; }
</style>
</head>
<body>
<div class="pd-wrap">
  <a class="pd-brand" href="${escape(brandUrl)}" target="_blank" rel="noopener" aria-label="PMHNP Hiring">
    <img class="pd-brand-logo" src="${escape(baseUrl())}/logo.png" alt="" width="56" height="56">
    <span class="pd-brand-mark">PMHNP <span class="pd-brand-mark-accent">Hiring</span></span>
  </a>
  <div class="pd-error-card" role="alert" aria-live="polite">
    <div class="pd-error-badge">Widget Request Issue</div>
    <h2 class="pd-error-heading">We couldn&rsquo;t load this widget</h2>
    <p class="pd-error-reason">${args.reason}</p>
    <a class="pd-error-cta" href="${escape(browseAllUrl)}" target="_blank" rel="noopener">
      Browse all PMHNP jobs
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
    </a>
  </div>
  <div class="pd-footer">
    <span>Powered by <a href="${escape(brandUrl)}" target="_blank" rel="noopener">pmhnphiring.com</a></span>
  </div>
</div>
</body>
</html>`
}

function withWidgetHeaders(res: NextResponse): NextResponse {
  // Allow embedding on .edu (the target audience) and the site's own
  // origin (for the /for-programs live demo). frame-ancestors supersedes
  // the legacy X-Frame-Options header.
  res.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.edu https://pmhnphiring.com",
  )
  // Near-realtime: 60s edge cache + stale-while-revalidate for snappy
  // iframe loads. Worst-case staleness is 60s; a newly-posted role
  // shows in the widget within a minute.
  res.headers.set(
    'Cache-Control',
    'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
  )
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  res.headers.set('Content-Type', 'text/html; charset=utf-8')
  return res
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rawState = (req.nextUrl.searchParams.get('state') ?? '').toUpperCase()
  const rawLimit = req.nextUrl.searchParams.get('limit') ?? undefined
  const raw = {
    state: rawState,
    program: req.nextUrl.searchParams.get('program') ?? undefined,
    limit: rawLimit,
  }

  const parsed = QUERY_SCHEMA.safeParse(raw)
  if (!parsed.success) {
    // Surface a real error message instead of pretending the widget
    // loaded with empty results. zod's `issues` array tells us which
    // field failed so we can write a specific reason rather than a
    // generic "bad request".
    const fieldErrors = new Set(
      parsed.error.issues.map((i) => String(i.path[0] ?? '')),
    )
    let reason: string
    if (fieldErrors.has('state')) {
      reason = rawState
        ? `"${escape(rawState.slice(0, 8))}" is not a valid US state code. Use a 2-letter code like CA, NY, or TX.`
        : 'A 2-letter US state code is required (e.g., state=CA).'
    } else if (fieldErrors.has('limit')) {
      reason = `Jobs to show must be a number between ${LIMIT_MIN} and ${LIMIT_MAX}. Received "${escape(String(rawLimit ?? ''))}".`
    } else {
      reason = 'We couldn\'t load PMHNP jobs for that request. Try again with a valid state code.'
    }
    return withWidgetHeaders(
      new NextResponse(renderErrorHtml({ reason }), { status: 400 }),
    )
  }

  const { state, program } = parsed.data
  const limit = parsed.data.limit ?? LIMIT_DEFAULT

  try {
    const rows = await prisma.job.findMany({
      where: {
        stateCode: state,
        isPublished: true,
        isManuallyUnpublished: false,
        archivedAt: null,
        // Exclude obviously-dead aggregator jobs at the DB level so we
        // don't fetch 36 candidates only to filter most away in memory.
        // healthConsecutiveMissing is Int (default 0, never null), so we
        // only need the employer-bypass + non-dead branches.
        OR: [
          { sourceType: 'employer' },
          { healthConsecutiveMissing: { lt: HEALTH_DEAD_THRESHOLD } },
        ],
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: candidatePoolFor(limit),
      select: {
        id: true,
        slug: true,
        title: true,
        employer: true,
        location: true,
        city: true,
        stateCode: true,
        isRemote: true,
        isHybrid: true,
        mode: true,
        jobType: true,
        displaySalary: true,
        salaryRange: true,
        normalizedMinSalary: true,
        normalizedMaxSalary: true,
        salaryPeriod: true,
        isFeatured: true,
        isVerifiedEmployer: true,
        applyLink: true,
        applyOnPlatform: true,
        sourceType: true,
        healthConsecutiveMissing: true,
        createdAt: true,
        originalPostedAt: true,
        employerJobs: { select: { companyLogoUrl: true } },
      },
    })

    const candidates: readonly WidgetJob[] = rows.map((r) => ({
      ...r,
      companyLogoUrl: r.employerJobs?.companyLogoUrl ?? null,
    }))

    const jobs = selectJobs(candidates, limit)

    return withWidgetHeaders(
      new NextResponse(renderHtml({ state, program, jobs }), { status: 200 }),
    )
  } catch (err) {
    logger.error('[widget] query failed', err, { state, program })
    // Render the shell with zero jobs rather than 500 — a broken iframe
    // looks worse on the partner's site than an empty one.
    return withWidgetHeaders(
      new NextResponse(renderHtml({ state, program, jobs: [] }), { status: 200 }),
    )
  }
}
