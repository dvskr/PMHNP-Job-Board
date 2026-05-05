import { prisma } from './prisma';
import { GREENHOUSE_TOTAL_CHUNKS } from './aggregators/greenhouse';
import { getLastRunDiagnostics as getFantasticJobsDiag } from './aggregators/fantastic-jobs-db';
import { normalizeJob } from './job-normalizer';
import { checkDuplicate } from './deduplicator';
import { parseJobLocation } from './location-parser';
import { linkJobToCompany } from './company-normalizer';
import { recordIngestionStats } from './source-analytics';
import { classifyRelevance } from './utils/job-filter';
import { collectEmployerEmails } from './employer-email-collector';
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
let globalApplyLinkMap: Map<string, string> | null = null; // normalizedUrl -> jobId
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
      return { source, fetched, added, duplicates, errors, duration: Date.now() - startTime, newJobUrls, newJobIds };
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

    const MAX_JOB_AGE_MS = 120 * 24 * 60 * 60 * 1000; // 120-day lifetime cap — hard cutoff for any job regardless of renewals
    const RENEWAL_EXTENSION_MS = 14 * 24 * 60 * 60 * 1000; // 14-day renewal window — tighter expiry, cron runs 2x daily so 14 days is plenty of buffer
    let expiredByAge = 0;

    // Helper to renew a job (Auto-Renewal) — with max-age cap + manual unpublish guard
    const renewJob = async (id: string, title: string, existingPostedAt?: Date | null) => {
      try {
        // Check if manually unpublished — never override admin decisions
        const job = await prisma.job.findUnique({
          where: { id },
          select: { isManuallyUnpublished: true },
        });
        if (job?.isManuallyUnpublished) {
          return; // Skip — admin intentionally hid this job
        }

        // Enforce max-age cap: if originalPostedAt > 120 days ago, unpublish instead
        if (existingPostedAt) {
          const ageMs = Date.now() - new Date(existingPostedAt).getTime();
          if (ageMs > MAX_JOB_AGE_MS) {
            await prisma.job.update({
              where: { id },
              data: { isPublished: false },
            });
            // Track age-expired for analysis
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

        await prisma.job.update({
          where: { id },
          data: {
            expiresAt: new Date(Date.now() + RENEWAL_EXTENSION_MS),
            isPublished: true,
            updatedAt: new Date(),
            // NOTE: Never overwrite originalPostedAt — first ingestion date is truth
          }
        });
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

        // Normalize the job (field extraction, salary parsing, location parsing, etc.)
        const normalizedJob = normalizeJob(rawJob, source);

        if (!normalizedJob) {
          // Track normalizer rejections for accuracy analysis
          rejectedJobs.push({
            title: rawTitle || 'Unknown',
            employer: String(rawJob.employer || rawJob.company || rawJob.employer_name || rawJob.organizationName || null),
            location: String(rawJob.location || rawJob.locationsText || rawJob.job_city || null),
            applyLink: String(rawJob.applyLink || rawJob.apply_link || rawJob.url || rawJob.link || null),
            externalId: String(rawJob.externalId || rawJob.id || rawJob.job_id || null),
            sourceProvider: source,
            rejectionReason: 'normalizer',
            rawData: rawJob as object,
          });
          continue;
        }

        // Strategy 1: Fast in-memory lookup for exact externalId match
        if (normalizedJob.externalId && existingJobsMap.has(normalizedJob.externalId)) {
          // AUTO-RENEWAL: Job exists, so we extend its life instead of ignoring it
          const existing = existingJobsMap.get(normalizedJob.externalId)!;
          await renewJob(existing.id, normalizedJob.title, existing.originalPostedAt);

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
        const dupCheck = await checkDuplicate({
          title: normalizedJob.title,
          employer: normalizedJob.employer,
          location: normalizedJob.location,
          externalId: normalizedJob.externalId ?? undefined,
          sourceProvider: normalizedJob.sourceProvider ?? undefined,
          applyLink: normalizedJob.applyLink ?? undefined,
        });

        if (dupCheck.isDuplicate) {
          // AUTO-RENEWAL: Fuzzy match found, renew the matched job
          if (dupCheck.matchedJobId) {
            // Look up the existing job's originalPostedAt for age-cap enforcement
            const matchedJob = await prisma.job.findUnique({
              where: { id: dupCheck.matchedJobId },
              select: { originalPostedAt: true },
            });
            await renewJob(dupCheck.matchedJobId, normalizedJob.title, matchedJob?.originalPostedAt);
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

        // Set initial expiresAt based on original posting date + 60 days
        // If source didn't provide a posted date, use now + 60 days
        const INITIAL_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000; // 60-day initial posting window
        const baseDate = normalizedJob.originalPostedAt
          ? new Date(normalizedJob.originalPostedAt as any).getTime()
          : Date.now();
        const initialExpiresAt = new Date(baseDate + INITIAL_EXPIRY_MS);

        // Insert the job
        const savedJob = await prisma.job.create({
          data: {
            ...(normalizedJob as any),
            expiresAt: initialExpiresAt,
          },
        });
        added++;
        newJobIds.push(savedJob.id);

        // Generate and update slug
        const slug = `${normalizedJob.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()}-${savedJob.id}`;

        await prisma.job.update({
          where: { id: savedJob.id },
          data: { slug },
        });

        // Collect URL for batch indexing
        newJobUrls.push(`https://pmhnphiring.com/jobs/${slug}`);

        // Parse location
        try {
          await parseJobLocation(savedJob.id);
        } catch (locationError) {
          console.error(`Failed to parse location for job ${savedJob.id}:`, locationError);
        }

        // Link to company
        try {
          await linkJobToCompany(savedJob.id);
        } catch (companyError) {
          console.error(`Failed to link company for job ${savedJob.id}:`, companyError);
        }

        // NOTE: Link validation (validateApplyLink) is skipped during ingestion
        // to avoid HTTP timeout overhead. It runs separately via check-dead-links cron.

        // Compute quality score based on final resolved link and job data
        try {
          const currentJob = await prisma.job.findUnique({
            where: { id: savedJob.id },
            select: { applyLink: true, displaySalary: true, normalizedMinSalary: true, normalizedMaxSalary: true, descriptionSummary: true, description: true, city: true, state: true },
          });
          if (currentJob) {
            const qScore = computeQualityScore({
              applyLink: currentJob.applyLink,
              displaySalary: currentJob.displaySalary,
              normalizedMinSalary: currentJob.normalizedMinSalary,
              normalizedMaxSalary: currentJob.normalizedMaxSalary,
              descriptionSummary: currentJob.descriptionSummary,
              description: currentJob.description,
              city: currentJob.city,
              state: currentJob.state,
              isEmployerPosted: false,  // aggregated jobs are never employer-posted
            });
            await prisma.job.update({ where: { id: savedJob.id }, data: { qualityScore: qScore } });
          }
        } catch (qError) {
          // Non-fatal — job remains with default score of 0
        }

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

    // Record stats
    try {
      await recordIngestionStats(source, fetched, added, duplicates);
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

    return { source, fetched, added, duplicates, errors, duration, newJobUrls, newJobIds };

  } catch (error) {
    console.error(`[${source.toUpperCase()}] Fatal error during ingestion:`, error);
    const duration = Date.now() - startTime;
    return { source, fetched, added, duplicates, errors: fetched, duration, newJobUrls: [], newJobIds: [] };
  }
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

  // ── Pre-load ALL externalIds + applyLinks globally (eliminates per-source queries) ──
  try {
    console.log('[Dedup] Pre-loading global externalId + applyLink maps...');
    const allJobs = await prisma.job.findMany({
      where: { isPublished: true },
      select: { id: true, externalId: true, sourceProvider: true, originalPostedAt: true, applyLink: true },
    });
    globalExternalIdMap = new Map();
    globalApplyLinkMap = new Map();
    for (const job of allJobs) {
      if (job.externalId) {
        globalExternalIdMap.set(job.externalId, {
          id: job.id,
          sourceProvider: job.sourceProvider || '',
          originalPostedAt: job.originalPostedAt,
        });
      }
      if (job.applyLink) {
        try {
          const pathname = new URL(job.applyLink).pathname.slice(0, 60);
          globalApplyLinkMap.set(pathname, job.id);
        } catch { /* malformed URL */ }
      }
    }
    console.log(`[Dedup] Loaded ${globalExternalIdMap.size} externalIds, ${globalApplyLinkMap.size} applyLinks`);
  } catch (e) {
    console.error('[Dedup] Failed to pre-load global maps, falling back to per-source:', e);
    globalExternalIdMap = null;
    globalApplyLinkMap = null;
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

  // Run post-ingestion cleanup if any jobs were added
  if (totals.added > 0) {
    const { cleanAllJobDescriptions } = await import('./description-cleaner');
    await cleanAllJobDescriptions();

    // Recompute quality scores for newly added jobs after description cleaning
    // This ensures scores reflect cleaned descriptions (description quality points)
    const allNewJobIds = results.flatMap(r => r.newJobIds);
    if (allNewJobIds.length > 0) {
      console.log(`[Quality] Recomputing scores for ${allNewJobIds.length} newly added jobs...`);
      let recomputed = 0;
      for (const jobId of allNewJobIds) {
        try {
          const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { applyLink: true, displaySalary: true, normalizedMinSalary: true, normalizedMaxSalary: true, descriptionSummary: true, description: true, city: true, state: true },
          });
          if (job) {
            const qScore = computeQualityScore({
              applyLink: job.applyLink,
              displaySalary: job.displaySalary,
              normalizedMinSalary: job.normalizedMinSalary,
              normalizedMaxSalary: job.normalizedMaxSalary,
              descriptionSummary: job.descriptionSummary,
              description: job.description,
              city: job.city,
              state: job.state,
              isEmployerPosted: false,
            });
            await prisma.job.update({ where: { id: jobId }, data: { qualityScore: qScore } });
            recomputed++;
          }
        } catch (e) {
          // Non-fatal — keep existing score
        }
      }
      console.log(`[Quality] Recomputed ${recomputed}/${allNewJobIds.length} quality scores`);
    }
  }

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
    const maxAgeDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

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

    // Sweep 1: Unpublish jobs past their expiresAt date
    const expiredResult = await prisma.job.updateMany({
      where: {
        expiresAt: {
          lt: now,
        },
        isPublished: true,
      },
      data: {
        isPublished: false,
      },
    });

    // Sweep 2: Unpublish jobs older than 120 days (max lifetime cap)
    const agedOutResult = await prisma.job.updateMany({
      where: {
        originalPostedAt: {
          lt: maxAgeDate,
        },
        isPublished: true,
        // Only apply to aggregated jobs, not employer-posted
        sourceProvider: { not: null },
      },
      data: {
        isPublished: false,
      },
    });

    // NOTE: Sweep 3 (ATS dead link checking) REMOVED 2026-03-11 — now handled by
    // dedicated /api/cron/check-dead-links cron (3×/day, 1500 links/run, HEAD→GET fallback).
    // Running it here after every ingestion cron (~21×/day) was redundant and wasteful.

    const total = expiredResult.count + agedOutResult.count;
    console.log(`[Cleanup] Total: ${expiredResult.count} expired + ${agedOutResult.count} aged-out = ${total}`);

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
