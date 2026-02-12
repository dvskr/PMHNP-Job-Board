import { Job } from '@/lib/types';
import { useMemo } from 'react';

interface JobStructuredDataProps {
  job: Job;
}

function mapJobType(jobType: string | null): string {
  const mapping: Record<string, string> = {
    'Full-Time': 'FULL_TIME',
    'Part-Time': 'PART_TIME',
    'Contract': 'CONTRACTOR',
    'Per Diem': 'PER_DIEM',
    'Temporary': 'TEMPORARY',
    'Internship': 'INTERN',
  };
  return mapping[jobType || ''] || 'FULL_TIME';
}

function createJobLocation(job: Job): object {
  if (job.isRemote) {
    return {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "US"
      }
    };
  }
  return {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": job.city || undefined,
      "addressRegion": job.stateCode || job.state || undefined,
      "addressCountry": "US"
    }
  };
}

export default function JobStructuredData({ job }: JobStructuredDataProps) {
  // Get current date once per render (memoized)
  const thirtyDaysFromNow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }, []);

  // Convert date strings to Date objects if needed (memoized to avoid recomputation)
  const datePosted = useMemo(() =>
    job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt),
    [job.createdAt]
  );

  const validThrough = useMemo(() =>
    job.expiresAt
      ? (job.expiresAt instanceof Date ? job.expiresAt : new Date(job.expiresAt))
      : thirtyDaysFromNow,
    [job.expiresAt, thirtyDaysFromNow]
  );

  const structuredData = {
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
    "jobLocation": createJobLocation(job),
    "baseSalary": job.normalizedMinSalary ? {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": {
        "@type": "QuantitativeValue",
        "minValue": job.normalizedMinSalary,
        "maxValue": job.normalizedMaxSalary || job.normalizedMinSalary,
        "unitText": "YEAR"
      }
    } : undefined,
    "directApply": true,
    "identifier": {
      "@type": "PropertyValue",
      "name": "PMHNP Hiring",
      "value": job.id
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

