import { Job } from '@/lib/types';
import { slugify, canonicalSalaryPeriod, formatSalary, type SalaryPeriodKey } from '@/lib/utils';
import { jobSalaryText } from '@/lib/salary-display';
import { extractEligibleStates } from '@/lib/eligible-states';
import { STATE_CODE_TO_NAME } from '@/lib/us-states';
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

// Mirrors MAX_ELIGIBLE_STATES in lib/eligible-states.ts: a stored list this
// long is effectively nationwide, so the Country:US signal is more honest.
const MAX_ELIGIBLE_STATES = 40;

interface JobStructuredDataProps {
  // The two structured arrays are optional (string[] | undefined) so callers
  // whose Job shape predates the columns still compile. They're accepted
  // both on the job object and as top-level props — the detail page fetches
  // them beside its lib/types Job shape and passes them separately.
  job: Job & {
    eligibleStateCodes?: string[];
    jobTypes?: string[];
  };
  eligibleStateCodes?: string[];
  jobTypes?: string[];
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
  const salary = jobSalaryText(job) || formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
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

export default function JobStructuredData({ job, eligibleStateCodes, jobTypes }: JobStructuredDataProps) {
  // Top-level props win over job fields; both fall back to [] for rows
  // (or callers) that predate the columns.
  const storedEligibleCodes = eligibleStateCodes ?? job.eligibleStateCodes ?? [];
  const storedJobTypes = jobTypes ?? job.jobTypes ?? [];
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

  // No-location fallback (audit 2026-08 C4): a JobPosting with NEITHER
  // jobLocation NOR jobLocationType is hard-ineligible for Google Jobs.
  // When city/state never parsed, fall back to a country-level Place —
  // honest (this is a US-only board; the code already asserts US for every
  // parsed address) and keeps the posting eligible, at worst with an
  // "address incomplete" warning instead of outright ineligibility.
  const physicalJobLocation = {
    '@type': 'Place',
    address: stripUndefined({
      '@type': 'PostalAddress',
      addressLocality,
      addressRegion,
      addressCountry: 'US',
    }),
  };

  // Remote-only jobs: drop physical jobLocation entirely, emit TELECOMMUTE.
  // Hybrid and in-person: physical jobLocation, never TELECOMMUTE — Google's
  // policy explicitly forbids TELECOMMUTE for hybrid/occasional-WFH roles.
  // (The old degraded-hybrid branch emitted TELECOMMUTE when the address
  // failed to parse; the country-level fallback above replaces that policy
  // violation with a compliant location signal.)
  const treatAsRemote = isFullyRemote;
  const jobLocation = treatAsRemote ? undefined : physicalJobLocation;
  const jobLocationType = treatAsRemote ? 'TELECOMMUTE' : undefined;
  // Remote reach: nationwide (Country:US) by default, narrowed to a state
  // list ONLY when the job carries a candidate-facing restriction. The
  // stored eligibleStateCodes column (populated at ingest / backfill) wins
  // when present; rows the backfill hasn't touched fall back to render-time
  // description extraction ("must be licensed in Texas and Florida", "open
  // only to residents of ..."). Country:US on a restricted job advertises
  // it to candidates who cannot take it. extractEligibleStates is
  // deliberately conservative (precision over recall): employer-side
  // phrasing like "we are licensed in 42 states" and lists long enough to
  // be effectively nationwide both keep the country-level signal.
  // job.state alone is NOT a restriction — it may just be the employer's HQ.
  const storedEligibleNames = storedEligibleCodes
    .map((code) => STATE_CODE_TO_NAME[code])
    .filter((name): name is string => !!name);
  const eligibleStates = treatAsRemote
    ? storedEligibleNames.length > 0 && storedEligibleNames.length <= MAX_ELIGIBLE_STATES
      ? storedEligibleNames
      : extractEligibleStates(job.description || '')
    : [];
  const applicantLocationRequirements = treatAsRemote
    ? eligibleStates.length > 0
      ? eligibleStates.map((name) => ({ '@type': 'State', name }))
      : { '@type': 'Country', name: 'US' }
    : undefined;

  // Salary invariant (rev 2026-08): the schema numbers always mirror the
  // string the card/header display (jobSalaryText). Displayed strings are
  // derived from the NORMALIZED pair (displaySalary is written from it via
  // formatDisplaySalary), so when that pair exists the schema derives its
  // values from the same pair, converted back to the native unit exactly as
  // formatDisplaySalary converts: hourly = Math.round(normalized / 2080),
  // every other period stays annualized under YEAR. Raw minSalary/maxSalary
  // in their native unit are used ONLY when the normalized pair was never
  // stored. Emitting raw values first paired the schema with numbers no
  // visible surface showed whenever raw and normalized drifted apart.
  // The canonical period key is shared with formatSalary in lib/utils.ts so
  // UI and schema can never branch differently on the same DB value.
  const periodKey = canonicalSalaryPeriod(job.salaryPeriod);
  const hasNormalized = job.normalizedMinSalary != null || job.normalizedMaxSalary != null;
  // Same divisor formatDisplaySalary uses (40 hrs x 52 weeks).
  const HOURS_PER_YEAR = 2080;
  const fromNormalized = (v: number | null): number | null =>
    v == null ? null : periodKey === 'hourly' ? Math.round(v / HOURS_PER_YEAR) : v;
  const unitText: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' = hasNormalized
    ? (periodKey === 'hourly' ? 'HOUR' : 'YEAR')
    : (periodKey !== 'annual' ? SCHEMA_UNIT_TEXT[periodKey] : 'YEAR');
  const minForSchema = hasNormalized ? fromNormalized(job.normalizedMinSalary) : job.minSalary;
  const maxForSchema = hasNormalized ? fromNormalized(job.normalizedMaxSalary) : job.maxSalary;

  // Biweekly → weekly is the only period pair needing arithmetic (÷2,
  // exact); it can only occur on the raw-value fallback path.
  const toSchemaUnit = (v: number | null | undefined): number | undefined =>
    v == null ? undefined : !hasNormalized && periodKey === 'biweekly' ? v / 2 : v;

  // Google's documented QuantitativeValue shapes are a single `value` or a
  // `minValue`+`maxValue` range. With only one bound (or min === max) emit
  // `value` — the old code emitted a maxValue-only pseudo-range when
  // minSalary was null, which matches neither shape.
  const isRange = minForSchema != null && maxForSchema != null && minForSchema !== maxForSchema;
  // Honesty guard (audit 2026-08 C4): salaryIsEstimated marks values our own
  // pipeline inferred rather than figures the employer advertised. baseSalary
  // in JobPosting schema represents the actual offer, so publishing an
  // estimate there fabricates an offer in Google Jobs — omit it instead.
  // (lib/salary-report/stats.ts quarantines the same rows from salary stats
  // for the same reason.)
  const baseSalary = !job.salaryIsEstimated && (minForSchema != null || maxForSchema != null)
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

  // Google accepts an ARRAY of employmentType values. The stored jobTypes
  // column (every schedule the posting offers, primary first) wins when it
  // carries 2+ entries; each maps through the same canonical table and the
  // result is deduped (Per Diem and PRN both map to PER_DIEM). Rows the
  // backfill hasn't touched fall back to render-time title-combo detection:
  // titles like "PMHNP (Full-Time or Part-Time)" advertise both schedules
  // while the single-valued jobType column can only store one of them.
  const storedEmploymentTypes = storedJobTypes.length >= 2
    ? [...new Set(
        storedJobTypes
          .map((t) => mapJobType(t))
          .filter((t): t is string => t !== undefined),
      )]
    : [];
  const titleOffersBothSchedules =
    /full[- ]?time/i.test(job.title) && /part[- ]?time/i.test(job.title);
  const employmentType = storedEmploymentTypes.length >= 2
    ? storedEmploymentTypes
    : titleOffersBothSchedules
      ? ['FULL_TIME', 'PART_TIME']
      : mapJobType(job.jobType);

  const structuredData = stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description,
    url: canonicalUrl,
    datePosted: datePosted.toISOString(),
    validThrough: validThrough.toISOString(),
    employmentType,
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
