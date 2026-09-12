import { prisma } from '@/lib/prisma';
import { EmployerLead } from '@/lib/types';
import { config } from '@/lib/config';

/**
 * Outreach templates for the admin lead pipeline.
 *
 * These are employer-facing sales copy, so they follow the same rules as every
 * other pricing surface: the offer is read from lib/config.ts rather than typed
 * into the prose, and the refund promise appears only while
 * config.firstPostGuarantee is on. The pre-2026-09 versions offered a free
 * featured post, which checkout no longer honours.
 *
 * These are short marketing instances of the guarantee, so they carry the
 * sentence without the long-form definition of "applicant"; that definition
 * lives in the terms and on the surfaces that explain the guarantee at length.
 */

/** The paid-first offer, one sentence, always interpolated. */
const offerLine =
  `Your first post is $${config.firstPostPrice}, ${config.firstPostDiscountPercent()}% off the standard $${config.postingPrice}, and every post runs ${config.durationDays} days.`;

/** Empty when the guarantee is withdrawn, so no template promises a refund. */
const guaranteeParagraph = config.firstPostGuarantee
  ? `\n\nIf it does not bring you at least ${config.guaranteeMinApplicants} applicants in ${config.guaranteeWindowDays} days, we refund it in full.`
  : '';

/** Template keys, exported so the API route validates against this list. */
export const OUTREACH_TEMPLATE_NAMES = ['initial', 'followUp', 'firstPostOffer'] as const;

export type OutreachTemplateName = (typeof OUTREACH_TEMPLATE_NAMES)[number];

const TEMPLATES: Record<OutreachTemplateName, { subject: string; body: string }> = {
  initial: {
    subject: 'Reach qualified PMHNPs with {{companyName}}',
    body: `Hi {{contactName}},

I noticed {{companyName}} is hiring psychiatric nurse practitioners. I'm reaching out because we run PMHNP Hiring, the specialized job board for psychiatric mental health nurse practitioners.

Our audience is practitioners actively looking for their next role, so a listing here reaches people who are already qualified for it.

${offerLine}${guaranteeParagraph}

Would you be interested in posting your open positions? I'm happy to walk you through your first listing.

Best,
[Your name]
PMHNP Hiring

P.S. You can check out our site at pmhnphiring.com`
  },

  followUp: {
    subject: 'Following up: PMHNP job posting',
    body: `Hi {{contactName}},

Just following up on my previous email about posting your PMHNP positions on our job board.

${offerLine}${guaranteeParagraph}

Happy to answer any questions or set up a quick call.

Best,
[Your name]`
  },

  firstPostOffer: {
    subject: `${config.firstPostDiscountPercent()}% off the first PMHNP job post for {{companyName}}`,
    body: `Hi {{contactName}},

I'd like to get {{companyName}} in front of our audience of psychiatric nurse practitioners.

${offerLine} Every listing gets the same featured placement, candidate unlocks, and analytics.${guaranteeParagraph}

Reply with your job details and I'll help you get it live, or post directly at pmhnphiring.com/post-job

Best,
[Your name]`
  }
};

export function renderTemplate(
  templateName: OutreachTemplateName,
  variables: { companyName: string; contactName?: string }
): { subject: string; body: string } {
  const template = TEMPLATES[templateName];

  // Replace variables in subject and body
  let subject = template.subject;
  let body = template.body;

  // Replace {{companyName}}
  subject = subject.replace(/\{\{companyName\}\}/g, variables.companyName);
  body = body.replace(/\{\{companyName\}\}/g, variables.companyName);

  // Replace {{contactName}} with name or fallback to "there"
  const contactName = variables.contactName || 'there';
  subject = subject.replace(/\{\{contactName\}\}/g, contactName);
  body = body.replace(/\{\{contactName\}\}/g, contactName);

  return { subject, body };
}

export async function createEmployerLead(data: {
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  website?: string;
  source?: string;
  notes?: string;
}): Promise<EmployerLead> {
  const lead = await prisma.employerLead.create({
    data: {
      companyName: data.companyName,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      website: data.website,
      source: data.source,
      notes: data.notes,
      status: 'prospect',
    },
  });

  return lead;
}

export async function updateLeadStatus(
  leadId: string,
  status: string,
  notes?: string
): Promise<void> {
  const updateData: { status: string; notes?: string; contactedAt?: Date } = {
    status,
  };

  // Set contactedAt if status is 'contacted'
  if (status === 'contacted') {
    updateData.contactedAt = new Date();
  }

  // Append to notes if provided
  if (notes) {
    const existingLead = await prisma.employerLead.findUnique({
      where: { id: leadId },
      select: { notes: true },
    });

    const existingNotes = existingLead?.notes || '';
    const timestamp = new Date().toISOString();
    updateData.notes = existingNotes
      ? `${existingNotes}\n\n[${timestamp}] ${notes}`
      : `[${timestamp}] ${notes}`;
  }

  await prisma.employerLead.update({
    where: { id: leadId },
    data: updateData,
  });
}

export async function getLeadsDueForFollowUp(): Promise<EmployerLead[]> {
  const leads = await prisma.employerLead.findMany({
    where: {
      nextFollowUpAt: {
        lte: new Date(),
      },
    },
    orderBy: {
      nextFollowUpAt: 'asc',
    },
  });

  return leads;
}

export async function getLeadsByStatus(status: string): Promise<EmployerLead[]> {
  const leads = await prisma.employerLead.findMany({
    where: { status },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return leads;
}

export async function suggestTargetCompanies(): Promise<string[]> {
  // Get companies from jobs table that posted via external sources
  // Group by employer and count
  const companies = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      sourceType: 'external',
      isPublished: true,
    },
    _count: {
      employer: true,
    },
    having: {
      employer: {
        _count: {
          gte: 3, // 3+ job posts (actively hiring)
        },
      },
    },
    orderBy: {
      _count: {
        employer: 'desc',
      },
    },
    take: 50, // Get more initially to filter
  });

  // Get list of companies already in employer_leads
  const existingLeads = await prisma.employerLead.findMany({
    select: { companyName: true },
  });

  const existingCompanyNames = new Set(
    existingLeads.map((lead: { companyName: string }) => lead.companyName.toLowerCase())
  );

  // Filter out companies already in leads
  const suggestions = companies
    .filter((company: { employer: string; _count: { employer: number } }) => !existingCompanyNames.has(company.employer.toLowerCase()))
    .map((company: { employer: string; _count: { employer: number } }) => company.employer)
    .slice(0, 20); // Return top 20

  return suggestions;
}

