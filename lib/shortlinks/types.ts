/**
 * Shared types for the short-link subsystem.
 *
 * The runtime split:
 *   campaigns.ts → static catalog of codes the team has shipped
 *   resolver.ts  → pure, side-effect-free code-to-destination resolution
 *   bots.ts      → link-preview and crawler UA detection
 *   tracker.ts   → DB-backed attribution write path (fire-and-forget)
 *   index.ts     → public re-exports
 */

export interface CampaignJob {
  /** 1-based id used in short codes (e.g. `f3` → jobId=3). 0 is reserved
   *  for the campaign's browse-all landing. */
  readonly id: number
  /** Public `/jobs/<slug>` slug. Frozen when a campaign ships; renaming a
   *  job slug after the fact would break already-published posts. */
  readonly slug: string
  /** Human-readable identifier persisted on every click row. Used as the
   *  `utm_content` equivalent in any downstream reporting. */
  readonly content: string
}

export interface ShortlinkCampaign {
  /** Campaign slug — also the `utm_campaign` value if exported. */
  readonly campaign: string
  /** Active jobs in this campaign. id=0 is implicit (browse-all). */
  readonly jobs: readonly CampaignJob[]
}

export interface ShortlinkResolution {
  /** Bare destination URL — no UTM params (middleware strips them anyway). */
  readonly destination: string
  /** Path portion of the destination — what gets written to
   *  `shortlink_clicks.destination_path` for forensics. */
  readonly destinationPath: string
  /** Resolved platform name (facebook, instagram, …). */
  readonly platform: string
  /** Campaign slug. */
  readonly campaign: string
  /** Per-job content slug. */
  readonly content: string
  /** Numeric id within the campaign (0 = browse-all). */
  readonly jobId: number
}

/** Result of bot detection on an incoming UA. */
export interface BotIdentification {
  readonly isBot: boolean
  /** Short label for the matched bot family. Null when `isBot=false`. */
  readonly botName: string | null
}
