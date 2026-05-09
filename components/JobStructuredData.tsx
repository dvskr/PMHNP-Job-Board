import { Job } from '@/lib/types';
import { slugify, canonicalSalaryPeriod, type SalaryPeriodKey } from '@/lib/utils';

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

// Schema.org accepts: HOUR, DAY, WEEK, MONTH, YEAR. We share the canonical
// period key with formatSalary so the UI and schema never disagree on whether
// a posting is hourly vs annual.
const SCHEMA_UNIT_TEXT: Record<SalaryPeriodKey, 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'> = {
  hourly: 'HOUR',
  daily: 'DAY',
  weekly: 'WEEK',
  // Schema.org has no native 'biweekly'; report as WEEK with x2 multiplier
  // would be confusing. Clamp to MONTH so Google bins it sensibly until we
  // gain a per-period baseSalary helper.
  biweekly: 'MONTH',
  monthly: 'MONTH',
  annual: 'YEAR',
};
function mapSalaryUnitText(period: string | null): 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' {
  return SCHEMA_UNIT_TEXT[canonicalSalaryPeriod(period)];
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
  // Note: streetAddress is intentionally omitted. Job listings don't include a
  // physical street, and previous code stuffed "City, ST" into streetAddress —
  // a semantic error per schema.org PostalAddress (those values belong in
  // addressLocality and addressRegion, which we already emit).

  const physicalJobLocation = hasPhysicalLocation
    ? {
        '@type': 'Place',
        address: stripUndefined({
          '@type': 'PostalAddress',
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
  // The canonical period key is shared with formatSalary in lib/utils.ts so
  // UI and schema can never branch differently on the same DB value.
  const periodKey = canonicalSalaryPeriod(job.salaryPeriod);
  const unitText = SCHEMA_UNIT_TEXT[periodKey];
  const minForSchema = periodKey === 'annual'
    ? (job.normalizedMinSalary != null ? job.normalizedMinSalary : job.minSalary)
    : (job.minSalary != null ? job.minSalary : job.normalizedMinSalary);
  const maxForSchema = periodKey === 'annual'
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
    hiringOrganization: stripUndefined({
      '@type': 'Organization',
      name: job.employer,
      // sameAs lets Google deduplicate employer entities across postings; logo
      // is what renders next to the listing in Google Jobs results.
      sameAs: job.companyWebsite || undefined,
      logo: job.companyLogoUrl || undefined,
    }),
    jobLocation,
    jobLocationType,
    applicantLocationRequirements,
    baseSalary,
    industry: 'Healthcare',
    occupationalCategory: '29-1171.00',
    // Only emit directApply when the application actually completes on this
    // page (in-platform ATS via applyOnPlatform). For employer-direct-link
    // and aggregator listings we omit — the apply flow leaves the URL.
    // Misclaiming directApply on off-site flows triggers Google Jobs demotion.
    ...(job.applyOnPlatform ? { directApply: true } : {}),
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
