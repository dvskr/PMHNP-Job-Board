import { Job } from '@/lib/types';
import { normalizeSalary } from './salary-normalizer';
import { parseLocation } from './location-parser';
import { formatDisplaySalary } from './salary-display';
import { cleanDescription } from './description-cleaner';

type NormalizedJob = Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'viewCount' | 'applyClickCount'> & {
  originalPostedAt?: Date | null;
};

/*
// Helper function to strip HTML tags (currently unused)
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
*/



export function extractSalary(text: string): { min: number | null; max: number | null; period: string | null } {
  // Helper to parse a dollar amount string like "120,000", "120k", "55.50"
  function parseDollar(s: string): number {
    const cleaned = s.replace(/,/g, '').trim();
    if (/k$/i.test(cleaned)) {
      return parseFloat(cleaned.replace(/k$/i, '')) * 1000;
    }
    return parseFloat(cleaned);
  }

  // Common separator pattern: -, –, —, to, through
  const sep = '(?:\\s*[-–—]\\s*|\\s+to\\s+|\\s+through\\s+)';
  // Dollar amount: $120,000 or $120k or $55.50
  const amt = '\\$([\\d,]+(?:\\.\\d{1,2})?(?:k)?)';

  // 1. HOURLY: "$50/hour", "$45 - $55 per hour", "$40/hr"
  const hourly = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*hour|per\\s*hr|\\/\\s*(?:hour|hr)|hourly)', 'gi');
  let match = hourly.exec(text);
  if (match) {
    return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'hour' };
  }

  // 2. DAILY: "$490 - $680 per day", "$500/day"
  const daily = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*day|\\/\\s*day|daily|per\\s*diem)', 'gi');
  match = daily.exec(text);
  if (match) {
    return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'day' };
  }

  // 3. WEEKLY: "$2,000/week", "$1,800 - $2,500 per week"
  const weekly = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*week|\\/\\s*(?:week|wk)|weekly)', 'gi');
  match = weekly.exec(text);
  if (match) {
    return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'week' };
  }

  // 4. BIWEEKLY: "$3,500 biweekly", "$3,000 - $4,000 biweekly"
  const biweekly = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:bi-?weekly|every\\s*(?:two|2)\\s*weeks)', 'gi');
  match = biweekly.exec(text);
  if (match) {
    return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'biweekly' };
  }

  // 5. MONTHLY: "$8,000/month", "$7,000 - $10,000 per month"
  const monthly = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*month|\\/\\s*(?:month|mo)|monthly)', 'gi');
  match = monthly.exec(text);
  if (match) {
    return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'month' };
  }

  // 6. ANNUAL (explicit): "$120,000/year", "$100k - $150k annually", "$120,000 per annum"
  const annual = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*year|\\/\\s*(?:year|yr)|annual(?:ly)?|yearly|per\\s*annum|p\\.?a\\.?)', 'gi');
  match = annual.exec(text);
  if (match) {
    return { min: parseDollar(match[1]), max: match[2] ? parseDollar(match[2]) : null, period: 'year' };
  }

  // 7. RANGE WITH SALARY CONTEXT (no explicit period): "Salary: $100,000 - $150,000"
  // "compensation: $120k-$140k", "pay range: $50 - $65", "earning potential $120,000+"
  const salaryContext = new RegExp(
    '(?:salary|compensation|pay|earning|income|wage|rate)\\s*(?:range|of|is|:)?\\s*(?:up\\s+to\\s+)?' +
    amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?',
    'gi'
  );
  match = salaryContext.exec(text);
  if (match) {
    const min = parseDollar(match[1]);
    const max = match[2] ? parseDollar(match[2]) : null;
    // Infer period from value magnitude
    const period = min > 500 ? 'year' : 'hour';
    return { min, max, period };
  }

  // 8. GENERIC RANGE (no period keyword): "$120,000 - $150,000" or "$120k-$150k"
  // Only match if values look like salaries (not funding, deductibles, etc.)
  const genericRange = new RegExp(amt + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?)', 'gi');
  match = genericRange.exec(text);
  if (match) {
    const min = parseDollar(match[1]);
    const max = parseDollar(match[2]);

    // Filter false positives: skip funding amounts, insurance, sign-on bonuses
    const context = text.substring(Math.max(0, (match.index || 0) - 50), (match.index || 0) + match[0].length + 50).toLowerCase();
    const isFalsePositive =
      context.includes('funding') || context.includes('raised') || context.includes('series') ||
      context.includes('deductible') || context.includes('malpractice') || context.includes('insurance') ||
      context.includes('sign-on') || context.includes('sign on') || context.includes('bonus') ||
      context.includes('revenue') || context.includes('investment');

    if (!isFalsePositive) {
      // Infer period from value magnitude
      if (min >= 15 && min <= 200 && max >= 15 && max <= 500) {
        return { min, max, period: 'hour' };
      } else if (min >= 200 && min <= 5000 && max >= 200 && max <= 10000) {
        // Could be daily or weekly
        if (min <= 1000) return { min, max, period: 'day' };
        return { min, max, period: 'week' };
      } else if (min >= 20000) {
        return { min, max, period: 'year' };
      }
    }
  }

  return { min: null, max: null, period: null };
}

export function detectJobType(text: string): string | null {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('per diem') || lowerText.includes('per-diem')) {
    return 'Per Diem';
  }
  if (lowerText.includes('contract') || lowerText.includes('contractor')) {
    return 'Contract';
  }
  if (lowerText.includes('part-time') || lowerText.includes('part time')) {
    return 'Part-Time';
  }
  if (lowerText.includes('full-time') || lowerText.includes('full time') || lowerText.includes('permanent')) {
    return 'Full-Time';
  }

  return null;
}

function detectMode(text: string): string | null {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('hybrid')) {
    return 'Hybrid';
  }
  if (lowerText.includes('remote') || lowerText.includes('telehealth') || lowerText.includes('telepsychiatry') || lowerText.includes('work from home')) {
    return 'Remote';
  }
  if (lowerText.includes('on-site') || lowerText.includes('onsite') || lowerText.includes('in-person') || lowerText.includes('in person')) {
    return 'In-Person';
  }

  return null;
}

/*
// Commented out functions below (currently unused)
/*
// Helper function to generate job description summary (currently unused)
function generateSummary(description: string, maxLength: number = 300): string {
  const cleanDescription = stripHtml(description);
  if (cleanDescription.length <= maxLength) {
    return cleanDescription;
  }
  
  // Try to cut at a sentence boundary
  const truncated = cleanDescription.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastPeriod > maxLength * 0.7) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}
*/

export function validateAndNormalizeSalary(
  minSalary: number | null,
  maxSalary: number | null,
  description: string,
  title: string,
  extractedPeriod?: string | null
): { minSalary: number | null; maxSalary: number | null; salaryPeriod: string | null } {
  let min = minSalary;
  let max = maxSalary;
  let period: string | null = null;

  // If no salary data, return nulls
  if (!min && !max) {
    return { minSalary: null, maxSalary: null, salaryPeriod: null };
  }

  // Map extractSalary period names to normalized names
  const periodMap: Record<string, string> = {
    'hour': 'hourly', 'hourly': 'hourly',
    'day': 'daily', 'daily': 'daily',
    'week': 'weekly', 'weekly': 'weekly',
    'biweekly': 'biweekly',
    'month': 'monthly', 'monthly': 'monthly',
    'year': 'annual', 'annual': 'annual',
  };

  // Use extracted period if available, otherwise detect from magnitude
  if (extractedPeriod && periodMap[extractedPeriod]) {
    period = periodMap[extractedPeriod];
  } else if ((min && min > 40000) || (max && max > 40000)) {
    period = 'annual';
  } else {
    const ref = min || max || 0;
    if (ref < 500) {
      period = 'hourly';    // $50-200/hr typical PMHNP
    } else if (ref < 2000) {
      period = 'weekly';    // $1,000-1,800/week typical
    } else if (ref <= 40000) {
      period = 'monthly';   // $7,000-15,000/month typical PMHNP
    } else {
      period = 'annual';
    }
  }

  // Step 2: Reject clearly fake values based on period
  const isInvalid = (salary: number | null, period: string): boolean => {
    if (!salary) return false;

    if (period === 'hourly') {
      return salary > 300 || salary < 20;
    } else if (period === 'annual') {
      return salary > 500000 || salary < 30000;
    }
    // For daily/weekly/biweekly/monthly, use reasonable ranges
    if (period === 'daily') {
      return salary > 2000 || salary < 100;
    }
    if (period === 'weekly') {
      return salary > 10000 || salary < 400;
    }
    if (period === 'biweekly') {
      return salary > 20000 || salary < 800;
    }
    if (period === 'monthly') {
      return salary > 40000 || salary < 2000;
    }

    return false;
  };

  if (isInvalid(min, period) && isInvalid(max, period)) {
    // Both invalid, reject all
    console.log(`Rejected suspicious salary: ${min}-${max} ${period}`);
    return { minSalary: null, maxSalary: null, salaryPeriod: null };
  }

  if (isInvalid(min, period)) {
    console.log(`Rejected suspicious salary: ${min} ${period}`);
    min = null;
  }

  if (isInvalid(max, period)) {
    console.log(`Rejected suspicious salary: ${max} ${period}`);
    max = null;
  }

  // Step 3: Swap if minSalary > maxSalary
  if (min && max && min > max) {
    console.log(`Swapping salary range for ${title}: ${min}-${max}`);
    [min, max] = [max, min];
  }

  return {
    minSalary: min ? Math.round(min) : null,
    maxSalary: max ? Math.round(max) : null,
    salaryPeriod: period,
  };
}

export function normalizeJob(rawJob: Record<string, unknown>, source: string): NormalizedJob | null {
  try {
    // Extract required fields based on source
    let title: string;
    let employer: string;
    let location: string;
    let description: string;
    let applyLink: string;
    let externalId: string;
    let salaryMin: number | null = null;
    let salaryMax: number | null = null;
    let originalPostedAt: Date | null = null;

    if (source === 'adzuna') {
      title = String(rawJob.title || '');
      employer = (rawJob.company as Record<string, unknown>)?.display_name as string ||
        String(rawJob.employer || 'Unknown Company');
      location = (rawJob.location as Record<string, unknown>)?.display_name as string ||
        String(rawJob.location || 'Unknown Location');
      description = String(rawJob.description || '');
      // Aggregator already normalizes to applyLink, but fallback to redirect_url for direct API calls
      applyLink = String(rawJob.applyLink || rawJob.redirect_url || '');
      externalId = String(rawJob.externalId || (rawJob.id as string | number)?.toString() || '');
      // Adzuna provides salary_min/max as annual salaries - use them
      salaryMin = typeof rawJob.minSalary === 'number' ? rawJob.minSalary : null;
      salaryMax = typeof rawJob.maxSalary === 'number' ? rawJob.maxSalary : null;
      if (rawJob.postedAt) {
        originalPostedAt = new Date(String(rawJob.postedAt));
      }
    } else if (source === 'jsearch') {
      title = String(rawJob.title || '');
      employer = String(rawJob.employer || 'Company Not Listed');
      location = String(rawJob.location || 'United States');
      description = String(rawJob.description || '');
      applyLink = String(rawJob.applyLink || '');
      externalId = String(rawJob.externalId || '');
      salaryMin = typeof rawJob.minSalary === 'number' ? rawJob.minSalary : null;
      salaryMax = typeof rawJob.maxSalary === 'number' ? rawJob.maxSalary : null;
      if (rawJob.postedDate) {
        originalPostedAt = new Date(String(rawJob.postedDate));
      }
      // JSearch salaryPeriod is already normalized in aggregator, but normalizer does its own check later
    } else if (source === 'jooble') {
      title = String(rawJob.title || '');
      employer = String(rawJob.company || 'Company Not Listed');
      location = String(rawJob.location || 'United States');
      description = String(rawJob.description || '');
      applyLink = String(rawJob.applyLink || '');
      externalId = String(rawJob.externalId || '');
      salaryMin = typeof rawJob.minSalary === 'number' ? rawJob.minSalary : null;
      salaryMax = typeof rawJob.maxSalary === 'number' ? rawJob.maxSalary : null;
      if (rawJob.postedDate) {
        originalPostedAt = new Date(String(rawJob.postedDate));
      }
    } else if (source === 'greenhouse' || source === 'lever' || source === 'ashby') {
      title = String(rawJob.title || '');
      employer = String(rawJob.company || rawJob.employer || 'Company Not Listed');
      location = String(rawJob.location || 'United States');
      description = String(rawJob.description || '');
      applyLink = String(rawJob.applyLink || '');
      externalId = String(rawJob.externalId || '');
      if (rawJob.postedDate) {
        originalPostedAt = new Date(String(rawJob.postedDate));
      }
    } else {
      // Generic mapping for other sources
      title = String(rawJob.title || '');
      employer = String(rawJob.company || rawJob.employer || 'Unknown Company');
      location = String(rawJob.location || 'Unknown Location');
      description = String(rawJob.description || '');
      applyLink = String(rawJob.applyLink || rawJob.url || rawJob.redirect_url || rawJob.apply_link || '');
      externalId = String(rawJob.externalId || (rawJob.id as string | number)?.toString() || rawJob.external_id || '');

      // Handle common date fields for other sources
      const rawDate = rawJob.postedAt || rawJob.posted_at || rawJob.updated_at || rawJob.createdAt || rawJob.updated;
      if (rawDate) {
        originalPostedAt = new Date(String(rawDate));
      }
    }

    // Validate required fields
    if (!title || !applyLink) {
      console.warn('Missing required fields for job:', { title, applyLink });
      return null;
    }

    // Global Freshness Filter (90 Days)
    // Skip for ATS sources (greenhouse, lever, ashby, bamboohr) — their APIs only
    // return currently open positions, so postedDate age is irrelevant.
    // originalPostedAt is still preserved for UI "Posted Within" filters.
    const atsSources = ['greenhouse', 'lever', 'ashby', 'bamboohr'];
    if (!atsSources.includes(source) && originalPostedAt && !isNaN(originalPostedAt.getTime())) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      if (originalPostedAt < ninetyDaysAgo) {
        console.log(`[Normalizer] Skipping stale job from ${source}: ${title} (Posted: ${originalPostedAt.toISOString().split('T')[0]})`);
        return null;
      }
    }

    // Clean the description with proper formatting
    const fullDescription = cleanDescription(description);
    const summary = fullDescription.slice(0, 300) + (fullDescription.length > 300 ? '...' : '');
    const fullText = `${title} ${fullDescription} ${location}`;

    // Extract salary from description if not provided
    let extractedPeriod: string | null = null;
    if (!salaryMin && !salaryMax) {
      const extracted = extractSalary(fullText);
      salaryMin = extracted.min;
      salaryMax = extracted.max;
      extractedPeriod = extracted.period;
    }

    // Validate and normalize salary data
    const validatedSalary = validateAndNormalizeSalary(
      salaryMin,
      salaryMax,
      fullText,
      title,
      extractedPeriod
    );
    salaryMin = validatedSalary.minSalary;
    salaryMax = validatedSalary.maxSalary;
    const salaryPeriod = validatedSalary.salaryPeriod;

    const jobType = rawJob.jobType ? String(rawJob.jobType) : detectJobType(fullText);
    const mode = detectMode(fullText);


    // Set expiration
    let expiresAt = new Date();

    // Priority 1: Use explicit expiration from source (JSearch, USAJobs)
    const explicitExpiry = rawJob.expiresAt || rawJob.expiresDate || rawJob.job_offer_expiration_datetime_utc;
    if (explicitExpiry) {
      const expDate = new Date(String(explicitExpiry));
      // Only use if valid and in the future (or very recent)
      if (!isNaN(expDate.getTime()) && expDate.getTime() > Date.now() - 24 * 60 * 60 * 1000) {
        expiresAt = expDate;
      } else {
        // Fallback if expired: Close it soon (1 day) or standard
        expiresAt.setDate(expiresAt.getDate() + 30);
      }
    } else {
      // Priority 2: Default rule (60 days from now)
      expiresAt.setDate(expiresAt.getDate() + 60);
    }

    // Normalize salary to annual equivalent
    const normalizedSalaryData = normalizeSalary({
      salaryRange: salaryMin && salaryMax ? `$${salaryMin.toLocaleString()} - $${salaryMax.toLocaleString()}` : null,
      minSalary: salaryMin,
      maxSalary: salaryMax,
      salaryPeriod,
      title,
    });

    // Parse location into structured data
    const parsedLocationData = parseLocation(location);

    // Sync isHybrid/isRemote with mode detection (mode checks full text, location parser only checks location)
    let isRemote = parsedLocationData.isRemote;
    let isHybrid = parsedLocationData.isHybrid;
    if (mode === 'Hybrid') isHybrid = true;
    if (mode === 'Remote') isRemote = true;

    // Generate display salary
    const displaySalary = formatDisplaySalary(
      normalizedSalaryData.normalizedMinSalary,
      normalizedSalaryData.normalizedMaxSalary,
      salaryPeriod
    );

    return {
      title,
      employer,
      location,
      jobType,
      mode,
      description: fullDescription,
      descriptionSummary: summary,
      salaryRange: salaryMin && salaryMax ? `$${salaryMin.toLocaleString()} - $${salaryMax.toLocaleString()}` : null,
      minSalary: salaryMin,
      maxSalary: salaryMax,
      salaryPeriod,
      normalizedMinSalary: normalizedSalaryData.normalizedMinSalary,
      normalizedMaxSalary: normalizedSalaryData.normalizedMaxSalary,
      salaryIsEstimated: normalizedSalaryData.salaryIsEstimated,
      salaryConfidence: normalizedSalaryData.salaryConfidence,
      displaySalary,
      city: parsedLocationData.city,
      state: parsedLocationData.state,
      stateCode: parsedLocationData.stateCode,
      country: parsedLocationData.country,
      isRemote: isRemote,
      isHybrid: isHybrid,
      applyLink,
      isFeatured: false,
      isPublished: true,
      isVerifiedEmployer: false,
      sourceType: 'external',
      sourceProvider: source,
      sourceSite: rawJob.sourceSite ? String(rawJob.sourceSite) : null,
      externalId,
      originalPostedAt: originalPostedAt && !isNaN(originalPostedAt.getTime()) ? originalPostedAt : new Date(),
      expiresAt,
      companyId: null,
    };
  } catch (error) {
    console.error('Error normalizing job:', error);
    return null;
  }
}

