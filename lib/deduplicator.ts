import { prisma } from '@/lib/prisma';

interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number;
  matchType: 'exact_id' | 'exact_title' | 'fuzzy_title' | 'apply_url' | 'none';
  matchedJobId?: string;
}

/**
 * Normalize job title for comparison
 */
function normalizeTitle(title: string): string {
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
function normalizeCompany(company: string): string {
  if (!company) return '';
  
  let normalized = company.toLowerCase();
  
  // Remove special characters
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
  
  // Remove business suffixes
  const suffixes = [
    'inc', 'llc', 'corp', 'corporation', 'company', 'co', 'ltd',
    'health', 'healthcare', 'medical', 'group', 'services'
  ];
  
  const words = normalized.split(/\s+/).filter((word: string) => 
    word.length > 0 && !suffixes.includes(word)
  );
  
  return words.join(' ').trim();
}

/**
 * Normalize location for comparison
 */
function normalizeLocation(location: string): string {
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
export async function checkDuplicate(job: {
  title: string;
  employer: string;
  location: string;
  externalId?: string;
  sourceProvider?: string;
  applyLink?: string;
}): Promise<DuplicateCheckResult> {
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
    const normalizedTitle = normalizeTitle(job.title);
    const normalizedEmployer = normalizeCompany(job.employer);
    const normalizedLocation = normalizeLocation(job.location);
    
    // Query jobs with similar title (first 30 chars for performance)
    const titlePrefix = job.title.substring(0, 30);
    const potentialMatches = await prisma.job.findMany({
      where: {
        title: {
          contains: titlePrefix,
        },
      },
      select: {
        id: true,
        title: true,
        employer: true,
        location: true,
        applyLink: true,
      },
      take: 50, // Limit for performance
    });

    // Check for exact normalized matches
    for (const match of potentialMatches) {
      const matchNormalizedTitle = normalizeTitle(match.title);
      const matchNormalizedEmployer = normalizeCompany(match.employer);
      const matchNormalizedLocation = normalizeLocation(match.location);
      
      if (
        matchNormalizedTitle === normalizedTitle &&
        matchNormalizedEmployer === normalizedEmployer &&
        matchNormalizedLocation === normalizedLocation
      ) {
        return {
          isDuplicate: true,
          confidence: 0.95,
          matchType: 'exact_title',
          matchedJobId: match.id,
        };
      }
    }

    // STRATEGY 3: Apply URL Match (confidence: 0.90)
    if (job.applyLink) {
      const normalizedUrl = normalizeApplyUrl(job.applyLink);
      
      for (const match of potentialMatches) {
        if (match.applyLink) {
          const matchNormalizedUrl = normalizeApplyUrl(match.applyLink);
          if (normalizedUrl === matchNormalizedUrl) {
            return {
              isDuplicate: true,
              confidence: 0.90,
              matchType: 'apply_url',
              matchedJobId: match.id,
            };
          }
        }
      }
    }

    // STRATEGY 4: Fuzzy Title Match (confidence: based on similarity)
    const employerPrefix = job.employer.substring(0, 10);
    const fuzzyMatches = await prisma.job.findMany({
      where: {
        employer: {
          contains: employerPrefix,
        },
      },
      select: {
        id: true,
        title: true,
        employer: true,
      },
      take: 20, // Limit for performance
    });

    for (const match of fuzzyMatches) {
      const titleSimilarity = calculateSimilarity(normalizedTitle, normalizeTitle(match.title));
      const employerSimilarity = calculateSimilarity(normalizedEmployer, normalizeCompany(match.employer));
      
      if (titleSimilarity > 0.85 && employerSimilarity > 0.80) {
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
