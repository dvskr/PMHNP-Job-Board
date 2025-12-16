import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
  } catch (error: any) {
    console.error('Error fetching outreach data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch outreach data',
        details: error.message,
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
        companyName,
        contactName,
        contactEmail,
        website,
        source,
        notes,
      });

      return NextResponse.json({ success: true, data: lead });
    }

    // Update lead status
    if (action === 'update') {
      const { id, status, notes } = body;

      if (!id || !status) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required fields: id and status',
          },
          { status: 400 }
        );
      }

      await updateLeadStatus(id, status, notes);

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
  } catch (error: any) {
    console.error('Error processing outreach request:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process outreach request',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

