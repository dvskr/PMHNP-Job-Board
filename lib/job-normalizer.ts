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

/**
 * Detect experience level from job title + description.
 * Returns: 'New Grad' | 'Mid-Level' | 'Senior' | null
 * 
 * Priority: Senior > Mid-Level > New Grad (most jobs don't specify)
 */
export function detectExperienceLevel(title: string, description: string): string | null {
  const text = `${title} ${description}`.toLowerCase();

  // ── Senior (5+ years) ──
  const seniorPatterns = [
    'senior pmhnp', 'senior psychiatric', 'senior nurse practitioner',
    'lead pmhnp', 'lead psychiatric', 'lead nurse practitioner',
    'supervisor', 'supervisory', 'director',
    'clinical lead', 'program director', 'medical director',
    'chief', 'manager', 'management',
    '5+ years', '5-7 years', '5-10 years', '7+ years', '7-10 years',
    '10+ years', '8+ years', '6+ years',
    'minimum 5 years', 'minimum of 5 years', 'at least 5 years',
    'minimum 7 years', 'minimum of 7 years',
    'senior level', 'advanced practice leader',
  ];
  if (seniorPatterns.some(p => text.includes(p))) return 'Senior';

  // ── Mid-Level (2-5 years) ──
  const midPatterns = [
    '2-5 years', '3-5 years', '2-4 years', '3-4 years',
    '2+ years', '3+ years', '4+ years',
    'minimum 2 years', 'minimum of 2 years', 'at least 2 years',
    'minimum 3 years', 'minimum of 3 years', 'at least 3 years',
    'mid-level', 'mid level', 'experienced pmhnp', 'experienced psychiatric',
    '2 years of experience', '3 years of experience', '4 years of experience',
    '2 years experience', '3 years experience', '4 years experience',
    'two years', 'three years', 'four years',
  ];
  if (midPatterns.some(p => text.includes(p))) return 'Mid-Level';

  // ── New Grad / Entry ──
  const newGradPatterns = [
    'new grad', 'new graduate', 'entry level', 'entry-level',
    'no experience required', 'no experience necessary',
    '0-1 year', '0-2 year', '1 year of experience', '1 year experience',
    'recent graduate', 'newly graduated', 'recent grad',
    'fellowship', 'residency program', 'mentorship',
    'training program', 'preceptor', 'will train',
    'welcome new grads', 'new grads welcome', 'open to new grads',
    'graduate nurse practitioner',
  ];
  if (newGradPatterns.some(p => text.includes(p))) return 'New Grad';

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

// ── Source field mapping config — add new sources here instead of if/else ──
interface SourceFieldConfig {
  title: string[];        // Field names to try for title
  employer: string[];     // Field names to try for employer
  location: string[];     // Field names to try for location
  description: string[];  // Field names to try for description
  applyLink: string[];    // Field names to try for apply link
  externalId: string[];   // Field names to try for external ID
  salaryMin: string[];    // Field names to try for salary min
  salaryMax: string[];    // Field names to try for salary max
  datePosted: string[];   // Field names to try for posted date
  defaultEmployer: string;
  defaultLocation: string;
}

const DEFAULT_CONFIG: SourceFieldConfig = {
  title: ['title', 'job_title', 'jobOpeningName', 'positionName'],
  employer: ['company', 'employer'],
  location: ['location'],
  description: ['description'],
  applyLink: ['applyLink', 'url', 'redirect_url', 'apply_link'],
  externalId: ['externalId', 'id', 'external_id'],
  salaryMin: ['minSalary'],
  salaryMax: ['maxSalary'],
  datePosted: ['postedAt', 'postedDate', 'posted_at', 'updated_at', 'createdAt', 'updated'],
  defaultEmployer: 'Unknown Company',
  defaultLocation: 'Unknown Location',
};

const SOURCE_CONFIGS: Record<string, Partial<SourceFieldConfig>> = {
  adzuna: {
    applyLink: ['applyLink', 'redirect_url'],
    datePosted: ['postedAt'],
  },
  jsearch: {
    datePosted: ['postedDate'],
    defaultEmployer: 'Company Not Listed',
    defaultLocation: 'United States',
  },
  jooble: {
    employer: ['company'],
    datePosted: ['postedDate'],
    defaultEmployer: 'Company Not Listed',
    defaultLocation: 'United States',
  },
  greenhouse: { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  lever: { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  ashby: { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  smartrecruiters: { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  icims: { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  jazzhr: { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  workday: { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  'fantastic-jobs-db': { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  'ats-jobs-db': { employer: ['company', 'employer'], datePosted: ['postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
};

function getConfig(source: string): SourceFieldConfig {
  const override = SOURCE_CONFIGS[source] || {};
  return { ...DEFAULT_CONFIG, ...override };
}

function extractField(rawJob: Record<string, unknown>, fields: string[], defaultValue: string): string {
  for (const field of fields) {
    const val = rawJob[field];
    if (val !== undefined && val !== null && val !== '') {
      // Handle nested objects (e.g., adzuna company.display_name)
      if (typeof val === 'object' && val !== null && 'display_name' in (val as Record<string, unknown>)) {
        return String((val as Record<string, unknown>).display_name || defaultValue);
      }
      return String(val);
    }
  }
  return defaultValue;
}

function extractNumericField(rawJob: Record<string, unknown>, fields: string[]): number | null {
  for (const field of fields) {
    if (typeof rawJob[field] === 'number') return rawJob[field] as number;
  }
  return null;
}

function extractDateField(rawJob: Record<string, unknown>, fields: string[]): Date | null {
  for (const field of fields) {
    if (rawJob[field]) {
      const d = new Date(String(rawJob[field]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// Return type with rejection reason for tracking
export interface NormalizeResult {
  job: NormalizedJob | null;
  rejectionReason?: string;
}

export function normalizeJob(rawJob: Record<string, unknown>, source: string): NormalizedJob | null {
  const result = normalizeJobWithReason(rawJob, source);
  return result.job;
}

export function normalizeJobWithReason(rawJob: Record<string, unknown>, source: string): NormalizeResult {
  try {
    const config = getConfig(source);

    // Extract fields using config
    const title = extractField(rawJob, config.title, '');
    const employer = extractField(rawJob, config.employer, config.defaultEmployer);
    const location = extractField(rawJob, config.location, config.defaultLocation);
    const description = extractField(rawJob, config.description, '');
    const applyLink = extractField(rawJob, config.applyLink, '');
    const externalId = extractField(rawJob, config.externalId, '');
    let salaryMin = extractNumericField(rawJob, config.salaryMin);
    let salaryMax = extractNumericField(rawJob, config.salaryMax);
    const originalPostedAt = extractDateField(rawJob, config.datePosted);

    // Validate required fields
    if (!title || !applyLink) {
      return { job: null, rejectionReason: 'missing_fields:title_or_apply_link' };
    }

    // Global Freshness Filter (90 Days)
    // Skip for ATS sources — their APIs only return currently open positions
    const atsSources = ['greenhouse', 'lever', 'ashby', 'bamboohr', 'smartrecruiters', 'icims', 'jazzhr', 'workday'];
    if (!atsSources.includes(source) && originalPostedAt && !isNaN(originalPostedAt.getTime())) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      if (originalPostedAt < ninetyDaysAgo) {
        return { job: null, rejectionReason: `stale_90d:${originalPostedAt.toISOString().split('T')[0]}` };
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
    const experienceLevel = detectExperienceLevel(title, fullText);


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
      job: {
        title,
        employer,
        location,
        jobType,
        mode,
        experienceLevel,
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
        applyOnPlatform: false,
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
      }
    };
  } catch (error) {
    console.error('Error normalizing job:', error);
    return { job: null, rejectionReason: `error:${error instanceof Error ? error.message : 'unknown'}` };
  }
}

