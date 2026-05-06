import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { GREENHOUSE_TOTAL_CHUNKS } from './aggregators/greenhouse';
import { getLastRunDiagnostics as getFantasticJobsDiag } from './aggregators/fantastic-jobs-db';
import { normalizeJobWithReason } from './job-normalizer';
import { checkDuplicate, buildJobIdentityKey, buildApplyUrlPathKey } from './deduplicator';
import { getOrCreateCompany } from './company-normalizer';
import { recordIngestionStats } from './source-analytics';
import { classifyRelevance } from './utils/job-filter';
import { computeCompleteness } from './job-normalizer';
import { extractWithLLM, type LLMExtractResult } from './llm-enrichment';
import { collectEmployerEmails } from './employer-email-collector';
import { mineAndPersistFromJob } from './lead-persistence';
import { recordSourcePresence, loadHistoricalAvgFetched } from './health/source-presence';
import { HealthRecorder } from './health/recorder';
import { recordChunkAndMaybeAggregate } from './health/chunked-presence';
import { checkJobHealth, type HealthReason } from './health/check-job-health';

/**
 * Reasons we reject a job at ingest time. Only the highest-confidence
 * "definitively dead" signals — soft_404 and inconclusive_* never block
 * the insert because we'd rather admit a borderline job and let the
 * dead-link cron's multi-signal voting catch it on the next run.
 */
const INGEST_DEAD_REASONS: ReadonlySet<HealthReason> = new Set([
  'http_404',
  'http_410',
  'greenhouse_api_404',
  'lever_api_404',
  'smartrecruiters_api_404',
]);

// ── Global dedup maps (pre-loaded once at start of full ingestion run) ──
let globalExternalIdMap: Map<string, { id: string; sourceProvider: string; originalPostedAt: Date | null }> | null = null;
let globalApplyLinkMap: Map<string, string> | null = null; // URL.pathname.slice(0,60) -> jobId
// 2026-05-05: third map added after prod audit found Strategy 2 ("exact
// title+employer+location") was silently dropping dupes whenever > 50
// candidates shared a title prefix (LifeStance had 27× duplicates of one
// identity). Memory-resident lookup eliminates that cap.
let globalTitleKeyMap: Map<string, string> | null = null; // identityKey -> jobId
import { pingAllSearchEnginesBatch } from './search-indexing';
import { computeQualityScore } from './utils/quality-score';

// JobSource is defined in lib/aggregators/types.ts and re-exported here
// so legacy callers (scripts, cron route) keep working unchanged.
export type { JobSource } from './aggregators/types';
import type { JobSource } from './aggregators/types';
import { aggregators } from './aggregators/registry';

/** Single source of truth — derived from the registry. */
export const ALL_SOURCES: JobSource[] = Object.keys(aggregators) as JobSource[];

export interface IngestionResult {
  source: JobSource;
  fetched: number;
  added: number;
  duplicates: number;
  errors: number;
  duration: number;
  newJobUrls: string[];
  newJobIds: string[];
  /**
   * Rejection counts grouped by `rejectionReason`. Captures the
   * fetched→added funnel collapse — pre-2026-05-06 we saw `47,563 fetched
   * → 37 added` for greenhouse with no visibility into where the other
   * 47k went (relevance? normalizer? probe?). Now surfaced in the Discord
   * summary so the funnel is observable.
   */
  rejectedByReason: Record<string, number>;
}

// Max time budget per cron invocation — stop gracefully before Vercel's 300s hard limit
const MAX_INGESTION_MS = 240_000; // 240s (leave 60s buffer for post-processing)

// Sources whose fetch is split across multiple cron chunks. Source-presence
// tracking is unsafe per-chunk (would falsely mark jobs from other chunks as
// missing). Sprint 3 will run an aggregated presence check after all chunks
// land. Until then we skip these sources from per-run presence updates.
const CHUNKED_SOURCES: ReadonlySet<JobSource> = new Set(['greenhouse', 'workday']);

// Quality score is computed for every job after insert and used as a
// ranking signal (DB index `qualityScore(sort: Desc)`). It is intentionally
// NOT used as a hard gate: at the catalog's current distribution (mean
// ~35, P5 < 10), any gate strict enough to bite (>=30) would unpublish
// ~40% of inventory, while a gate lax enough to be safe (5) catches zero.
// Ranking-by-quality already surfaces good jobs first without the
// false-positive risk of an unpublish gate. Last reviewed: 2026-04-30.

const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
  'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH',
  'new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
  'north dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA',
  'rhode island':'RI','south carolina':'SC','south dakota':'SD','tennessee':'TN',
  'texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA',
  'west virginia':'WV','wisconsin':'WI','wyoming':'WY','district of columbia':'DC',
};

const EXPERIENCE_LLM_TO_CANONICAL: Record<string, string> = {
  'entry level': 'New Grad',
  'entry-level': 'New Grad',
  'mid level': 'Mid-Level',
  'mid-level': 'Mid-Level',
  'senior level': 'Senior',
  'senior-level': 'Senior',
  'director': 'Senior',
};

/**
 * Merge LLM-extracted fields into a normalized job WITHOUT overwriting
 * already-present values. Used by the inline-rescue path for borderline-
 * completeness jobs.
 *
 * Convention matches the enrich-jobs cron's update-data construction —
 * if either codepath changes its merge logic, update the other to match.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeLlmIntoNormalized(job: any, llm: LLMExtractResult): any {
  const next = { ...job };

  // Salary — only fill when the regex pass came up empty. Salary_min from
  // the LLM is already in annual USD per the prompt contract.
  if (llm.salary_min && !next.normalizedMinSalary) {
    const min = Math.round(llm.salary_min);
    const max = Math.round(llm.salary_max ?? llm.salary_min);
    next.normalizedMinSalary = min;
    next.normalizedMaxSalary = max;
    next.minSalary = min;
    next.maxSalary = max;
    next.salaryIsEstimated = true;
    next.salaryConfidence = 0.7;
    if (llm.salary_period) next.salaryPeriod = llm.salary_period;
    next.displaySalary = `$${Math.round(min / 1000)}k - $${Math.round(max / 1000)}k/yr`;
  }

  if (llm.job_type && !next.jobType) next.jobType = llm.job_type;

  if (llm.work_mode && !next.mode) {
    const raw = llm.work_mode.trim();
    const canon =
      raw === 'Telehealth' ? 'Remote'
        : raw === 'On-site' || raw === 'Onsite' ? 'In-Person'
        : raw === 'Remote' || raw === 'Hybrid' || raw === 'In-Person' ? raw
        : null;
    if (canon) {
      next.mode = canon;
      if (canon === 'Remote') next.isRemote = true;
      if (canon === 'Hybrid') next.isHybrid = true;
    }
  }

  if (llm.city && !next.city) next.city = llm.city;

  if (llm.state && !next.state) {
    next.state = llm.state;
    const code = STATE_NAME_TO_CODE[llm.state.toLowerCase()];
    if (code && !next.stateCode) next.stateCode = code;
  }

  if (llm.experience_level && !next.experienceLevel) {
    const canon = EXPERIENCE_LLM_TO_CANONICAL[llm.experience_level.toLowerCase()];
    if (canon) next.experienceLevel = canon;
  }

  if (llm.clinical_setting && !next.setting) next.setting = llm.clinical_setting;
  if (llm.patient_population && !next.population) next.population = llm.patient_population;
  if (
    llm.benefits &&
    Array.isArray(llm.benefits) &&
    llm.benefits.length > 0 &&
    (!next.benefits || next.benefits.length === 0)
  ) {
    next.benefits = llm.benefits;
  }

  return next;
}

/**
 * Fetch raw jobs from a specific source via the adapter registry.
 *
 * Adapters live in lib/aggregators/, register themselves in
 * lib/aggregators/registry.ts, and implement the standard Aggregator
 * interface from lib/aggregators/types.ts.
 */
async function fetchFromSource(
  source: JobSource,
  options?: { chunk?: number; fantasticEndpoint?: '7d' | '6m' },
): Promise<Array<Record<string, unknown>>> {
  const aggregator = aggregators[source];
  if (!aggregator) {
    console.warn(`[Ingestion] Unknown source: ${source}`);
    return [];
  }
  const fetchOpts: { chunk?: number; endpoint?: '7d' | '6m' } = {};
  if (options?.chunk !== undefined) fetchOpts.chunk = options.chunk;
  if (options?.fantasticEndpoint !== undefined) fetchOpts.endpoint = options.fantasticEndpoint;
  return (await aggregator.fetch(fetchOpts)) as unknown as Array<Record<string, unknown>>;
}

/**
 * Extract raw title from a rawJob for early relevance filtering
 */
function extractRawTitle(rawJob: Record<string, unknown>): string {
  return String(
    rawJob.title || rawJob.job_title || rawJob.jobOpeningName || rawJob.positionName || ''
  );
}

/**
 * Extract external IDs from raw fetch results, matching the priority order
 * the normalizer uses (`externalId` → `id` → `external_id`). Returns a
 * de-duplicated array of non-empty string IDs for source-presence tracking.
 */
function collectExternalIds(rawJobs: Array<Record<string, unknown>>): string[] {
  const seen = new Set<string>();
  for (const raw of rawJobs) {
    const candidate = raw.externalId ?? raw.id ?? raw.external_id;
    if (candidate === null || candidate === undefined) continue;
    const id = String(candidate).trim();
    if (id.length === 0) continue;
    seen.add(id);
  }
  return Array.from(seen);
}

/**
 * Ingest jobs from a single source
 */
async function ingestFromSource(source: JobSource, options?: { chunk?: number; fantasticEndpoint?: '7d' | '6m' }): Promise<IngestionResult> {
  const startTime = Date.now();
  let fetched = 0;
  let added = 0;
  let duplicates = 0; // "Renewed" jobs are counted as duplicates for now to maintain stats semantics
  let errors = 0;
  const newJobUrls: string[] = [];
  const newJobIds: string[] = [];
  // Running average of the per-insert qualityScore so we can write
  // avgQualityScore to source_stats without a post-hoc SELECT.
  let qualityScoreSum = 0;
  let qualityScoreCount = 0;

  try {
    console.log(`\n[${source.toUpperCase()}] Starting ingestion...`);

    // Fetch raw jobs from source
    const rawJobs = await fetchFromSource(source, options);
    fetched = rawJobs.length;

    console.log(`[${source.toUpperCase()}] Fetched ${fetched} jobs`);

    // Buffer for rejected jobs (batch-inserted at end)
    const rejectedJobs: Array<{
      title: string;
      employer: string | null;
      location: string | null;
      applyLink: string | null;
      externalId: string | null;
      sourceProvider: string;
      rejectionReason: string;
      rawData: object;
    }> = [];

    if (fetched === 0) {
      // Surface diagnostics to Discord so we can debug without scraping
      // Vercel function logs. Only fantastic-jobs-db exposes a per-run
      // diagnostic accessor today.
      if (source === 'fantastic-jobs-db') {
        try {
          const diag = getFantasticJobsDiag();
          const { sendDiscordMessage } = await import('./discord-notifier');
          await sendDiscordMessage('', [{
            title: `⚠️ ${source}: zero rows fetched`,
            color: 0xFFAA00,
            fields: [
              { name: 'First HTTP status', value: String(diag.firstResponseStatus ?? 'no-response'), inline: true },
              { name: 'Rate-limit remaining', value: String(diag.rateLimitRemaining ?? 'unknown'), inline: true },
              { name: 'Status counts', value: '```' + JSON.stringify(diag.statusCounts) + '```', inline: false },
              { name: 'Abort reasons', value: '```' + (diag.abortReasons.length > 0 ? diag.abortReasons.join(', ') : '(none)') + '```', inline: false },
              { name: 'First URL', value: '```' + (diag.firstResponseUrl ?? '(none)').slice(0, 500) + '```', inline: false },
              { name: 'First body sample', value: '```' + (diag.firstResponseBodySample ?? '(none)').slice(0, 500) + '```', inline: false },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: `PMHNP Job Board — ${source} diagnostic` },
          }]);
        } catch (e) {
          console.error('[Ingest] Failed to push fantastic-jobs diag to Discord', e);
        }
      }
      return { source, fetched, added, duplicates, errors, duration: Date.now() - startTime, newJobUrls, newJobIds, rejectedByReason: countRejectionsByReason(rejectedJobs) };
    }

    // Use global dedup maps (pre-loaded once at start of full run)
    // Fall back to per-source loading if global maps not available
    let existingJobsMap: Map<string, { id: string; originalPostedAt: Date | null }>;
    if (globalExternalIdMap) {
      // Filter global map for this source
      existingJobsMap = new Map();
      for (const [extId, val] of globalExternalIdMap) {
        if (val.sourceProvider === source) {
          existingJobsMap.set(extId, { id: val.id, originalPostedAt: val.originalPostedAt });
        }
      }
    } else {
      existingJobsMap = new Map();
      const existingJobs = await prisma.job.findMany({
        where: { sourceProvider: source },
        select: { id: true, externalId: true, originalPostedAt: true },
      });
      existingJobs.forEach(job => {
        if (job.externalId) {
          existingJobsMap.set(job.externalId, { id: job.id, originalPostedAt: job.originalPostedAt });
        }
      });
    }

    // Hard lifetime cap: 60 days from originalPostedAt. No renewal extensions.
    // Once a job is set, expiresAt = originalPostedAt + 60d and stays there.
    // The "renewal" path now ONLY: (a) revives jobs that were unpublished but
    // are still within their 60-day window, (b) touches updatedAt for freshness
    // scoring. It does NOT push expiresAt forward.
    const MAX_JOB_AGE_MS = 60 * 24 * 60 * 60 * 1000;
    let expiredByAge = 0;

    const renewJob = async (
      id: string,
      title: string,
      existingPostedAt?: Date | null,
      fresh?: Record<string, unknown> | null,
    ) => {
      try {
        // Single SELECT — fetches `isManuallyUnpublished` AND all the
        // fields we'd consider enriching with fresh source data. Avoids
        // a second roundtrip per renewal at the per-source-loop scale.
        const existing = await prisma.job.findUnique({
          where: { id },
          select: {
            isManuallyUnpublished: true,
            description: true,
            descriptionSummary: true,
            minSalary: true,
            maxSalary: true,
            salaryPeriod: true,
            salaryRange: true,
            displaySalary: true,
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
            city: true,
            state: true,
            stateCode: true,
            jobType: true,
            mode: true,
            experienceLevel: true,
            setting: true,
            population: true,
            benefits: true,
          },
        });
        if (!existing) return;
        if (existing.isManuallyUnpublished) {
          return; // Skip — admin intentionally hid this job
        }

        // Enforce 60-day-from-original cap. Past it → unpublish, do not renew.
        if (existingPostedAt) {
          const ageMs = Date.now() - new Date(existingPostedAt).getTime();
          if (ageMs > MAX_JOB_AGE_MS) {
            await prisma.job.update({
              where: { id },
              data: { isPublished: false },
            });
            rejectedJobs.push({
              title: title,
              employer: null,
              location: null,
              applyLink: null,
              externalId: null,
              sourceProvider: source,
              rejectionReason: 'renewal_age_expired',
              rawData: { jobId: id, ageDays: Math.round(ageMs / (24 * 60 * 60 * 1000)) } as object,
            });
            expiredByAge++;
            return;
          }
        }

        // Within window: revive if it was unpublished, touch updatedAt.
        // expiresAt is intentionally NOT extended — the original 60-day
        // window from originalPostedAt is the absolute clock.
        // If fresh data is available, merge improvements (longer description,
        // newly-present salary, missing location parts, etc.) — never
        // overwrite richer existing data with leaner fresh data.
        const update: Record<string, unknown> = {
          isPublished: true,
          updatedAt: new Date(),
        };
        if (fresh) {
          Object.assign(update, buildRenewalEnrichmentDelta(existing, fresh));
        }
        await prisma.job.update({ where: { id }, data: update });
      } catch (e) {
        console.error(`[${source.toUpperCase()}] Failed to renew job ${id}:`, e);
      }
    };

    // Process each job — with time budget
    let stoppedEarly = false;
    for (let i = 0; i < rawJobs.length; i++) {
      // Check time budget — stop before hitting Vercel's 300s limit
      if (Date.now() - startTime > MAX_INGESTION_MS) {
        console.warn(`[${source.toUpperCase()}] ⏰ Time budget exceeded at job ${i + 1}/${rawJobs.length} — stopping gracefully after ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
        stoppedEarly = true;
        break;
      }

      const rawJob = rawJobs[i];

      try {
        // ── PRE-FILTER: Quick relevance check on raw title BEFORE expensive normalization ──
        // This saves CPU on salary extraction, location parsing, description cleaning
        // for jobs that will be rejected anyway. JSearch already pre-filters internally,
        // but other sources don't.
        const rawTitle = extractRawTitle(rawJob);
        const rawDesc = String(rawJob.description || rawJob.job_description || '');
        const rawEmployer = String(
          rawJob.employer || rawJob.company || rawJob.employer_name || rawJob.organizationName || ''
        );
        if (source !== null && rawTitle) {
          const classification = classifyRelevance(rawTitle, rawDesc, rawEmployer);
          if (!classification.passes) {
            rejectedJobs.push({
              title: rawTitle,
              employer: rawEmployer || null,
              location: String(rawJob.location || rawJob.locationsText || rawJob.job_city || null),
              applyLink: String(rawJob.applyLink || rawJob.apply_link || rawJob.url || rawJob.link || null),
              externalId: String(rawJob.externalId || rawJob.id || rawJob.job_id || null),
              sourceProvider: source,
              // Sub-bucketed reason: 'relevance_no_keyword' | 'relevance_generic_title'
              // | 'relevance_wrong_role'. Old single-bucket 'relevance_filter' is
              // gone. Migrations / queries that filter by reason should be updated.
              rejectionReason: classification.reason,
              rawData: rawJob as object,
            });
            continue;
          }
        }

        // Normalize the job (field extraction, salary parsing, gates, etc.)
        const normalizeResult = normalizeJobWithReason(rawJob, source);

        if (!normalizeResult.job) {
          // Sub-bucketed reasons:
          //   normalizer_missing_required_field
          //   normalizer_missing_description
          //   normalizer_stale_post
          //   normalizer_indirect_apply
          //   normalizer_exception
          rejectedJobs.push({
            title: rawTitle || 'Unknown',
            employer: String(rawJob.employer || rawJob.company || rawJob.employer_name || rawJob.organizationName || null),
            location: String(rawJob.location || rawJob.locationsText || rawJob.job_city || null),
            applyLink: String(rawJob.applyLink || rawJob.apply_link || rawJob.url || rawJob.link || null),
            externalId: String(rawJob.externalId || rawJob.id || rawJob.job_id || null),
            sourceProvider: source,
            rejectionReason: normalizeResult.rejectionReason ?? 'normalizer_exception',
            rawData: rawJob as object,
          });
          continue;
        }
        let normalizedJob = normalizeResult.job;

        // ── Inline LLM-rescue pass for borderline-completeness jobs ──
        // If completeness score is between the hard floor (20, enforced by
        // normalizer) and the soft floor (40), we give the job ONE shot at
        // LLM enrichment before rejecting. Only fires when the description
        // is substantive enough for the LLM to do something useful.
        // Time-budgeted to keep us inside the 240s ingest envelope.
        const SOFT_COMPLETENESS_FLOOR = 40;
        const initialScore = computeCompleteness(normalizedJob);
        if (
          initialScore < SOFT_COMPLETENESS_FLOOR &&
          (normalizedJob.description?.length ?? 0) >= 200 &&
          // Don't burn LLM time when the orchestrator's clock is almost up.
          Date.now() - startTime < MAX_INGESTION_MS - 30_000
        ) {
          try {
            const llm = await extractWithLLM(
              normalizedJob.description ?? '',
              normalizedJob.title,
              normalizedJob.employer ?? '',
              normalizedJob.location ?? '',
            );
            if (llm.result) {
              normalizedJob = mergeLlmIntoNormalized(normalizedJob, llm.result);
            }
          } catch (e) {
            // LLM down / network error → fall through with original score.
            console.warn(`[Ingest][${source}] inline LLM enrich failed:`, e);
          }
        }

        const finalScore = computeCompleteness(normalizedJob);
        if (finalScore < SOFT_COMPLETENESS_FLOOR) {
          rejectedJobs.push({
            title: normalizedJob.title,
            employer: normalizedJob.employer || null,
            location: normalizedJob.location || null,
            applyLink: normalizedJob.applyLink || null,
            externalId: normalizedJob.externalId || null,
            sourceProvider: source,
            rejectionReason: 'normalizer_low_completeness',
            rawData: rawJob as object,
          });
          continue;
        }

        // Strategy 1: Fast in-memory lookup for exact externalId match
        if (normalizedJob.externalId && existingJobsMap.has(normalizedJob.externalId)) {
          // AUTO-RENEWAL: Job exists, so we extend its life instead of ignoring it
          const existing = existingJobsMap.get(normalizedJob.externalId)!;
          await renewJob(existing.id, normalizedJob.title, existing.originalPostedAt, normalizedJob as Record<string, unknown>);

          // Track duplicate for analysis
          rejectedJobs.push({
            title: normalizedJob.title,
            employer: normalizedJob.employer || null,
            location: normalizedJob.location || null,
            applyLink: normalizedJob.applyLink || null,
            externalId: normalizedJob.externalId || null,
            sourceProvider: source,
            rejectionReason: 'duplicate_externalid',
            rawData: { matchedJobId: existing.id } as object,
          });

          duplicates++; // Count as duplicate (it IS a duplicate, just renewed)
          continue;
        }

        // Strategy 2: Fuzzy matching (only if not found by ID)
        const dupCheck = await checkDuplicate(
          {
            title: normalizedJob.title,
            employer: normalizedJob.employer,
            location: normalizedJob.location,
            externalId: normalizedJob.externalId ?? undefined,
            sourceProvider: normalizedJob.sourceProvider ?? undefined,
            applyLink: normalizedJob.applyLink ?? undefined,
          },
          {
            globalTitleKeyMap: globalTitleKeyMap ?? undefined,
            globalApplyLinkMap: globalApplyLinkMap ?? undefined,
          },
        );

        if (dupCheck.isDuplicate) {
          // AUTO-RENEWAL: Fuzzy match found, renew the matched job
          if (dupCheck.matchedJobId) {
            // Look up the existing job's originalPostedAt for age-cap enforcement
            const matchedJob = await prisma.job.findUnique({
              where: { id: dupCheck.matchedJobId },
              select: { originalPostedAt: true },
            });
            await renewJob(dupCheck.matchedJobId, normalizedJob.title, matchedJob?.originalPostedAt, normalizedJob as Record<string, unknown>);
          }

          // Track duplicate for analysis
          rejectedJobs.push({
            title: normalizedJob.title,
            employer: normalizedJob.employer || null,
            location: normalizedJob.location || null,
            applyLink: normalizedJob.applyLink || null,
            externalId: normalizedJob.externalId || null,
            sourceProvider: source,
            rejectionReason: `duplicate_${dupCheck.matchType || 'fuzzy'}`,
            rawData: { matchedJobId: dupCheck.matchedJobId, matchType: dupCheck.matchType } as object,
          });

          duplicates++;
          continue;
        }

        // ── Ingest-level dead probe ──
        // Cheapest fix for "dead jobs in the catalog": never insert one
        // that's already dead at the source. We probe only on the
        // post-dedup new-insert path — duplicates/renewals are already
        // trusted by prior probes via the dead-link cron.
        //
        // Only the high-confidence dead reasons block the insert. soft_404
        // and inconclusive_* fall through; the dead-link cron's
        // multi-signal voting will catch a real dead on the next pass
        // and a transient probe failure shouldn't reject a valid job.
        //
        // Skipped when applyLink is missing (employer-posted apply-on-
        // platform jobs) since there's nothing external to probe.
        const applyLinkStr =
          typeof normalizedJob.applyLink === 'string' ? normalizedJob.applyLink : null;
        if (applyLinkStr && applyLinkStr.length > 0) {
          try {
            const probeDecision = await checkJobHealth(applyLinkStr, source, {
              externalId:
                typeof normalizedJob.externalId === 'string'
                  ? normalizedJob.externalId
                  : null,
            });
            if (INGEST_DEAD_REASONS.has(probeDecision.reason)) {
              rejectedJobs.push({
                title: normalizedJob.title as string,
                employer: (normalizedJob.employer as string) || null,
                location: (normalizedJob.location as string) || null,
                applyLink: applyLinkStr,
                externalId: (normalizedJob.externalId as string) || null,
                sourceProvider: source,
                rejectionReason: 'dead_at_ingest',
                rawData: {
                  probeReason: probeDecision.reason,
                  finalStatus: probeDecision.evidence.finalStatus,
                  finalUrl: probeDecision.evidence.finalUrl,
                  redirectHops: probeDecision.evidence.redirectHops,
                } as object,
              });
              continue;
            }
          } catch (probeErr) {
            // Probe-system failure → accept the job. We never want a
            // bug or transient fault to reject otherwise-valid postings.
            console.warn(
              `[${source.toUpperCase()}] Ingest probe failed for "${normalizedJob.title}" — accepting job:`,
              probeErr,
            );
          }
        }

        // Step 7 enrichment is folded INTO the create payload (was previously
        // 3 SELECTs + 3 UPDATEs after the insert). parseJobLocation post-insert
        // was dead work — the normalizer already populates city/state/etc.
        // companyId and qualityScore can be resolved/computed from in-memory
        // data, so they go into the same `prisma.job.create` call.
        const newId = randomUUID();
        const slug = `${(normalizedJob.title as string)
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()}-${newId}`;

        // Resolve / create the Company row first so we can write companyId
        // in the same insert. Errors are non-fatal — a null companyId is OK.
        let companyId: string | null = null;
        try {
          if (normalizedJob.employer) {
            companyId = await getOrCreateCompany(normalizedJob.employer as string);
          }
        } catch (companyError) {
          console.error(`[${source.toUpperCase()}] Failed to resolve company for "${normalizedJob.title}":`, companyError);
        }

        // Quality score from in-memory normalizedJob — no extra SELECT.
        const qualityScore = computeQualityScore({
          applyLink: (normalizedJob.applyLink as string | null) ?? null,
          displaySalary: (normalizedJob.displaySalary as string | null) ?? null,
          normalizedMinSalary: (normalizedJob.normalizedMinSalary as number | null) ?? null,
          normalizedMaxSalary: (normalizedJob.normalizedMaxSalary as number | null) ?? null,
          descriptionSummary: (normalizedJob.descriptionSummary as string | null) ?? null,
          description: (normalizedJob.description as string | null) ?? null,
          city: (normalizedJob.city as string | null) ?? null,
          state: (normalizedJob.state as string | null) ?? null,
          isEmployerPosted: false, // aggregated jobs are never employer-posted
        });

        const savedJob = await prisma.job.create({
          data: {
            id: newId,
            ...(normalizedJob as any),
            slug,
            companyId,
            qualityScore,
          },
        });
        added++;
        newJobIds.push(savedJob.id);
        qualityScoreSum += qualityScore;
        qualityScoreCount++;

        // Lead-mining: regex emails / phones / websites out of the
        // description and upsert into employer_leads. Non-fatal — a bad
        // regex match must never block the ingest.
        try {
          await mineAndPersistFromJob({
            id: savedJob.id,
            employer: normalizedJob.employer as string,
            description: (normalizedJob.description as string | null) ?? null,
          });
        } catch (leadErr) {
          console.warn(`[Lead-Mining] Skipped job ${savedJob.id}:`, leadErr);
        }

        // Keep global dedup maps in sync so a later source in the same run
        // recognises this job. Without this, source N+1 would re-ingest the
        // job source N just inserted (the legacy lifestance lever+fantastic
        // double-rows are exactly this pattern).
        if (globalExternalIdMap && normalizedJob.externalId) {
          globalExternalIdMap.set(normalizedJob.externalId, {
            id: savedJob.id,
            sourceProvider: source,
            originalPostedAt: normalizedJob.originalPostedAt ?? null,
          });
        }
        if (globalApplyLinkMap && normalizedJob.applyLink) {
          const pathKey = buildApplyUrlPathKey(normalizedJob.applyLink);
          if (pathKey && !globalApplyLinkMap.has(pathKey)) globalApplyLinkMap.set(pathKey, savedJob.id);
        }
        if (globalTitleKeyMap && normalizedJob.title && normalizedJob.employer && normalizedJob.location) {
          const idKey = buildJobIdentityKey(normalizedJob.title, normalizedJob.employer, normalizedJob.location);
          if (!globalTitleKeyMap.has(idKey)) globalTitleKeyMap.set(idKey, savedJob.id);
        }

        newJobUrls.push(`https://pmhnphiring.com/jobs/${slug}`);

        // NOTE: Link validation (validateApplyLink) is skipped during ingestion
        // to avoid HTTP timeout overhead. It runs separately via check-dead-links cron.

        // Log progress every 10 jobs
        if ((i + 1) % 10 === 0) {
          console.log(`[${source.toUpperCase()}] Processed ${i + 1}/${fetched} jobs (${added} added, ${duplicates} renewed/dup, ${errors} errors)`);
        }

      } catch (error) {
        console.error(`[${source.toUpperCase()}] Error processing job:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    const duplicateRate = fetched > 0 ? ((duplicates / fetched) * 100).toFixed(1) : '0.0';

    console.log(`[${source.toUpperCase()}] Complete:`, {
      fetched,
      added,
      duplicates,
      expiredByAge,
      errors,
      duplicateRate: `${duplicateRate}%`,
      duration: `${(duration / 1000).toFixed(1)}s`
    });

    // Record stats — running quality average and per-reason rejection
    // breakdown both come from in-memory state so this is a single
    // upsert with no extra SELECT.
    const rejectedByReason = countRejectionsByReason(rejectedJobs);
    try {
      await recordIngestionStats({
        source,
        fetched,
        added,
        duplicates,
        avgQualityScore: qualityScoreCount > 0 ? qualityScoreSum / qualityScoreCount : undefined,
        rejectedByReason,
      });
    } catch (statsError) {
      console.error(`Failed to record stats for ${source}:`, statsError);
    }

    // Source-presence tracking. Two paths:
    //   - Non-chunked sources: run the presence check directly here.
    //   - Chunked sources (greenhouse, workday): hand the chunk to the
    //     cross-chunk aggregator which buffers in Redis, and runs the
    //     presence check only after the LAST chunk for the cycle lands.
    // Both paths skip when:
    //   - the run hit the time budget (partial fetches must not strike jobs)
    //   - the source has no historical baseline (returns 0)
    if (!stoppedEarly && fetched > 0) {
      try {
        const fetchedExternalIds = collectExternalIds(rawJobs);
        if (fetchedExternalIds.length > 0) {
          const recorder = new HealthRecorder(prisma);

          if (CHUNKED_SOURCES.has(source) && options?.chunk !== undefined) {
            const chunkResult = await recordChunkAndMaybeAggregate({
              prisma,
              source,
              chunkIndex: options.chunk,
              fetchedExternalIds,
              fetchedCount: fetched,
              recorder,
            });
            await recorder.flush();
            console.log(`[${source.toUpperCase()}] Chunked-presence chunk ${options.chunk}:`, {
              outcome: chunkResult.outcome,
              chunksSeen: chunkResult.chunksSeen,
              totalChunks: chunkResult.totalChunks,
              presence: chunkResult.presenceResult
                ? {
                    outcome: chunkResult.presenceResult.outcome,
                    seenAgain: chunkResult.presenceResult.seenAgain,
                    missing: chunkResult.presenceResult.missingThisRun,
                    updates: chunkResult.presenceResult.updatesIssued,
                  }
                : null,
              audit: recorder.stats(),
            });
          } else if (!CHUNKED_SOURCES.has(source)) {
            const baseline = await loadHistoricalAvgFetched(prisma, source);
            const presence = await recordSourcePresence(prisma, {
              source,
              fetchedExternalIds,
              fetchedCount: fetched,
              historicalAvgFetched: baseline,
              recorder,
            });
            await recorder.flush();
            console.log(`[${source.toUpperCase()}] Source-presence:`, {
              outcome: presence.outcome,
              seenAgain: presence.seenAgain,
              missing: presence.missingThisRun,
              updates: presence.updatesIssued,
              skipped: presence.skippedReason,
              audit: recorder.stats(),
            });
          }
        }
      } catch (presenceErr) {
        console.error(`[${source.toUpperCase()}] Source-presence check failed (non-fatal):`, presenceErr);
      }
    }

    // Batch-insert rejected jobs for accuracy analysis
    if (rejectedJobs.length > 0) {
      try {
        await prisma.rejectedJob.createMany({
          data: rejectedJobs,
          skipDuplicates: true,
        });
        console.log(`[${source.toUpperCase()}] Logged ${rejectedJobs.length} rejected jobs for analysis`);
      } catch (rejErr) {
        console.error(`[${source.toUpperCase()}] Failed to log rejected jobs:`, rejErr);
      }
    }

    return { source, fetched, added, duplicates, errors, duration, newJobUrls, newJobIds, rejectedByReason };

  } catch (error) {
    console.error(`[${source.toUpperCase()}] Fatal error during ingestion:`, error);
    const duration = Date.now() - startTime;
    return { source, fetched, added, duplicates, errors: fetched, duration, newJobUrls: [], newJobIds: [], rejectedByReason: {} };
  }
}

/**
 * Aggregate rejected_jobs entries by `rejectionReason` for the IngestionResult.
 * Cheap O(n) over the in-memory buffer; called once at end of each source run.
 */
function countRejectionsByReason(
  rejectedJobs: Array<{ rejectionReason: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rejectedJobs) {
    counts[r.rejectionReason] = (counts[r.rejectionReason] ?? 0) + 1;
  }
  return counts;
}

/**
 * Compute a Prisma update delta of fields the fresh source data would
 * IMPROVE on the existing row. Renewal-time enrichment lets repeat
 * ingests fill in fields that were missing the first time around (e.g.
 * Adzuna ingests with no salary, then a Greenhouse ingest of the same
 * job comes in with a salary range — the existing row should pick that
 * up rather than waiting for the LLM enrichment cron).
 *
 * Conservative — never replaces a non-null with another non-null value
 * except for description (where longer wins) and benefits (set union).
 * Lifecycle fields (originalPostedAt, expiresAt) and identity/audit
 * fields (title, employer, applyLink, externalId, isPublished, counters)
 * are deliberately out of scope.
 */
export function buildRenewalEnrichmentDelta(
  existing: {
    description: string | null;
    descriptionSummary: string | null;
    minSalary: number | null;
    maxSalary: number | null;
    salaryPeriod: string | null;
    salaryRange: string | null;
    displaySalary: string | null;
    normalizedMinSalary: number | null;
    normalizedMaxSalary: number | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    jobType: string | null;
    mode: string | null;
    experienceLevel: string | null;
    setting: string | null;
    population: string | null;
    benefits: string[];
  },
  fresh: Record<string, unknown>,
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};

  const freshDesc = typeof fresh.description === 'string' ? fresh.description : null;
  if (freshDesc && (!existing.description || freshDesc.length > existing.description.length + 50)) {
    delta.description = freshDesc;
    if (typeof fresh.descriptionSummary === 'string') delta.descriptionSummary = fresh.descriptionSummary;
  }

  const fillIfNull = (key: keyof typeof existing, freshKey: string = key as string) => {
    if (existing[key] == null && fresh[freshKey] != null && fresh[freshKey] !== '') {
      delta[key] = fresh[freshKey];
    }
  };
  fillIfNull('minSalary');
  fillIfNull('maxSalary');
  fillIfNull('salaryPeriod');
  fillIfNull('salaryRange');
  fillIfNull('displaySalary');
  fillIfNull('normalizedMinSalary');
  fillIfNull('normalizedMaxSalary');
  fillIfNull('city');
  fillIfNull('state');
  fillIfNull('stateCode');
  fillIfNull('jobType');
  fillIfNull('mode');
  fillIfNull('experienceLevel');
  fillIfNull('setting');
  fillIfNull('population');

  // Benefits: set-union when fresh has new entries
  if (Array.isArray(fresh.benefits) && fresh.benefits.length > 0) {
    const existingSet = new Set(existing.benefits ?? []);
    const additions = (fresh.benefits as unknown[]).filter(
      (b) => typeof b === 'string' && !existingSet.has(b),
    ) as string[];
    if (additions.length > 0) {
      delta.benefits = [...existingSet, ...additions];
    }
  }

  return delta;
}

/**
 * Main ingestion function - processes multiple sources
 */
export async function ingestJobs(
  sources: JobSource[] = ALL_SOURCES,
  options?: { chunk?: number; fantasticEndpoint?: '7d' | '6m' }
): Promise<IngestionResult[]> {
  const overallStartTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log('\n' + '='.repeat(80));
  console.log(`JOB INGESTION STARTED: ${timestamp}`);
  console.log(`Sources: ${sources.join(', ')}`);
  console.log('='.repeat(80) + '\n');

  // ── Pre-load ALL externalIds + applyLinks + identity keys (eliminates per-job DB roundtrips) ──
  try {
    console.log('[Dedup] Pre-loading global externalId + applyLink + title-key maps...');
    const allJobs = await prisma.job.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        externalId: true,
        sourceProvider: true,
        originalPostedAt: true,
        applyLink: true,
        title: true,
        employer: true,
        location: true,
      },
    });
    globalExternalIdMap = new Map();
    globalApplyLinkMap = new Map();
    globalTitleKeyMap = new Map();
    for (const job of allJobs) {
      if (job.externalId) {
        globalExternalIdMap.set(job.externalId, {
          id: job.id,
          sourceProvider: job.sourceProvider || '',
          originalPostedAt: job.originalPostedAt,
        });
      }
      if (job.applyLink) {
        const pathKey = buildApplyUrlPathKey(job.applyLink);
        if (pathKey) globalApplyLinkMap.set(pathKey, job.id);
      }
      // Identity key only set if all three fields are present — missing
      // fields would produce ambiguous keys ("|employer|") that collide.
      if (job.title && job.employer && job.location) {
        const key = buildJobIdentityKey(job.title, job.employer, job.location);
        // First-write wins so we point new dupes at the original job we'll
        // renew. (Map.set replaces, so guard explicitly.)
        if (!globalTitleKeyMap.has(key)) globalTitleKeyMap.set(key, job.id);
      }
    }
    console.log(
      `[Dedup] Loaded ${globalExternalIdMap.size} externalIds, ` +
      `${globalApplyLinkMap.size} applyLinks, ${globalTitleKeyMap.size} identityKeys`,
    );
  } catch (e) {
    console.error('[Dedup] Failed to pre-load global maps, falling back to per-source:', e);
    globalExternalIdMap = null;
    globalApplyLinkMap = null;
    globalTitleKeyMap = null;
  }

  const results: IngestionResult[] = [];

  // Process each source sequentially
  for (const source of sources) {
    const useChunk = source === 'workday' || source === 'greenhouse';
    const isFantastic = source === 'fantastic-jobs-db';
    let sourceOptions: typeof options = undefined;
    if (useChunk) sourceOptions = { chunk: options?.chunk };
    if (isFantastic && options?.fantasticEndpoint) {
      sourceOptions = { ...(sourceOptions ?? {}), fantasticEndpoint: options.fantasticEndpoint };
    }
    const result = await ingestFromSource(source, sourceOptions);
    results.push(result);
  }

  // Clean up global maps after ingestion
  globalExternalIdMap = null;
  globalApplyLinkMap = null;
  globalTitleKeyMap = null;

  // Calculate totals
  const totals = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      added: acc.added + r.added,
      duplicates: acc.duplicates + r.duplicates,
      errors: acc.errors + r.errors,
    }),
    { fetched: 0, added: 0, duplicates: 0, errors: 0 }
  );

  const overallDuration = Date.now() - overallStartTime;
  const overallDuplicateRate = totals.fetched > 0
    ? ((totals.duplicates / totals.fetched) * 100).toFixed(1)
    : '0.0';

  // Final summary — use ingestion monitor for rich formatting
  const { generateIngestionSummary } = await import('./ingestion-monitor');
  console.log('\n' + generateIngestionSummary(results));
  console.log('='.repeat(80) + '\n');

  // Send Discord notification
  try {
    const { sendIngestionSummary } = await import('./discord-notifier');
    await sendIngestionSummary(results);
  } catch (discordError) {
    console.error('[Discord] Failed to send ingestion summary:', discordError);
  }

  // Post-ingestion description cleanup REMOVED 2026-05-06.
  // Both insertion paths now produce clean descriptions at write-time:
  //   - Aggregated ingests: lib/job-normalizer.ts:813 calls cleanDescription()
  //     before building the create payload.
  //   - Employer-posted: /api/jobs/post-free + /api/jobs/update both call
  //     summarizeForMeta() at submit-time.
  // The end-of-cron `cleanAllJobDescriptions()` whole-table scan was
  // therefore a no-op on every run (filters by `description contains '<'`
  // → nothing matched). Quality-score recompute that depended on this
  // step is also gone — Step 7 already writes the final score at insert.
  // If legacy dirty rows ever surface, run cleanAllJobDescriptions
  // manually as a one-off; the function is still exported.

  // Auto-collect employer emails into leads
  try {
    const emailResult = await collectEmployerEmails();
    console.log(`[Employer Emails] Auto-collected: ${emailResult.created} new, ${emailResult.updated} updated`);
  } catch (emailError) {
    console.error('[Employer Emails] Failed to collect:', emailError);
  }

  // Ping search engines for all newly added jobs
  const allNewUrls = results.flatMap(r => r.newJobUrls);
  if (allNewUrls.length > 0) {
    console.log(`\n[Indexing] Submitting ${allNewUrls.length} new job URLs to search engines...`);
    try {
      const indexResults = await pingAllSearchEnginesBatch(allNewUrls);
      const googleOk = indexResults.google.filter(r => r.success).length;
      const bingOk = indexResults.bing.filter(r => r.success).length;
      const indexNowOk = indexResults.indexNow.filter(r => r.success).length;
      console.log(`[Indexing] Results: Google ${googleOk}/${indexResults.google.length}, Bing ${bingOk}/${allNewUrls.length}, IndexNow ${indexNowOk}/${allNewUrls.length}`);
    } catch (indexError) {
      console.error('[Indexing] Failed to ping search engines:', indexError);
    }
  }

  return results;
}

/**
 * Clean up expired jobs by marking them as unpublished
 */
export async function cleanupExpiredJobs(): Promise<number> {
  try {
    const now = new Date();
    // Hard lifetime cap = 60 days from originalPostedAt. Matches the
    // initial expiresAt we now write at insert time (originalPostedAt + 60d)
    // and the renewal cap. Belt-and-suspenders against any drift.
    const maxAgeDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // First, find the jobs we're about to expire so we can build URLs for de-indexing
    const jobsToExpire = await prisma.job.findMany({
      where: {
        isPublished: true,
        OR: [
          { expiresAt: { lt: now } },
          {
            originalPostedAt: { lt: maxAgeDate },
            sourceProvider: { not: null },
          },
        ],
      },
      select: { id: true, title: true },
    });

    if (jobsToExpire.length === 0) {
      console.log('[Cleanup] No expired jobs found');
      return 0;
    }

    // Single sweep — same OR clause used in the SELECT above. Previously
    // this was two updateMany calls with overlapping conditions, so any
    // job matching BOTH (past expiresAt AND past 60-day cap) was touched
    // twice. Collapsed 2026-05-06.
    //
    // NOTE: ATS dead-link checking REMOVED 2026-03-11 — now handled by
    // /api/cron/check-dead-links (3×/day, 1500 links/run).
    const updateResult = await prisma.job.updateMany({
      where: {
        isPublished: true,
        OR: [
          { expiresAt: { lt: now } },
          { originalPostedAt: { lt: maxAgeDate }, sourceProvider: { not: null } },
        ],
      },
      data: { isPublished: false },
    });

    const total = updateResult.count;
    console.log(`[Cleanup] Unpublished ${total} expired/aged-out jobs (single sweep)`);

    // Notify search engines to de-index expired job URLs
    // Uses dedicated deletion quota (100/day Google, unlimited IndexNow)
    const allExpiredJobs = [...jobsToExpire];
    if (allExpiredJobs.length > 0) {
      try {
        const { slugify } = await import('./utils');
        const { pingAllSearchEnginesBatchDeleted } = await import('./search-indexing');
        const expiredUrls = allExpiredJobs.map(job => {
          const slug = slugify(job.title, job.id);
          return `https://pmhnphiring.com/jobs/${slug}`;
        });

        console.log(`[Cleanup] De-indexing ${expiredUrls.length} expired jobs via dedicated deletion quota...`);

        const results = await pingAllSearchEnginesBatchDeleted(expiredUrls);
        const googleOk = results.google.filter(r => r.success).length;
        const indexNowOk = results.indexNow.filter(r => r.success).length;

        console.log(`[Cleanup] De-index results: Google ${googleOk}/${results.google.length}, IndexNow ${indexNowOk}/${expiredUrls.length}`);
      } catch (indexError) {
        console.error('[Cleanup] Failed to notify search engines about expired jobs:', indexError);
      }
    }

    return total;
  } catch (error) {
    console.error('[Cleanup] Error cleaning up expired jobs:', error);
    return 0;
  }
}

/**
 * Get ingestion statistics
 */
export async function getIngestionStats(): Promise<{
  totalActive: number;
  bySource: Record<string, number>;
  addedLast24h: number;
}> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Get total active jobs
    const totalActive = await prisma.job.count({
      where: {
        isPublished: true,
      },
    });

    // Get jobs by source
    const jobsBySource = await prisma.job.groupBy({
      by: ['sourceProvider'],
      where: {
        isPublished: true,
      },
      _count: true,
    });

    const bySource: Record<string, number> = {};
    jobsBySource.forEach((item: { sourceProvider: string | null; _count: number }) => {
      if (item.sourceProvider) {
        bySource[item.sourceProvider] = item._count;
      }
    });

    // Get jobs added in last 24 hours
    const addedLast24h = await prisma.job.count({
      where: {
        createdAt: {
          gte: yesterday,
        },
        isPublished: true,
      },
    });

    return {
      totalActive,
      bySource,
      addedLast24h,
    };
  } catch (error) {
    console.error('[Stats] Error getting ingestion stats:', error);
    return {
      totalActive: 0,
      bySource: {},
      addedLast24h: 0,
    };
  }
}
