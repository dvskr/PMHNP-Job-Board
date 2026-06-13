import { prisma } from '@/lib/prisma';

interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number;
  matchType: 'exact_id' | 'exact_title' | 'fuzzy_title' | 'apply_url' | 'none';
  matchedJobId?: string;
}

/**
 * Optional pre-loaded maps so `checkDuplicate` can do exact-title and
 * apply-URL matching at memory speed instead of issuing per-job DB
 * queries that miss results past `take(50)` on dense title prefixes.
 *
 * The orchestrator builds these once at run start; if absent (legacy
 * callers, tests), we fall back to the original DB-based path.
 */
export interface DuplicateCheckOptions {
  /** key = `${normalizeTitle}|${normalizeCompany}|${normalizeLocation}` → jobId */
  globalTitleKeyMap?: Map<string, string>;
  /** key = `URL.pathname.slice(0, 60)` → jobId */
  globalApplyLinkMap?: Map<string, string>;
}

/**
 * Build the composite identity key the orchestrator uses to populate
 * `globalTitleKeyMap`. Exported so the producer (ingestion-service)
 * and consumer (this module) stay in lock-step on normalization rules.
 */
export function buildJobIdentityKey(title: string, employer: string, location: string): string {
  return `${normalizeTitle(title)}|${normalizeCompany(employer)}|${normalizeLocation(location)}`;
}

/**
 * Apply-URL key used by both the orchestrator's globalApplyLinkMap and the
 * Strategy-3 duplicate check, so they stay in lock-step.
 *
 * Includes the HOSTNAME and a longer path window. The old `pathname.slice(0,60)`
 * dropped the host and truncated before the unique req-id segment, so two
 * different employers on the same ATS (e.g. acme.myworkdayjobs.com vs
 * globex.myworkdayjobs.com, whose paths share a long
 * `/en-US/External/job/Remote/Psychiatric-Nurse-Practitioner…` prefix) produced
 * the SAME key and the second employer's job was wrongly rejected as a dup.
 */
export function buildApplyUrlPathKey(applyLink: string): string | null {
  if (!applyLink) return null;
  try {
    const u = new URL(applyLink);
    return `${u.hostname}${u.pathname}`.slice(0, 200);
  } catch {
    return null;
  }
}

/**
 * Normalize job title for comparison
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';

  let normalized = title.toLowerCase();

  // Remove special characters (keep alphanumeric and spaces)
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');

  // Remove common words
  const commonWords = ['the', 'a', 'an', 'at', 'in', 'for', 'to', 'and', 'or'];
  const words = normalized.split(/\s+/).filter((word: string) =>
    word.length > 0 && !commonWords.includes(word)
  );

  // Normalize whitespace and trim
  return words.join(' ').trim();
}

/**
 * Normalize company name for comparison
 */
export function normalizeCompany(company: string): string {
  if (!company) return '';

  let normalized = company.toLowerCase();

  // Remove special characters
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');

  // Remove business suffixes
  // NOTE: Only strip corporate entity suffixes. Do NOT strip healthcare-specific
  // words like 'health', 'healthcare', 'medical', 'group', 'services' — these are
  // identity-critical for healthcare companies (e.g. "Spring Health" ≠ "Spring").
  const suffixes = [
    'inc', 'llc', 'corp', 'corporation', 'company', 'co', 'ltd',
  ];

  const words = normalized.split(/\s+/).filter((word: string) =>
    word.length > 0 && !suffixes.includes(word)
  );

  return words.join(' ').trim();
}

/**
 * Normalize location for comparison
 */
export function normalizeLocation(location: string): string {
  if (!location) return '';

  // Keep alphanumeric, spaces, commas
  return location.toLowerCase()
    .replace(/[^a-z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize apply URL by removing tracking parameters
 */
function normalizeApplyUrl(url: string): string {
  if (!url) return '';

  try {
    const urlObj = new URL(url);

    // Remove tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
    trackingParams.forEach((param: string) => urlObj.searchParams.delete(param));

    // Canonicalize remaining param order so `?a=1&b=2` and `?b=2&a=1` collide.
    urlObj.searchParams.sort();

    // Return normalized URL: hostname + pathname + remaining params
    return urlObj.hostname + urlObj.pathname + urlObj.search;
  } catch {
    // If URL parsing fails, return cleaned string
    return url.toLowerCase().replace(/[?&](utm_source|utm_medium|utm_campaign|ref|source)=[^&]*/g, '');
  }
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;

  // Create matrix
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  // Fill matrix with edit distances
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity between two strings (0 to 1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);

  if (maxLength === 0) return 1.0;

  return 1 - (distance / maxLength);
}

/**
 * Check if a job is a duplicate using multiple strategies
 */
export async function checkDuplicate(
  job: {
    title: string;
    employer: string;
    location: string;
    externalId?: string;
    sourceProvider?: string;
    applyLink?: string;
  },
  options: DuplicateCheckOptions = {},
): Promise<DuplicateCheckResult> {
  try {
    // STRATEGY 1: Exact External ID Match (confidence: 1.0)
    if (job.externalId && job.sourceProvider) {
      const exactIdMatch = await prisma.job.findFirst({
        where: {
          externalId: job.externalId,
          sourceProvider: job.sourceProvider,
        },
        select: { id: true },
      });

      if (exactIdMatch) {
        return {
          isDuplicate: true,
          confidence: 1.0,
          matchType: 'exact_id',
          matchedJobId: exactIdMatch.id,
        };
      }
    }

    // STRATEGY 2: Exact Title + Employer + Location (confidence: 0.95)
    //
    // Pre-2026-05-05 this used `title.contains(prefix30)` + `take: 50`,
    // which silently dropped real duplicates whenever ≥ 50 jobs shared the
    // first 30 chars of a title (LifeStance "Psychiatric Nurse Practitioner..."
    // had 27+ collisions of one identity collapsed nowhere). Now we check
    // a pre-loaded global identity map first; the DB fallback is only for
    // legacy callers that don't pass options.
    const normalizedTitle = normalizeTitle(job.title);
    const normalizedEmployer = normalizeCompany(job.employer);
    const normalizedLocation = normalizeLocation(job.location);

    if (options.globalTitleKeyMap) {
      const key = buildJobIdentityKey(job.title, job.employer, job.location);
      const matchedId = options.globalTitleKeyMap.get(key);
      if (matchedId) {
        return {
          isDuplicate: true,
          confidence: 0.95,
          matchType: 'exact_title',
          matchedJobId: matchedId,
        };
      }
    } else {
      // Legacy DB path — kept for tests / scripts that don't pre-load maps.
      const titlePrefix = job.title.substring(0, 30);
      const potentialMatches = await prisma.job.findMany({
        where: { title: { contains: titlePrefix } },
        select: { id: true, title: true, employer: true, location: true, applyLink: true },
        take: 50,
      });
      for (const match of potentialMatches) {
        if (
          normalizeTitle(match.title) === normalizedTitle &&
          normalizeCompany(match.employer) === normalizedEmployer &&
          normalizeLocation(match.location) === normalizedLocation
        ) {
          return {
            isDuplicate: true,
            confidence: 0.95,
            matchType: 'exact_title',
            matchedJobId: match.id,
          };
        }
      }
    }

    // STRATEGY 3: Apply URL match — GLOBAL cross-source check (confidence: 0.90)
    // Catches the same job posted across different sources (e.g. fantastic
    // scraping a lever board that we also ingest natively).
    if (job.applyLink) {
      const pathKey = buildApplyUrlPathKey(job.applyLink);
      if (pathKey && options.globalApplyLinkMap?.has(pathKey)) {
        return {
          isDuplicate: true,
          confidence: 0.90,
          matchType: 'apply_url',
          matchedJobId: options.globalApplyLinkMap.get(pathKey)!,
        };
      }

      // Legacy DB fallback when no map is provided.
      if (!options.globalApplyLinkMap && pathKey) {
        const normalizedUrl = normalizeApplyUrl(job.applyLink);
        const globalUrlMatch = await prisma.job.findFirst({
          where: { applyLink: { contains: pathKey } },
          select: { id: true, applyLink: true },
        });
        if (globalUrlMatch?.applyLink && normalizeApplyUrl(globalUrlMatch.applyLink) === normalizedUrl) {
          return {
            isDuplicate: true,
            confidence: 0.90,
            matchType: 'apply_url',
            matchedJobId: globalUrlMatch.id,
          };
        }
      }
    }

    // STRATEGY 4: Fuzzy Title + Employer + Location Match (confidence: based on similarity)
    // Narrowed query: uses BOTH employer prefix AND title prefix for fewer false candidates
    // FIX 2026-03-11: Added location check — without it, multi-location employers
    // (LifeStance 500+ offices, BlueSky 50 states, Blackbird 20+ states) all collapse
    // into one job, causing ~400 false duplicates per Fantastic-Jobs-DB run.
    const employerPrefix = job.employer.substring(0, 10);
    const titlePrefix5 = job.title.substring(0, 15);
    const fuzzyMatches = await prisma.job.findMany({
      where: {
        AND: [
          { employer: { contains: employerPrefix } },
          { title: { contains: titlePrefix5 } },
        ],
      },
      select: {
        id: true,
        title: true,
        employer: true,
        location: true,
      },
      take: 20,
    });

    for (const match of fuzzyMatches) {
      const titleSimilarity = calculateSimilarity(normalizedTitle, normalizeTitle(match.title));
      const employerSimilarity = calculateSimilarity(normalizedEmployer, normalizeCompany(match.employer));

      if (titleSimilarity > 0.85 && employerSimilarity > 0.80) {
        // Location gate: prevent collapsing different locations into one job.
        // "Remote" vs "Remote" is always a match (same job, same company, same title).
        // Otherwise require location similarity > 0.50 to account for minor formatting
        // differences ("New York, NY" vs "New York, New York") while blocking
        // clearly different cities ("Wilmington, Delaware" vs "Saint Louis, MO").
        const matchNormalizedTitle = normalizeTitle(match.title);
        const matchNormLocation = normalizeLocation(match.location);
        const locationSimilarity = calculateSimilarity(normalizedLocation, matchNormLocation);
        const bothRemote = normalizedLocation.includes('remote') && matchNormLocation.includes('remote');

        if (!bothRemote && locationSimilarity <= 0.50) {
          // Same company + title but different location = different position, skip
          continue;
        }

        // Both-remote guard (added 2026-05-05 after prod audit). When both
        // postings are "Remote", the location field can no longer disambiguate
        // — but state-licensed remote roles often encode the state in the
        // title itself: "PMHNP (Ohio)" vs "PMHNP (Wisconsin)". Levenshtein
        // similarity > 0.85 happily collapsed those. Require *exact* normalized
        // title equality before treating two remote postings as the same job.
        if (bothRemote && normalizedTitle !== matchNormalizedTitle) {
          continue;
        }

        const confidence = Math.min(titleSimilarity, employerSimilarity);
        return {
          isDuplicate: true,
          confidence,
          matchType: 'fuzzy_title',
          matchedJobId: match.id,
        };
      }
    }

    // DEFAULT: Not a duplicate
    return {
      isDuplicate: false,
      confidence: 0,
      matchType: 'none',
    };

  } catch (error) {
    console.error('Error in duplicate check:', error);
    // On error, assume not duplicate to avoid blocking job ingestion
    return {
      isDuplicate: false,
      confidence: 0,
      matchType: 'none',
    };
  }
}

/**
 * Check duplicates for a batch of jobs (for future optimization)
 */
export async function checkDuplicateBatch(
  jobs: Array<{
    title: string;
    employer: string;
    location: string;
    externalId?: string;
    sourceProvider?: string;
    applyLink?: string;
  }>
): Promise<Map<number, DuplicateCheckResult>> {
  const results = new Map<number, DuplicateCheckResult>();
  const batchSize = 10;

  // Process in batches of 10
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((job: { title: string; employer: string; location: string; externalId?: string; sourceProvider?: string; applyLink?: string }, batchIndex: number) =>
        checkDuplicate(job).then((result: DuplicateCheckResult) => ({ index: i + batchIndex, result }))
      )
    );

    batchResults.forEach(({ index, result }: { index: number; result: DuplicateCheckResult }) => {
      results.set(index, result);
    });
  }

  return results;
}

/**
 * Legacy function for backward compatibility
 * Returns simple boolean for existing code
 */
export async function isDuplicate(job: {
  title: string;
  employer: string;
  location: string;
  externalId?: string;
  sourceProvider?: string;
  applyLink?: string;
}): Promise<boolean> {
  const result = await checkDuplicate(job);
  return result.isDuplicate;
}
