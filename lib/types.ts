/**
 * Shared type definitions for the application.
 * These mirror the Prisma schema but are defined locally to avoid
 * deployment issues with @prisma/client type exports.
 */

export interface Job {
  id: string;
  title: string;
  employer: string;
  location: string;
  jobType: string | null;
  mode: string | null;
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
  applyLink: string;
  isFeatured: boolean;
  isPublished: boolean;
  isVerifiedEmployer: boolean;
  sourceType: string | null;
  sourceProvider: string | null;
  externalId: string | null;
  viewCount: number;
  applyClickCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  companyId: string | null;
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

