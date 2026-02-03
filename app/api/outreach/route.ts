import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sanitizeText, sanitizeEmail, sanitizeUrl } from '@/lib/sanitize';
import {
  suggestTargetCompanies,
  getLeadsByStatus,
  createEmployerLead,
  updateLeadStatus,
  renderTemplate,
} from '@/lib/outreach-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const suggestions = searchParams.get('suggestions');

    // Return suggested target companies
    if (suggestions === 'true') {
      const companies = await suggestTargetCompanies();
      return NextResponse.json({ success: true, data: companies });
    }

    // Return leads by status
    if (status) {
      const leads = await getLeadsByStatus(status);
      return NextResponse.json({ success: true, data: leads });
    }

    // Return all leads (default)
    const allLeads = await prisma.employerLead.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ success: true, data: allLeads });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching outreach data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch outreach data',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing action parameter',
        },
        { status: 400 }
      );
    }

    // Create new employer lead
    if (action === 'create') {
      const { companyName, contactName, contactEmail, website, source, notes } = body;

      const sanitizedCompanyName = sanitizeText(companyName || '', 100);
      const sanitizedContactName = contactName ? sanitizeText(contactName, 100) : undefined;
      const sanitizedContactEmail = contactEmail ? sanitizeEmail(contactEmail) : undefined;
      const sanitizedWebsite = website ? sanitizeUrl(website) : undefined;
      const sanitizedSource = source ? sanitizeText(source, 50) : undefined;
      const sanitizedNotes = notes ? sanitizeText(notes, 5000) : undefined;

      if (!companyName) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required field: companyName',
          },
          { status: 400 }
        );
      }

      const lead = await createEmployerLead({
        companyName: sanitizedCompanyName,
        contactName: sanitizedContactName,
        contactEmail: sanitizedContactEmail,
        website: sanitizedWebsite,
        source: sanitizedSource,
        notes: sanitizedNotes,
      });

      return NextResponse.json({ success: true, data: lead });
    }

    // Update lead status
    if (action === 'update') {
      const { id, status, notes } = body;
      const sanitizedNotes = notes ? sanitizeText(notes, 5000) : undefined;

      if (!id || !status) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required fields: id and status',
          },
          { status: 400 }
        );
      }

      await updateLeadStatus(id, status, sanitizedNotes);

      return NextResponse.json({
        success: true,
        message: 'Lead status updated successfully',
      });
    }

    // Render email template
    if (action === 'render-template') {
      const { templateName, variables } = body;

      if (!templateName || !variables || !variables.companyName) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required fields: templateName and variables.companyName',
          },
          { status: 400 }
        );
      }

      // Validate template name
      const validTemplates = ['initial', 'followUp', 'freeOffer'];
      if (!validTemplates.includes(templateName)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid template name. Valid options: ${validTemplates.join(', ')}`,
          },
          { status: 400 }
        );
      }

      const rendered = renderTemplate(templateName, variables);

      return NextResponse.json({ success: true, data: rendered });
    }

    // Invalid action
    return NextResponse.json(
      {
        success: false,
        error: `Invalid action. Valid options: create, update, render-template`,
      },
      { status: 400 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing outreach request:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process outreach request',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

