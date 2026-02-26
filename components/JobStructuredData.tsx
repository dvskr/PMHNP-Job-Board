import { Job } from '@/lib/types';

interface JobStructuredDataProps {
  job: Job;
}

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

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const validThrough = job.expiresAt
    ? (job.expiresAt instanceof Date ? job.expiresAt : new Date(job.expiresAt))
    : thirtyDaysFromNow;

  const structuredData = stripUndefined({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description,
    "datePosted": datePosted.toISOString(),
    "validThrough": validThrough.toISOString(),
    "employmentType": mapJobType(job.jobType),
    "hiringOrganization": {
      "@type": "Organization",
      "name": job.employer,
    },
    "jobLocation": {
      "@type": "Place",
      "address": stripUndefined({
        "@type": "PostalAddress",
        "addressLocality": job.isRemote ? undefined : (job.city || undefined),
        "addressRegion": job.isRemote ? undefined : (job.stateCode || job.state || undefined),
        "addressCountry": "US",
      }),
    },
    // Remote-specific fields
    "jobLocationType": job.isRemote ? "TELECOMMUTE" : undefined,
    "applicantLocationRequirements": job.isRemote ? {
      "@type": "Country",
      "name": "US",
    } : undefined,
    // Salary
    "baseSalary": job.normalizedMinSalary ? {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": {
        "@type": "QuantitativeValue",
        "minValue": job.normalizedMinSalary,
        "maxValue": job.normalizedMaxSalary || job.normalizedMinSalary,
        "unitText": "YEAR",
      },
    } : undefined,
    // Healthcare-specific
    "industry": "Healthcare",
    "occupationalCategory": "29-1171.00",
    "directApply": true,
    "identifier": {
      "@type": "PropertyValue",
      "name": "PMHNP Hiring",
      "value": job.id,
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
