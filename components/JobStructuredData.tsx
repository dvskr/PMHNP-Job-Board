import { Job } from '@prisma/client';

interface JobStructuredDataProps {
  job: Job;
  baseUrl: string;
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

export default function JobStructuredData({ job, baseUrl }: JobStructuredDataProps) {
  // Convert date strings to Date objects if needed
  const datePosted = job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt);
  const validThrough = job.expiresAt 
    ? (job.expiresAt instanceof Date ? job.expiresAt : new Date(job.expiresAt))
    : new Date(Date.now() + 30*24*60*60*1000);

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
      "sameAs": job.companyWebsite || undefined,
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
      "name": "PMHNP Jobs",
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

