import { Job } from '@/lib/types';
import { slugify, canonicalSalaryPeriod, formatSalary, type SalaryPeriodKey } from '@/lib/utils';
import { jsonLdString } from '@/lib/seo/json-ld';

function mapJobType(jobType: string | null): string | undefined {
  // Keys mirror the canonical taxonomy in lib/job-normalizer.ts. Unknown or
  // null jobType OMITS employmentType (recommended, not required) — the old
  // `|| 'FULL_TIME'` default actively mislabeled PRN and Locum Tenens
  // postings as full-time in Google Jobs.
  const mapping: Record<string, string> = {
    'Full-Time': 'FULL_TIME',
    'Part-Time': 'PART_TIME',
    'Contract': 'CONTRACTOR',
    'Per Diem': 'PER_DIEM',
    'PRN': 'PER_DIEM',
    'Locum Tenens': 'TEMPORARY',
    'Travel': 'TEMPORARY',
    'Temporary': 'TEMPORARY',
    'Internship': 'INTERN',
  };
  return jobType ? mapping[jobType] : undefined;
}

// Schema.org accepts: HOUR, DAY, WEEK, MONTH, YEAR. We share the canonical
// period key with formatSalary so the UI and schema never disagree on whether
// a posting is hourly vs annual.
const SCHEMA_UNIT_TEXT: Record<SalaryPeriodKey, 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'> = {
  hourly: 'HOUR',
  daily: 'DAY',
  weekly: 'WEEK',
  // Schema.org has no native 'biweekly'. A biweekly amount ÷ 2 is an exact
  // weekly figure, so report WEEK and halve the values at the baseSalary
  // build site. (The old clamp-to-MONTH kept the raw amount, understating
  // pay by ~2.17×.)
  biweekly: 'WEEK',
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
 * Google wants `description` as the full job description in HTML.
 * Employer-posted (Quill) jobs already store HTML; aggregator jobs store
 * plain text that the visible page reflows into paragraphs — mirror the
 * paragraph structure here so the schema doesn't collapse into one
 * unbroken wall of text.
 */
function toHtmlDescription(raw: string): string {
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((para) => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
    .filter((para) => para !== '<p></p>')
    .join('');
}

/**
 * Last-resort description for jobs with no stored text at all: an honest
 * multi-paragraph summary built only from real fields — never fabricated
 * copy. Replaces the old single-line "{title} position at {employer}"
 * string, which fell short of Google's "full description" requirement.
 */
function fallbackDescription(job: Job): string {
  // filter(Boolean) so a city with no state fields can't render "Austin, null".
  const location = job.city
    ? [job.city, job.stateCode || job.state].filter(Boolean).join(', ')
    : job.state || null;
  const setting = job.isRemote && !job.isHybrid
    ? 'This is a remote (telehealth) position open to US-based candidates.'
    : location
      ? `This position is located in ${location}.`
      : null;
  const salary = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
  return [
    `<p>${job.employer} is hiring a ${job.title}.</p>`,
    setting ? `<p>${setting}</p>` : null,
    job.jobType ? `<p>Position type: ${job.jobType}.</p>` : null,
    salary ? `<p>Advertised pay: ${salary}.</p>` : null,
    '<p>See the full listing on PMHNP Hiring for role details and application instructions.</p>',
  ].filter(Boolean).join('');
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

  // GSC Fix: Guard against empty/whitespace description — fallback chain.
  const rawDescription = (job.description && job.description.trim())
    || (job.descriptionSummary && job.descriptionSummary.trim())
    || '';
  const description = rawDescription
    ? toHtmlDescription(rawDescription)
    : fallbackDescription(job);

  // SEO Fix #2: schema URL must match the canonical resolver. Live route reads
  // the trailing UUID and renders any prefix, but Google penalizes URL/canonical
  // mismatches. The DB-stored job.slug can drift from current slugify() output
  // when titles contain '/', '&', or other punctuation — generate the slug from
  // the same source the page uses so schema URL == <link rel=canonical>.
  const canonicalSlug = job.slug || slugify(job.title, job.id);
  const canonicalUrl = `https://pmhnphiring.com/jobs/${canonicalSlug}`;

  // SEO Fix #1 (rev 2026-07): location semantics for remote / hybrid / in-person.
  // Google's policy: jobLocationType TELECOMMUTE is ONLY for 100%-remote
  // roles — the docs explicitly forbid it for hybrid/occasional-WFH jobs.
  //   - Remote-only       → omit jobLocation, set jobLocationType TELECOMMUTE
  //                          + applicantLocationRequirements
  //   - Hybrid            → physical jobLocation ONLY (no TELECOMMUTE)
  //   - In-person / null  → physical jobLocation only
  const isFullyRemote = !!job.isRemote && !job.isHybrid;
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
  // Hybrid: physical jobLocation, no TELECOMMUTE (per Google policy above).
  // Degraded hybrid (no parsable address): a JobPosting with NEITHER
  // jobLocation NOR TELECOMMUTE is ineligible outright, so fall back to
  // TELECOMMUTE — the only representable signal for a partly-remote role.
  const treatAsRemote = isFullyRemote || (!!job.isHybrid && !hasPhysicalLocation);
  const jobLocation = treatAsRemote ? undefined : physicalJobLocation;
  const jobLocationType = treatAsRemote ? 'TELECOMMUTE' : undefined;
  // Country-level on purpose: the DB doesn't record whether job.state on a
  // remote posting means a licensure restriction or just the employer's HQ,
  // so a state-level requirement would wrongly shrink reach for nationwide
  // roles. Revisit only if a licensure-restriction signal is ever stored.
  const applicantLocationRequirements = treatAsRemote
    ? { '@type': 'Country', name: 'US' }
    : undefined;

  // SEO Fix #3: emit salary in its NATIVE unit. Previously we always pushed
  // normalizedMin/Max (annualized) with unitText: 'YEAR' even when the source
  // posting was hourly, producing UI ($175/hr) ≠ schema ($364k/yr) mismatches.
  // For non-annual periods, prefer the raw minSalary/maxSalary (original unit).
  // The canonical period key is shared with formatSalary in lib/utils.ts so
  // UI and schema can never branch differently on the same DB value.
  const periodKey = canonicalSalaryPeriod(job.salaryPeriod);
  // A non-annual posting whose raw min/max were never stored only has the
  // ANNUALIZED normalized pair. Falling back to those under an hourly/weekly
  // unitText would pair an annual number with a sub-annual unit (e.g.
  // "$176,800/hr"), so in that case emit the normalized values as YEAR.
  const hasNativeValues = job.minSalary != null || job.maxSalary != null;
  const useNativeUnit = periodKey !== 'annual' && hasNativeValues;
  const unitText = useNativeUnit ? SCHEMA_UNIT_TEXT[periodKey] : 'YEAR';
  const minForSchema = useNativeUnit
    ? job.minSalary
    : (job.normalizedMinSalary != null ? job.normalizedMinSalary : job.minSalary);
  const maxForSchema = useNativeUnit
    ? job.maxSalary
    : (job.normalizedMaxSalary != null ? job.normalizedMaxSalary : job.maxSalary);

  // Biweekly → weekly is the only period pair needing arithmetic (÷2, exact).
  const toSchemaUnit = (v: number | null | undefined): number | undefined =>
    v == null ? undefined : useNativeUnit && periodKey === 'biweekly' ? v / 2 : v;

  // Google's documented QuantitativeValue shapes are a single `value` or a
  // `minValue`+`maxValue` range. With only one bound (or min === max) emit
  // `value` — the old code emitted a maxValue-only pseudo-range when
  // minSalary was null, which matches neither shape.
  const isRange = minForSchema != null && maxForSchema != null && minForSchema !== maxForSchema;
  const baseSalary = minForSchema != null || maxForSchema != null
    ? {
        '@type': 'MonetaryAmount',
        currency: 'USD',
        value: stripUndefined(
          isRange
            ? {
                '@type': 'QuantitativeValue',
                minValue: toSchemaUnit(minForSchema),
                maxValue: toSchemaUnit(maxForSchema),
                unitText,
              }
            : {
                '@type': 'QuantitativeValue',
                value: toSchemaUnit(minForSchema ?? maxForSchema),
                unitText,
              }
        ),
      }
    : undefined;

  // Phase 1 #13 — surface structured experience requirements to Google Jobs.
  //   - minYearsExperience  → monthsOfExperience (× 12)
  //   - newGradFriendly     → monthsOfExperience: 0
  // experienceInPlaceOfEducation is deliberately NOT emitted: Google requires
  // educationRequirements alongside it when true, and a PMHNP role can never
  // waive the graduate degree anyway.
  // When both fields are null we omit the entire block so Google doesn't
  // see an empty container (lint-flagged in Rich Results Test).
  const months =
    typeof job.minYearsExperience === 'number' && job.minYearsExperience > 0
      ? job.minYearsExperience * 12
      : undefined;
  const experienceRequirements =
    months !== undefined
      ? stripUndefined({
          '@type': 'OccupationalExperienceRequirements',
          monthsOfExperience: months,
        })
      : job.newGradFriendly
        ? stripUndefined({
            '@type': 'OccupationalExperienceRequirements',
            monthsOfExperience: 0,
          })
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
    experienceRequirements,
    industry: 'Healthcare',
    // O*NET-SOC code with its label, per Google's documented format
    // (e.g. "15-1252.00 - Software Developers").
    occupationalCategory: '29-1171.00 - Nurse Practitioners',
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
      dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
    />
  );
}
