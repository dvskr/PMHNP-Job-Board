import { Job } from '@/lib/types';
import { normalizeSalary } from './salary-normalizer';
import { parseLocation } from './location-parser';
import { formatDisplaySalary } from './salary-display';

type NormalizedJob = Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'viewCount' | 'applyClickCount'>;

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

function cleanDescription(rawDescription: string): string {
  if (!rawDescription) return '';

  let cleaned = rawDescription;

  // Decode HTML entities
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&rsquo;/g, "'");
  cleaned = cleaned.replace(/&lsquo;/g, "'");
  cleaned = cleaned.replace(/&rdquo;/g, '"');
  cleaned = cleaned.replace(/&ldquo;/g, '"');
  cleaned = cleaned.replace(/&mdash;/g, '—');
  cleaned = cleaned.replace(/&ndash;/g, '–');
  cleaned = cleaned.replace(/&bull;/g, '•');
  cleaned = cleaned.replace(/&#x27;/g, "'");
  cleaned = cleaned.replace(/&#x2F;/g, '/');
  cleaned = cleaned.replace(/&hellip;/g, '...');
  cleaned = cleaned.replace(/&apos;/g, "'");
  cleaned = cleaned.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  cleaned = cleaned.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Convert literal \n and \r\n strings to actual newlines
  cleaned = cleaned.replace(/\\r\\n/g, '\n');
  cleaned = cleaned.replace(/\\n/g, '\n');
  cleaned = cleaned.replace(/\\r/g, '\n');

  // Convert HTML block elements to newlines BEFORE stripping tags
  cleaned = cleaned.replace(/<\/p>/gi, '\n\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/div>/gi, '\n');
  cleaned = cleaned.replace(/<\/li>/gi, '\n');
  cleaned = cleaned.replace(/<li>/gi, '• ');
  cleaned = cleaned.replace(/<\/h[1-6]>/gi, '\n\n');
  cleaned = cleaned.replace(/<h[1-6][^>]*>/gi, '\n\n');

  // Remove all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove duplicate headers (e.g., "Job Description Job Description:")
  cleaned = cleaned.replace(/^(Job Description[:\s]*){2,}/i, 'Job Description:\n\n');
  cleaned = cleaned.replace(/\n(Job Description[:\s]*){2,}/gi, '\nJob Description:\n\n');

  // Remove common repetitive prefixes
  cleaned = cleaned.replace(/^Job Description[:\s]*Job Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Job Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Description[:\s]*Description[:\s]*/i, '');
  cleaned = cleaned.replace(/^Description[:\s]*/i, '');

  // Clean up whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');           // Multiple spaces to single
  cleaned = cleaned.replace(/\n[ \t]+/g, '\n');        // Remove leading spaces on lines
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');        // Remove trailing spaces on lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');        // Max 2 newlines (1 blank line)
  cleaned = cleaned.trim();

  return cleaned;
}

function extractSalary(text: string): { min: number | null; max: number | null; period: string | null } {
  // Match patterns like "$120,000", "$120k", "$120,000 - $150,000", "$50/hour"
  const annualPattern = /\$(\d{1,3}(?:,?\d{3})*(?:k)?)\s*(?:-|to)?\s*\$?(\d{1,3}(?:,?\d{3})*(?:k)?)?(?:\s*(?:per\s*)?(?:year|annual|yearly|pa|p\.a\.))?/gi;
  const hourlyPattern = /\$(\d{1,3}(?:\.\d{2})?)\s*(?:-|to)?\s*\$?(\d{1,3}(?:\.\d{2})?)?(?:\s*(?:per\s*)?(?:hour|hr|hourly))/gi;

  let match = hourlyPattern.exec(text);
  if (match) {
    const min = parseFloat(match[1]);
    const max = match[2] ? parseFloat(match[2]) : null;
    return { min, max, period: 'hour' };
  }

  match = annualPattern.exec(text);
  if (match) {
    const min = match[1].toLowerCase().includes('k')
      ? parseFloat(match[1].replace(/k/i, '').replace(/,/g, '')) * 1000
      : parseFloat(match[1].replace(/,/g, ''));
    const max = match[2]
      ? (match[2].toLowerCase().includes('k')
        ? parseFloat(match[2].replace(/k/i, '').replace(/,/g, '')) * 1000
        : parseFloat(match[2].replace(/,/g, '')))
      : null;
    return { min, max, period: 'year' };
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

function validateAndNormalizeSalary(
  minSalary: number | null,
  maxSalary: number | null,
  description: string,
  title: string
): { minSalary: number | null; maxSalary: number | null; salaryPeriod: string | null } {
  let min = minSalary;
  let max = maxSalary;
  let period: string | null = null;

  // If no salary data, return nulls
  if (!min && !max) {
    return { minSalary: null, maxSalary: null, salaryPeriod: null };
  }

  // Step 1: Detect salary period from description text
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.match(/(?:per\s*hour|\/\s*hr|hourly|an\s*hour)/i)) {
    period = 'hourly';
  } else if (lowerDesc.match(/(?:per\s*week|\/\s*week|weekly)/i)) {
    period = 'weekly';
  } else if (lowerDesc.match(/(?:per\s*month|\/\s*month|monthly)/i)) {
    period = 'monthly';
  } else if (lowerDesc.match(/(?:per\s*year|\/\s*yr|annual|yearly|per\s*annum)/i)) {
    period = 'annual';
  } else {
    // Default: if salary < 500 assume hourly, else assume annual
    if ((min && min < 500) || (max && max < 500)) {
      period = 'hourly';
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
    // For weekly/monthly, use reasonable ranges
    if (period === 'weekly') {
      return salary > 10000 || salary < 400;
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
    } else if (source === 'jsearch') {
      title = String(rawJob.title || '');
      employer = String(rawJob.employer || 'Company Not Listed');
      location = String(rawJob.location || 'United States');
      description = String(rawJob.description || '');
      applyLink = String(rawJob.applyLink || '');
      externalId = String(rawJob.externalId || '');
      salaryMin = typeof rawJob.minSalary === 'number' ? rawJob.minSalary : null;
      salaryMax = typeof rawJob.maxSalary === 'number' ? rawJob.maxSalary : null;
      // JSearch salaryPeriod is already normalized in aggregator, but normalizer does its own check later
    } else {
      // Generic mapping for other sources
      title = String(rawJob.title || '');
      employer = String(rawJob.company || rawJob.employer || 'Unknown Company');
      location = String(rawJob.location || 'Unknown Location');
      description = String(rawJob.description || '');
      applyLink = String(rawJob.applyLink || rawJob.url || rawJob.redirect_url || rawJob.apply_link || '');
      externalId = String(rawJob.externalId || (rawJob.id as string | number)?.toString() || rawJob.external_id || '');
    }

    // Validate required fields
    if (!title || !applyLink) {
      console.warn('Missing required fields for job:', { title, applyLink });
      return null;
    }

    // Clean the description with proper formatting
    const fullDescription = cleanDescription(description);
    const summary = fullDescription.slice(0, 300) + (fullDescription.length > 300 ? '...' : '');
    const fullText = `${title} ${fullDescription} ${location}`;

    // Extract salary from description if not provided
    if (!salaryMin && !salaryMax) {
      const extracted = extractSalary(fullText);
      salaryMin = extracted.min;
      salaryMax = extracted.max;
    }

    // Validate and normalize salary data
    const validatedSalary = validateAndNormalizeSalary(
      salaryMin,
      salaryMax,
      fullText,
      title
    );
    salaryMin = validatedSalary.minSalary;
    salaryMax = validatedSalary.maxSalary;
    const salaryPeriod = validatedSalary.salaryPeriod;

    const jobType = rawJob.jobType ? String(rawJob.jobType) : detectJobType(fullText);
    const mode = detectMode(fullText);

    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

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
      isRemote: parsedLocationData.isRemote,
      isHybrid: parsedLocationData.isHybrid,
      applyLink,
      isFeatured: false,
      isPublished: true,
      isVerifiedEmployer: false,
      sourceType: 'external',
      sourceProvider: source,
      externalId,
      expiresAt,
      companyId: null,
    };
  } catch (error) {
    console.error('Error normalizing job:', error);
    return null;
  }
}

