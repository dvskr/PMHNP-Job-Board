/**
 * Shared type definitions for the application.
 * These mirror the Prisma schema but are defined locally to avoid
 * deployment issues with @prisma/client type exports.
 */

export interface Job {
  id: string;
  title: string;
  slug?: string | null;
  employer: string;
  location: string;
  jobType: string | null;
  mode: string | null;
  // Legacy free-text level — frozen 2026-05-13, read-only fallback. New
  // writes go to the structured fields below. See docs/runbooks/ui-refresh-2026-05.md §1.
  experienceLevel: string | null;
  // Structured experience requirements. min/max in years (buckets 0,1,2,5,7,10).
  // experienceLabel is auto-derived from these three via lib/experience-label.ts.
  minYearsExperience: number | null;
  maxYearsExperience: number | null;
  newGradFriendly: boolean;
  experienceQualifier: string | null;
  experienceLabel: string | null;
  description: string;
  descriptionSummary: string | null;
  salaryRange: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  salaryPeriod: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  isRemote: boolean;
  isHybrid: boolean;
  normalizedMinSalary: number | null;
  normalizedMaxSalary: number | null;
  salaryIsEstimated: boolean;
  salaryConfidence: number | null;
  displaySalary: string | null;
  applyLink: string | null;
  applyOnPlatform: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  isVerifiedEmployer: boolean;
  sourceType: string | null;
  sourceProvider: string | null;
  sourceSite: string | null;
  externalId: string | null;
  originalPostedAt: Date | null;
  viewCount: number;
  applyClickCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  // Phase 3 #21 — employer-controlled refresh timestamp. Null = use
  // createdAt as the freshness anchor.
  lastRenewedAt?: Date | null;
  companyId: string | null;
  companyLogoUrl?: string | null;
  // Attached at fetch time via the employerJobs join (see app/jobs/[slug]/page.tsx).
  // Used by JobStructuredData to populate hiringOrganization.sameAs.
  companyWebsite?: string | null;
  // P9: precomputed canonical category tags. Populated at ingest by
  // lib/pseo/category-tagger.ts. Optional in this hand-written interface
  // so existing constructors compile; the underlying Prisma column is
  // non-null with `@default([])`.
  categoryTags?: string[];
}

export interface JobAlert {
  id: string;
  email: string;
  name: string | null;
  keyword: string | null;
  location: string | null;
  mode: string | null;
  jobType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  // Phase 5 experience filters (align with Phase 1 /jobs UI).
  newGradFriendly: boolean | null;
  minYearsExperience: number | null;
  frequency: string;
  isActive: boolean;
  lastSentAt: Date | null;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployerJob {
  id: string;
  employerName: string;
  contactEmail: string;
  companyLogoUrl: string | null;
  companyDescription: string | null;
  companyWebsite: string | null;
  jobId: string;
  editToken: string;
  dashboardToken: string;
  paymentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  expiryWarningSentAt: Date | null;
}

export interface EmployerLead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  website: string | null;
  linkedInUrl: string | null;
  notes: string | null;
  status: string;
  source: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  jobsPosted: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailLead {
  id: string;
  email: string;
  preferences: unknown;
  source: string | null;
  isSubscribed: boolean;
  unsubscribeToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Company {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  logoUrl: string | null;
  website: string | null;
  description: string | null;
  jobCount: number;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

