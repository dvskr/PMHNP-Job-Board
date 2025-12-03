import { Job } from '@prisma/client';

type NormalizedJob = Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'viewCount' | 'applyClickCount'>;

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
    let min = match[1].toLowerCase().includes('k') 
      ? parseFloat(match[1].replace(/k/i, '').replace(/,/g, '')) * 1000
      : parseFloat(match[1].replace(/,/g, ''));
    let max = match[2] 
      ? (match[2].toLowerCase().includes('k')
          ? parseFloat(match[2].replace(/k/i, '').replace(/,/g, '')) * 1000
          : parseFloat(match[2].replace(/,/g, '')))
      : null;
    return { min, max, period: 'year' };
  }

  return { min: null, max: null, period: null };
}

function detectJobType(text: string): string | null {
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

export function normalizeJob(rawJob: any, source: string): NormalizedJob | null {
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
      title = rawJob.title;
      employer = rawJob.company?.display_name || 'Unknown Company';
      location = rawJob.location?.display_name || 'Unknown Location';
      description = rawJob.description || '';
      applyLink = rawJob.redirect_url;
      externalId = rawJob.id?.toString();
      salaryMin = rawJob.salary_min || null;
      salaryMax = rawJob.salary_max || null;
    } else {
      // Generic mapping for other sources
      title = rawJob.title;
      employer = rawJob.company || rawJob.employer || 'Unknown Company';
      location = rawJob.location || 'Unknown Location';
      description = rawJob.description || '';
      applyLink = rawJob.url || rawJob.redirect_url || rawJob.apply_link;
      externalId = rawJob.id?.toString() || rawJob.external_id;
    }

    // Validate required fields
    if (!title || !applyLink) {
      console.warn('Missing required fields for job:', { title, applyLink });
      return null;
    }

    const cleanDescription = stripHtml(description);
    const fullText = `${title} ${cleanDescription} ${location}`;

    // Extract salary from description if not provided
    if (!salaryMin && !salaryMax) {
      const extracted = extractSalary(fullText);
      salaryMin = extracted.min;
      salaryMax = extracted.max;
    }

    const salaryPeriod = salaryMin || salaryMax ? 'year' : null;
    const jobType = detectJobType(fullText);
    const mode = detectMode(fullText);
    const descriptionSummary = generateSummary(description);

    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return {
      title,
      employer,
      location,
      jobType,
      mode,
      description: cleanDescription,
      descriptionSummary,
      salaryRange: salaryMin && salaryMax ? `$${salaryMin.toLocaleString()} - $${salaryMax.toLocaleString()}` : null,
      minSalary: salaryMin ? Math.round(salaryMin) : null,
      maxSalary: salaryMax ? Math.round(salaryMax) : null,
      salaryPeriod,
      applyLink,
      isFeatured: false,
      isPublished: true,
      isVerifiedEmployer: false,
      sourceType: 'external',
      sourceProvider: source,
      externalId,
      expiresAt,
    };
  } catch (error) {
    console.error('Error normalizing job:', error);
    return null;
  }
}

