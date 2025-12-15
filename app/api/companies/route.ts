import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { linkAllJobsToCompanies, mergeCompanies } from '@/lib/company-normalizer';

/**
 * GET /api/companies
 * Lists companies with their job counts
 * Query params: ?limit=50&sort=jobCount
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const sort = searchParams.get('sort') || 'jobCount';

    // Validate limit
    const validLimit = Math.min(Math.max(limit, 1), 500);

    // Determine sort order
    let orderBy: any = { jobCount: 'desc' };
    if (sort === 'name') {
      orderBy = { name: 'asc' };
    } else if (sort === 'createdAt') {
      orderBy = { createdAt: 'desc' };
    } else if (sort === 'verified') {
      orderBy = { isVerified: 'desc' };
    }

    // Query companies
    const companies = await prisma.company.findMany({
      take: validLimit,
      orderBy,
      select: {
        id: true,
        name: true,
        normalizedName: true,
        aliases: true,
        logoUrl: true,
        website: true,
        description: true,
        jobCount: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Get total count
    const totalCount = await prisma.company.count();

    return NextResponse.json({
      success: true,
      data: {
        companies,
        total: totalCount,
        limit: validLimit,
      },
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch companies',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies
 * Admin endpoint to manage companies
 * Actions: link-all, merge
 * Requires CRON_SECRET for authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'CRON_SECRET not configured',
        },
        { status: 500 }
      );
    }

    const providedSecret = authHeader?.replace('Bearer ', '');
    if (providedSecret !== cronSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { action, keepId, mergeId } = body;

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: 'Action is required',
        },
        { status: 400 }
      );
    }

    // Handle link-all action
    if (action === 'link-all') {
      console.log('Starting link-all-jobs-to-companies operation...');
      const result = await linkAllJobsToCompanies();

      return NextResponse.json({
        success: true,
        action: 'link-all',
        result: {
          processed: result.processed,
          linked: result.linked,
          companiesCreated: result.companiesCreated,
        },
      });
    }

    // Handle merge action
    if (action === 'merge') {
      if (!keepId || !mergeId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Both keepId and mergeId are required for merge action',
          },
          { status: 400 }
        );
      }

      console.log(`Merging company ${mergeId} into ${keepId}...`);
      await mergeCompanies(keepId, mergeId);

      return NextResponse.json({
        success: true,
        action: 'merge',
        result: {
          message: `Successfully merged company ${mergeId} into ${keepId}`,
          keepId,
          mergeId,
        },
      });
    }

    // Invalid action
    return NextResponse.json(
      {
        success: false,
        error: `Invalid action: ${action}. Must be 'link-all' or 'merge'`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in POST /api/companies:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process company operation',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

