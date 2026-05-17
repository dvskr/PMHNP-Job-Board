import { ACTIVE_CAMPAIGN, PLATFORM_BY_LETTER } from './campaigns'
import type { ShortlinkCampaign, ShortlinkResolution } from './types'

/**
 * Pure, side-effect-free resolution of `<platform-letter><job-number>` codes
 * into a redirect destination and the metadata to log against the click.
 *
 * Why this lives apart from the route handler:
 *   - testable without DB / fetch mocks
 *   - reusable from the admin stats endpoint to render human-readable rows
 *   - the tracker and the redirector share a single source of truth for
 *     which (code → destination) tuple is canonical
 *
 * Returns null on any of:
 *   - empty / unparseable input
 *   - unknown platform letter
 *   - unknown job id within the campaign (id=0 is always valid → browse-all)
 *
 * Inputs are normalized to lowercase. `baseUrl` is required (no
 * env-default) so this function stays deterministic in tests.
 */
const CODE_PATTERN = /^([a-z])(\d{1,4})$/

export function resolveShortlink(
  rawCode: string,
  baseUrl: string,
  campaign: ShortlinkCampaign = ACTIVE_CAMPAIGN,
): ShortlinkResolution | null {
  if (typeof rawCode !== 'string' || rawCode.length === 0 || rawCode.length > 8) {
    return null
  }

  const code = rawCode.toLowerCase()
  const match = code.match(CODE_PATTERN)
  if (!match) return null

  const [, letter, numStr] = match
  const platform = PLATFORM_BY_LETTER[letter]
  if (!platform) return null

  const id = Number(numStr)
  if (!Number.isInteger(id) || id < 0) return null

  const trimmedBase = baseUrl.replace(/\/$/, '')

  // Program-director outreach ('p' letter) always lands on /for-programs
  // regardless of id — the campaign motion is education (here's the
  // partnership offer), not job discovery. Per-recipient attribution
  // still flows through `?r=<lead_id>` on the inbound URL.
  if (letter === 'p') {
    return Object.freeze({
      destination: `${trimmedBase}/for-programs`,
      destinationPath: '/for-programs',
      platform,
      campaign: campaign.campaign,
      content: 'pd-landing',
      jobId: id,
    })
  }

  if (id === 0) {
    return Object.freeze({
      destination: `${trimmedBase}/jobs`,
      destinationPath: '/jobs',
      platform,
      campaign: campaign.campaign,
      content: 'browse-all',
      jobId: 0,
    })
  }

  const job = campaign.jobs.find((j) => j.id === id)
  if (!job) return null

  const path = `/jobs/${job.slug}`
  return Object.freeze({
    destination: `${trimmedBase}${path}`,
    destinationPath: path,
    platform,
    campaign: campaign.campaign,
    content: job.content,
    jobId: job.id,
  })
}
