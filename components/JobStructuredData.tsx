import { Job } from '@/lib/types';
import { slugify } from '@/lib/utils';

function mapJobType(jobType: string | null): string {
  const mapping: Record<string, string> = {
    'Full-Time': 'FULL_TIME',
    'Part-Time': 'PART_TIME',
    'Contract': 'CONTRACTOR',
    'Per Diem': 'PER_DIEM',
    'Travel': 'TEMPORARY',
    'Temporary': 'TEMPORARY',
    'Internship': 'INTERN',
  };
  return mapping[jobType || ''] || 'FULL_TIME';
}

// Map normalized salaryPeriod → schema.org JobPosting unitText.
// Source ingestion stores values like 'annual', 'year', 'hour', 'month'.
// schema.org accepts: HOUR, DAY, WEEK, MONTH, YEAR.
function mapSalaryUnitText(period: string | null): 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' {
  const p = (period || '').toLowerCase();
  if (p === 'hour' || p === 'hourly' || p === 'hr') return 'HOUR';
  if (p === 'day' || p === 'daily') return 'DAY';
  if (p === 'week' || p === 'weekly') return 'WEEK';
  if (p === 'month' || p === 'monthly') return 'MONTH';
  return 'YEAR'; // 'annual', 'year', 'yearly', null → annualized default
}

interface JobStructuredDataProps {
  job: Job;
}

/**
 * Remove all keys with undefined values from an object (shallow + nested).
 */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = stripUndefined(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export default function JobStructuredData({ job }: JobStructuredDataProps) {
  // Use originalPostedAt (real source date) with createdAt fallback for SEO accuracy
  const rawDate = job.originalPostedAt || job.createdAt;
  const datePosted = rawDate instanceof Date ? rawDate : new Date(rawDate as string);

  // GSC Fix: when expiresAt is null we used to emit `now + 30d` — recalculated
  // on every render, which made stale jobs look perpetually fresh to Google
  // ("validThrough always in future" is a quality-model red flag). Anchor the
  // fallback to datePosted instead so the value is deterministic per job and
  // old listings naturally roll out of Google Jobs after 60 days.
  // When expiresAt IS set, we respect the employer's stated expiry as-is.
  const sixtyDaysAfterPost = new Date(datePosted);
  sixtyDaysAfterPost.setDate(sixtyDaysAfterPost.getDate() + 60);

  const validThrough = job.expiresAt
    ? (job.expiresAt instanceof Date ? job.expiresAt : new Date(job.expiresAt))
    : sixtyDaysAfterPost;

  // GSC Fix: Guard against empty/whitespace description — fallback chain
  const description = (job.description && job.description.trim())
    || (job.descriptionSummary && job.descriptionSummary.trim())
    || `${job.title} position at ${job.employer}${job.city ? ` in ${job.city}, ${job.stateCode || job.state}` : ''}`;

  // SEO Fix #2: schema URL must match the canonical resolver. Live route reads
  // the trailing UUID and renders any prefix, but Google penalizes URL/canonical
  // mismatches. The DB-stored job.slug can drift from current slugify() output
  // when titles contain '/', '&', or other punctuation — generate the slug from
  // the same source the page uses so schema URL == <link rel=canonical>.
  const canonicalSlug = job.slug || slugify(job.title, job.id);
  const canonicalUrl = `https://pmhnphiring.com/jobs/${canonicalSlug}`;

  // SEO Fix #1: location semantics for remote / hybrid / in-person.
  // Google requires:
  //   - Remote-only       → omit jobLocation, set jobLocationType TELECOMMUTE
  //                          + applicantLocationRequirements
  //   - Hybrid            → emit BOTH a physical jobLocation AND
  //                          jobLocationType TELECOMMUTE
  //   - In-person / null  → emit physical jobLocation only
  // Previously remote jobs shipped a physical CA address with no TELECOMMUTE
  // flag, so Google Jobs treated them as local CA postings.
  const hasPhysicalLocation = !!(job.city || job.state || job.stateCode);
  const addressLocality = hasPhysicalLocation ? (job.city || undefined) : undefined;
  const addressRegion = hasPhysicalLocation ? (job.stateCode || job.state || undefined) : undefined;
  const streetAddress = hasPhysicalLocation && job.city && (job.stateCode || job.state)
    ? `${job.city}, ${job.stateCode || job.state}`
    : undefined;

  const physicalJobLocation = hasPhysicalLocation
    ? {
        '@type': 'Place',
        address: stripUndefined({
          '@type': 'PostalAddress',
          streetAddress,
          addressLocality,
          addressRegion,
          addressCountry: 'US',
        }),
      }
    : undefined;

  // Remote-only jobs: drop physical jobLocation entirely.
  // Hybrid: keep physical jobLocation AND add TELECOMMUTE.
  const jobLocation = job.isRemote && !job.isHybrid ? undefined : physicalJobLocation;
  const jobLocationType = job.isRemote || job.isHybrid ? 'TELECOMMUTE' : undefined;
  const applicantLocationRequirements = job.isRemote
    ? { '@type': 'Country', name: 'US' }
    : undefined;

  // SEO Fix #3: emit salary in its NATIVE unit. Previously we always pushed
  // normalizedMin/Max (annualized) with unitText: 'YEAR' even when the source
  // posting was hourly, producing UI ($175/hr) ≠ schema ($364k/yr) mismatches.
  // For non-annual periods, prefer the raw minSalary/maxSalary (original unit).
  const unitText = mapSalaryUnitText(job.salaryPeriod);
  const minForSchema = unitText === 'YEAR'
    ? (job.normalizedMinSalary != null ? job.normalizedMinSalary : job.minSalary)
    : (job.minSalary != null ? job.minSalary : job.normalizedMinSalary);
  const maxForSchema = unitText === 'YEAR'
    ? (job.normalizedMaxSalary != null ? job.normalizedMaxSalary : job.maxSalary)
    : (job.maxSalary != null ? job.maxSalary : job.normalizedMaxSalary);

  const baseSalary = minForSchema != null || maxForSchema != null
    ? {
        '@type': 'MonetaryAmount',
        currency: 'USD',
        value: stripUndefined({
          '@type': 'QuantitativeValue',
          minValue: minForSchema ?? undefined,
          maxValue: maxForSchema ?? minForSchema ?? undefined,
          unitText,
        }),
      }
    : undefined;

  const structuredData = stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description,
    url: canonicalUrl,
    datePosted: datePosted.toISOString(),
    validThrough: validThrough.toISOString(),
    employmentType: mapJobType(job.jobType),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.employer,
    },
    jobLocation,
    jobLocationType,
    applicantLocationRequirements,
    baseSalary,
    industry: 'Healthcare',
    occupationalCategory: '29-1171.00',
    directApply: true,
    identifier: {
      '@type': 'PropertyValue',
      name: 'PMHNP Hiring',
      value: job.id,
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
