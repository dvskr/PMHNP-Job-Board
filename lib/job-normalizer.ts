import { Job } from '@/lib/types';
import { normalizeSalary } from './salary-normalizer';
import { parseLocation } from './location-parser';
import { formatDisplaySalary } from './salary-display';
import { cleanDescription } from './description-cleaner';
import { findCanonicalName } from './company-normalizer';
import { classifyJobTags } from './pseo/category-tagger';

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

  // 0a. SINGLE-VALUE CAP: "up to $150k", "max $150,000", "up to $150k per year"
  // Runs first so cap-style phrasing isn't intercepted by the period-specific
  // patterns below (which would store the value as min instead of max).
  const singleCap = new RegExp(
    '(?:up\\s+to|max(?:imum)?\\s+(?:of\\s+)?)\\s*' + amt + '\\s*(?:per\\s*(year|hour|hr))?',
    'gi',
  );
  let match = singleCap.exec(text);
  if (match) {
    const max = parseDollar(match[1]);
    const explicitPeriod = match[2]?.toLowerCase() ?? null;
    const period = explicitPeriod === 'year' ? 'year' : explicitPeriod === 'hour' || explicitPeriod === 'hr' ? 'hour' : max > 1000 ? 'year' : 'hour';
    // Require salary-context within ~80 chars; reject sign-on / relocation / CME bonuses.
    const context = text.substring(Math.max(0, (match.index || 0) - 80), (match.index || 0) + match[0].length + 30).toLowerCase();
    const looksLikeSalary =
      context.includes('salary') || context.includes('compensation') || context.includes('pay') ||
      context.includes('rate') || context.includes('wage') || context.includes('earn') ||
      context.includes('income') || /\bper\s*(year|hour|hr)\b/.test(context);
    const looksLikeBonus =
      context.includes('sign-on') || context.includes('sign on') || context.includes('bonus') ||
      context.includes('relocat') || context.includes('cme') || context.includes('stipend');
    if (looksLikeSalary && !looksLikeBonus) {
      return { min: null, max, period };
    }
  }

  // 0b. SINGLE-VALUE FLOOR: "starting at $120k", "from $90,000"
  const singleFloor = new RegExp(
    '(?:starting\\s+at|starting\\s+from|from|at\\s+least|min(?:imum)?\\s+(?:of\\s+)?)\\s*' + amt + '\\s*(?:per\\s*(year|hour|hr))?',
    'gi',
  );
  match = singleFloor.exec(text);
  if (match) {
    const min = parseDollar(match[1]);
    const explicitPeriod = match[2]?.toLowerCase() ?? null;
    const period = explicitPeriod === 'year' ? 'year' : explicitPeriod === 'hour' || explicitPeriod === 'hr' ? 'hour' : min > 1000 ? 'year' : 'hour';
    const context = text.substring(Math.max(0, (match.index || 0) - 80), (match.index || 0) + match[0].length + 30).toLowerCase();
    const looksLikeSalary =
      context.includes('salary') || context.includes('compensation') || context.includes('pay') ||
      context.includes('rate') || context.includes('wage') || context.includes('earn') ||
      context.includes('income') || /\bper\s*(year|hour|hr)\b/.test(context);
    const looksLikeBonus =
      context.includes('sign-on') || context.includes('sign on') || context.includes('bonus') ||
      context.includes('relocat') || context.includes('cme') || context.includes('stipend');
    if (looksLikeSalary && !looksLikeBonus) {
      return { min, max: null, period };
    }
  }

  // 1. HOURLY: "$50/hour", "$45 - $55 per hour", "$40/hr"
  const hourly = new RegExp(amt + '(?:' + sep + '\\$?([\\d,]+(?:\\.\\d{1,2})?(?:k)?))?\\s*(?:per\\s*hour|per\\s*hr|\\/\\s*(?:hour|hr)|hourly)', 'gi');
  match = hourly.exec(text);
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

  // Order matters: more specific signals first.
  if (lowerText.includes('locum tenens') || lowerText.includes('locums') || /\blocum\b/.test(lowerText)) {
    return 'Locum Tenens';
  }
  if (lowerText.includes('per diem') || lowerText.includes('per-diem') || /\bprn\b/.test(lowerText)) {
    return 'Per Diem';
  }
  if (
    lowerText.includes('1099') ||
    lowerText.includes('independent contractor') ||
    lowerText.includes('contract') ||
    lowerText.includes('contractor') ||
    /\bffs\b/.test(lowerText) ||                            // fee-for-service
    /\bfee[\s-]for[\s-]service\b/.test(lowerText)
  ) {
    return 'Contract';
  }
  if (
    lowerText.includes('part-time') ||
    lowerText.includes('part time') ||
    /\bpart[-\s]?time\b/.test(lowerText) ||
    /\bp\/?t\b/.test(lowerText)                              // P/T abbreviation
  ) {
    return 'Part-Time';
  }
  if (
    lowerText.includes('full-time') ||
    lowerText.includes('full time') ||
    lowerText.includes('permanent') ||
    /\bw[\s-]?2\b/.test(lowerText) ||                         // W-2 employment
    /\bf\/?t\b/.test(lowerText)                               // F/T abbreviation
  ) {
    return 'Full-Time';
  }

  return null;
}

/**
 * Map raw aggregator-supplied jobType values to the canonical taxonomy.
 * Without this, Workday's enum values (FULL_TIME, OTHER_EMPLOYMENT_TYPE,
 * UNAVAILABLE, etc.) leak straight into the DB and split the facet filter.
 *
 * Returns the canonical string, or null if the input is unrecognized /
 * a sentinel value that means "no information" — in which case the caller
 * should fall back to detectJobType(fullText).
 */
export function canonicalizeJobType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase().replace(/[\s_-]+/g, '_');

  // Workday + generic "no info" sentinels — discard.
  if (upper === 'OTHER' || upper === 'OTHER_EMPLOYMENT_TYPE' || upper === 'UNAVAILABLE' || upper === 'NA' || upper === 'N_A' || upper === 'UNKNOWN') {
    return null;
  }

  // Canonical taxonomy.
  if (upper === 'FULL_TIME' || upper === 'FULLTIME' || upper === 'PERMANENT') return 'Full-Time';
  if (upper === 'PART_TIME' || upper === 'PARTTIME') return 'Part-Time';
  if (upper === 'CONTRACT' || upper === 'CONTRACTOR' || upper === 'TEMPORARY' || upper === 'TEMP') return 'Contract';
  if (upper === 'PER_DIEM' || upper === 'CASUAL') return 'Per Diem';
  if (upper === 'PRN') return 'PRN';
  if (upper === 'LOCUM_TENENS' || upper === 'LOCUMS' || upper === 'LOCUM') return 'Locum Tenens';
  if (upper === 'INTERN' || upper === 'INTERNSHIP') return 'Internship';

  // "Healthcare" and similar industry tags — discard.
  if (upper === 'HEALTHCARE' || upper === 'MEDICAL' || upper === 'NURSING') return null;

  // Already-canonical pass-through.
  const passthrough = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem', 'PRN', 'Locum Tenens', 'Internship'];
  if (passthrough.includes(trimmed)) return trimmed;

  // Anything else: return null and let detectJobType fall back to text scan.
  return null;
}

// Mode patterns. Order matters in the detectMode function — Hybrid is the
// most specific (mentions of "split between..." or "X days remote" are
// indicators of Hybrid even if "remote" or "in-person" appear in the same
// sentence).
const MODE_HYBRID_RE = /\b(?:hybrid|split between|days (?:in[\s-]office|remote)|(?:\d+\s*)?days? (?:on[\s-]site|in[\s-]person)|flex(?:ible)? schedule|partial(?:ly)? remote|(?:\d+|two|three|four)\s*days?\s*(?:per|a)\s*week\s*(?:remote|on[\s-]?site|in[\s-]?office))\b/i;
// Extended 2026-05-05: added 'fully virtual', 'work from anywhere',
// '100% telework', 'remote-first', 'distributed team', 'wherever you are'.
const MODE_REMOTE_RE = /\b(?:fully remote|100% remote|100 ?% remote|wfh|work[\s-]from[\s-]home|remote[\s-]?friendly|remote[\s-]?eligible|remote[\s-]?first|telecommute|telework|100% telework|fully virtual|virtual position|virtual role|home[\s-]based|telehealth|tele[\s-]psychiatry|tele[\s-]health|work\s+from\s+anywhere|distributed team|wherever you are|fully distributed|remote)\b/i;
const MODE_ONSITE_RE = /\b(?:on[\s-]?site|onsite|in[\s-]?person|in person|office[\s-]?based|in[\s-]?office|office\s+location|clinic[\s-]?based|hospital[\s-]?based|outpatient (?:clinic|setting)|brick[\s-]and[\s-]mortar|on[\s-]premises?)\b/i;

function detectMode(text: string): string | null {
  // Hybrid is most specific — check first so "remote" in a hybrid post
  // doesn't get classified as fully Remote.
  if (MODE_HYBRID_RE.test(text)) return 'Hybrid';
  if (MODE_REMOTE_RE.test(text)) return 'Remote';
  if (MODE_ONSITE_RE.test(text)) return 'In-Person';
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
    'first job', 'just graduated', 'fresh out of school',
  ];
  if (newGradPatterns.some(p => text.includes(p))) return 'New Grad';

  // ── "Open to all levels" / "any experience" — common pattern that
  // indicates the employer doesn't restrict by experience. We return
  // 'Mid-Level' as a safe default since these listings are broadly
  // accessible (covering mid + senior). Returning null would leave
  // the field empty, which our completeness score penalizes.
  const anyLevelPatterns = [
    'open to all levels', 'all levels welcome', 'any experience level',
    'any level', 'experience varies', 'flexible experience',
    'open to candidates of all experience levels',
  ];
  if (anyLevelPatterns.some(p => text.includes(p))) return 'Mid-Level';

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

  // Step 2: Clamp out-of-range values to the period's bounds rather than
  // dropping them. The source TRIED to give us a salary, so a usable value
  // is better than null. A $20k "annual" gets clamped up to $30k; a $700k
  // "annual" gets clamped down to $500k. (Changed 2026-05-05 from drop-on-
  // invalid to clamp-on-invalid per user request.)
  const PERIOD_BOUNDS: Record<string, { min: number; max: number }> = {
    hourly:    { min: 20,    max: 300 },
    annual:    { min: 30000, max: 500000 },
    daily:     { min: 100,   max: 2000 },
    weekly:    { min: 400,   max: 10000 },
    biweekly:  { min: 800,   max: 20000 },
    monthly:   { min: 2000,  max: 40000 },
  };

  const clampToBounds = (salary: number | null, p: string): number | null => {
    if (!salary) return null;
    const bounds = PERIOD_BOUNDS[p];
    if (!bounds) return salary; // unknown period — leave alone
    if (salary < bounds.min) {
      console.log(`Clamped low salary ${salary} ${p} → ${bounds.min}`);
      return bounds.min;
    }
    if (salary > bounds.max) {
      console.log(`Clamped high salary ${salary} ${p} → ${bounds.max}`);
      return bounds.max;
    }
    return salary;
  };

  min = clampToBounds(min, period);
  max = clampToBounds(max, period);

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
  /**
   * Field names to try for the salary period when the source supplies it
   * (e.g. Adzuna sets salaryPeriod='annual'). Without this hint, the
   * validator infers period from magnitude — which gets fooled by the
   * $30k–$40k range (mistakenly classified as monthly).
   */
  salaryPeriod: string[];
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
  salaryPeriod: ['salaryPeriod', 'salary_period', 'salaryUnit'],
  datePosted: ['postedAt', 'postedDate', 'posted_at', 'updated_at', 'createdAt', 'updated'],
  defaultEmployer: 'Unknown Company',
  defaultLocation: 'Unknown Location',
};

const SOURCE_CONFIGS: Record<string, Partial<SourceFieldConfig>> = {
  adzuna: {
    applyLink: ['applyLink', 'redirect_url'],
    datePosted: ['postedAt'],
    salaryPeriod: ['salaryPeriod'],
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
  usajobs: { employer: ['employer'], datePosted: ['postedAt'], defaultEmployer: 'Federal Government', defaultLocation: 'United States' },
  bamboohr: { employer: ['employer', 'company'], datePosted: ['postedAt', 'postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  workable: { employer: ['employer', 'company'], datePosted: ['postedAt', 'postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  doccafe: { employer: ['employer', 'company'], datePosted: ['postedAt', 'postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
  healthcareercenter: { employer: ['employer', 'company'], datePosted: ['postedAt', 'postedDate'], defaultEmployer: 'Company Not Listed', defaultLocation: 'United States' },
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

/**
 * Canonical rejection reasons emitted by `normalizeJobWithReason`.
 * Stable strings — written verbatim to `rejected_jobs.rejection_reason`
 * so admin queries / pipeline-event metrics can pivot on them.
 *
 * Old free-form strings ("missing_fields:title_or_apply_link",
 * "stale_90d:2026-01-15", "error:...") are retired in favor of these.
 */
export type NormalizerRejectionReason =
  | 'normalizer_missing_required_field'  // title or applyLink absent
  | 'normalizer_missing_description'      // description empty / < MIN_DESCRIPTION_LENGTH
  | 'normalizer_stale_post'               // originalPostedAt > 60 days ago
  | 'normalizer_indirect_apply'           // applyLink points at a known wrapper/redirect host
  | 'normalizer_low_completeness'         // not enough data points (see computeCompleteness)
  | 'normalizer_exception';               // try/catch caught a runtime error

const MIN_DESCRIPTION_LENGTH = 50;

/**
 * Two-tier completeness gating.
 *
 *   Hard floor (this file)       — score < 20 → reject as truly unsalvageable.
 *   Soft floor (orchestrator)    — score < 40 → try inline LLM rescue, then
 *                                    re-score and decide. See lib/ingestion-service.ts.
 *
 * Calibrated 2026-05-05 against the typical catalog distribution:
 *   - greenhouse / lever:  avg ~50 (description + location + jobType + mode)
 *   - adzuna:              avg ~70 (almost always has salary)
 *   - fantastic-jobs-db:   avg ~38 (often missing mode + salary; LLM rescue tries)
 */

/**
 * Score a normalized job 0-100 by which fields it has populated.
 * Used by the two-tier completeness gate (hard floor here, soft floor
 * in the orchestrator) and as a sortable signal in the admin panel.
 *
 * Weights reflect what users actually need to evaluate a job:
 *   - description (15) — cannot read the role without this
 *   - location (15)    — city OR state required for relevance
 *   - salary (20)      — top user-asked-for filter
 *   - jobType (10)     — FT/PT/Contract distinction matters for fit
 *   - mode (10)        — Remote vs On-site is a hard filter
 *   - clinical setting (10) — what kind of practice
 *   - patient pop (5)
 *   - benefits (5)
 *   - experience level (5)
 *   - employer linked  (5)
 *
 * Title and applyLink are required gates upstream — not counted here.
 */
export function computeCompleteness(job: {
    description?: string | null;
    descriptionSummary?: string | null;
    city?: string | null;
    state?: string | null;
    isRemote?: boolean;
    isHybrid?: boolean;
    normalizedMinSalary?: number | null;
    normalizedMaxSalary?: number | null;
    jobType?: string | null;
    mode?: string | null;
    setting?: string | null;
    population?: string | null;
    benefits?: string[] | null;
    experienceLevel?: string | null;
    companyId?: string | null;
}): number {
    let score = 0;

    if ((job.description?.length ?? 0) >= 200) score += 15;
    else if ((job.description?.length ?? 0) >= 50) score += 8;

    const hasLocation = !!job.city || !!job.state || job.isRemote || job.isHybrid;
    if (hasLocation) score += 15;

    const hasSalary = job.normalizedMinSalary != null || job.normalizedMaxSalary != null;
    if (hasSalary) score += 20;

    if (job.jobType) score += 10;
    if (job.mode) score += 10;
    if (job.setting) score += 10;
    if (job.population) score += 5;
    if (job.benefits && job.benefits.length > 0) score += 5;
    if (job.experienceLevel) score += 5;
    if (job.companyId) score += 5;

    return score;
}

/**
 * Apply-link hosts we reject as "indirect" — these wrap the real
 * employer page in their own preview/login flow, hurting attribution
 * and click-through. Adzuna's redirect_url single-hops to the real
 * employer site so it stays out of this list.
 */
const INDIRECT_APPLY_HOST_PATTERNS = [
    'indeed.com/rc/clk',
    'indeed.com/cmp/',
    'indeed.com/viewjob',
    'glassdoor.com/job-listing/',
    'glassdoor.com/Job/',
    'simplyhired.com/job/',
    'ziprecruiter.com/c/',
    'linkedin.com/jobs/view/',
    'monster.com/job-openings/',
    'dice.com/jobs/detail/',
];

function isIndirectApplyLink(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return INDIRECT_APPLY_HOST_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Light-touch employer-name canonicalization. Two stages:
 *   1. Strip legal suffixes + whitespace ("LifeStance Health, LLC" →
 *      "LifeStance Health").
 *   2. Look up the result in the hand-vetted KNOWN_COMPANIES list via
 *      findCanonicalName (e.g. "Lifestance" → "LifeStance Health",
 *      "Blue Sky Telepsych" → "BlueSky Telepsych"). If unknown, return
 *      the suffix-stripped string unchanged.
 *
 * Stage 2 was added 2026-05-06 after a prod audit found cards displaying
 * the same company under different spellings depending on which source
 * inserted the row first. Heavier company-record linking still happens
 * later via `linkJobToCompany`; this just makes the displayed string
 * canonical at ingest time.
 */
const EMPLOYER_LEGAL_SUFFIX_RE =
    /[,\s]+(?:llc|l\.l\.c\.|inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited|co\.?|llp|p\.?l\.?l\.?c\.?|p\.?c\.?|p\.?a\.?)\.?$/i;

export function canonicalizeEmployerName(raw: string | null | undefined): string {
    if (!raw) return '';
    let s = String(raw).trim();
    // Collapse repeated whitespace.
    s = s.replace(/\s+/g, ' ');
    // Strip trailing legal suffix (one pass — multiple suffixes are rare).
    s = s.replace(EMPLOYER_LEGAL_SUFFIX_RE, '').trim();
    // Strip dangling trailing comma if any.
    s = s.replace(/,$/, '').trim();
    // Apply curated alias map (LifeStance / BlueSky / SonderMind / …).
    const canonical = findCanonicalName(s);
    return canonical ?? s;
}

/**
 * Section markers used to skip leading "About us" / "Equal Opportunity"
 * boilerplate before truncating the SEO summary. If found within the
 * first 800 chars, the summary starts from the marker.
 */
const SUMMARY_SECTION_MARKERS = [
    'position summary',
    'job description',
    'job summary',
    'job overview',
    'role summary',
    'responsibilities',
    'what you will do',
    "what you'll do",
    'what you will be doing',
    "what you'll be doing",
    'we are seeking',
    'we are looking for',
    'looking for',
    'in this role',
    'as a ',
    'the role',
    'duties include',
    'primary duties',
];

function smartSummarize(fullDescription: string, maxLength: number = 300): string {
    if (!fullDescription) return '';
    const lower = fullDescription.toLowerCase();
    let bestIdx = -1;
    for (const marker of SUMMARY_SECTION_MARKERS) {
        const idx = lower.indexOf(marker);
        if (idx >= 0 && idx <= 800 && (bestIdx === -1 || idx < bestIdx)) {
            bestIdx = idx;
        }
    }
    const start = bestIdx >= 0 ? bestIdx : 0;
    const slice = fullDescription.slice(start, start + maxLength);
    return slice + (fullDescription.length > start + maxLength ? '...' : '');
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
    const sourceSuppliedPeriod = extractField(rawJob, config.salaryPeriod, '') || null;
    const originalPostedAt = extractDateField(rawJob, config.datePosted);

    // Gate 1: required fields
    if (!title || !applyLink) {
      return { job: null, rejectionReason: 'normalizer_missing_required_field' };
    }

    // Gate 2: indirect-apply check (catch wrapper hosts before any
    // expensive parsing). Adzuna's redirect URL single-hops and is
    // explicitly NOT in the indirect list — see INDIRECT_APPLY_HOST_PATTERNS.
    if (isIndirectApplyLink(applyLink)) {
      return { job: null, rejectionReason: 'normalizer_indirect_apply' };
    }

    // Gate 3: Stale-post (30 days). Tightened 2026-05-06 from 60 → 30d
    // to align ingest inventory with user-facing "Posted Within" filter
    // ceiling and reduce drift between source-claimed dates and what we
    // present as "fresh". Applies to every source.
    if (originalPostedAt && !isNaN(originalPostedAt.getTime())) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (originalPostedAt < thirtyDaysAgo) {
        return { job: null, rejectionReason: 'normalizer_stale_post' };
      }
    }

    // Clean the description with proper formatting
    const fullDescription = cleanDescription(description);

    // Gate 4: missing description. Empty / boilerplate-only descriptions
    // hurt SEO + LLM enrichment + user trust. The threshold is intentionally
    // low (50 chars) to drop only the worst cases.
    if (fullDescription.length < MIN_DESCRIPTION_LENGTH) {
      return { job: null, rejectionReason: 'normalizer_missing_description' };
    }

    // Smart summary — skip leading boilerplate when possible.
    const summary = smartSummarize(fullDescription, 300);
    const fullText = `${title} ${fullDescription} ${location}`;

    // Period hint priority:
    //   1. Source-supplied (e.g. adzuna sets salaryPeriod='annual')
    //   2. Regex-extracted from description (only when source had no salary)
    //   3. null → magnitude-based inference inside the validator
    let extractedPeriod: string | null = sourceSuppliedPeriod;
    if (!salaryMin && !salaryMax) {
      const extracted = extractSalary(fullText);
      salaryMin = extracted.min;
      salaryMax = extracted.max;
      // Only override if regex got something AND source didn't already provide one.
      if (!extractedPeriod) extractedPeriod = extracted.period;
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

    // Canonicalize aggregator-supplied jobType (Workday enums like
    // OTHER_EMPLOYMENT_TYPE, UNAVAILABLE, FULL_TIME used to leak through).
    // Falls back to text-scan if the raw value is missing or unrecognized.
    const canonicalRaw = canonicalizeJobType(
      rawJob.jobType ? String(rawJob.jobType) : null,
    );
    const jobType = canonicalRaw ?? detectJobType(fullText);
    const mode = detectMode(fullText);
    const experienceLevel = detectExperienceLevel(title, fullText);


    // Expiration policy.
    //   Source provided a date  → expiresAt = originalPostedAt + 60 days
    //   Source did NOT          → expiresAt = now + 30 days  (shorter half-life
    //                              for jobs we don't actually know the age of)
    // Single clock — no renewal extensions. Once set, expiresAt stays.
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const expiresAt =
      originalPostedAt && !isNaN(originalPostedAt.getTime())
        ? new Date(originalPostedAt.getTime() + SIXTY_DAYS_MS)
        : new Date(Date.now() + THIRTY_DAYS_MS);

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

    // Gate 5: completeness score. Soft floor — reject if score < threshold.
    // The score is computed against the about-to-be-returned shape, so
    // changes to NormalizedJob fields should be reflected in computeCompleteness.
    // setting/population/benefits are filled later by enrich-jobs cron, so
    // they don't count against fresh ingests; same for companyId.
    const completenessScore = computeCompleteness({
      description: fullDescription,
      descriptionSummary: summary,
      city: parsedLocationData.city,
      state: parsedLocationData.state,
      isRemote,
      isHybrid,
      normalizedMinSalary: normalizedSalaryData.normalizedMinSalary,
      normalizedMaxSalary: normalizedSalaryData.normalizedMaxSalary,
      jobType,
      mode,
      experienceLevel,
      // setting/population/benefits/companyId are populated AFTER ingest by
      // the enrich-jobs cron, so we don't pass them — gate would be too strict.
    });

    // Hard floor: anything under 20 is unsalvageable (no description signal,
    // no location, nothing). Reject immediately without bothering LLM.
    // Soft 40-floor enforcement is moved to the orchestrator (after the
    // inline-LLM rescue pass) so borderline jobs get one chance at LLM
    // enrichment before being rejected.
    const HARD_COMPLETENESS_FLOOR = 20;
    if (completenessScore < HARD_COMPLETENESS_FLOOR) {
      return { job: null, rejectionReason: 'normalizer_low_completeness' };
    }

    // P9: pre-compute canonical category tags so taxonomy×city / taxonomy×state
    // queries can use exact array containment (`categoryTags has 'X'`) instead
    // of brittle OR-on-`title.contains` matchers that produced 5x duplication
    // across pages. Pure function — easy to unit-test, no DB access.
    const categoryTags = classifyJobTags({
      title,
      description: fullDescription,
      descriptionSummary: summary,
      jobType,
      isRemote,
    });

    return {
      job: {
        title,
        // Strip legal suffixes ("LifeStance Health, LLC" → "LifeStance Health")
        // so dedup's fuzzy match doesn't split the same company across rows.
        employer: canonicalizeEmployerName(employer),
        location,
        jobType,
        mode,
        experienceLevel,
        description: fullDescription,
        descriptionSummary: summary,
        categoryTags,
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
        // Default to "now" when the source doesn't provide a date — keeps
        // every row with a non-null originalPostedAt so user-facing
        // freshness filters and "Posted N days ago" labels are
        // consistent across all sources. The value is essentially
        // equivalent to createdAt for these rows.
        originalPostedAt: originalPostedAt && !isNaN(originalPostedAt.getTime()) ? originalPostedAt : new Date(),
        expiresAt,
        companyId: null,
      }
    };
  } catch (error) {
    console.error('Error normalizing job:', error);
    return { job: null, rejectionReason: 'normalizer_exception' };
  }
}

