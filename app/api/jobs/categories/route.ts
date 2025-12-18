import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

interface CategoryCounts {
  byMode: Record<string, number>;
  byJobType: Record<string, number>;
  byState: Record<string, number>;
  special: {
    highPaying: number;
    newThisWeek: number;
  };
}

// Extract state from location string (e.g., "San Francisco, CA" -> "California")
function extractState(location: string): string | null {
  const stateAbbreviations: Record<string, string> = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'Washington D.C.'
  };

  // Check for state abbreviation at end (e.g., ", CA" or " CA")
  const abbrevMatch = location.match(/[,\s]([A-Z]{2})$/);
  if (abbrevMatch && stateAbbreviations[abbrevMatch[1]]) {
    return stateAbbreviations[abbrevMatch[1]];
  }

  // Check if location contains full state name
  for (const [, fullName] of Object.entries(stateAbbreviations) as [string, string][]) {
    if (location.toLowerCase().includes(fullName.toLowerCase())) {
      return fullName;
    }
  }

  // Check for "Remote" locations
  if (location.toLowerCase().includes('remote')) {
    return null; // Don't count remote as a state
  }

  return null;
}

export async function GET() {
  try {
    // Get all published jobs with relevant fields
    const jobs = await prisma.job.findMany({
      where: { isPublished: true },
      select: {
        mode: true,
        jobType: true,
        location: true,
        minSalary: true,
        createdAt: true,
      },
    });

    // Initialize counts
    const byMode: Record<string, number> = {};
    const byJobType: Record<string, number> = {};
    const byState: Record<string, number> = {};
    let highPaying = 0;
    let newThisWeek = 0;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Count jobs by category
    for (const job of jobs) {
      // Count by mode
      if (job.mode) {
        byMode[job.mode] = (byMode[job.mode] || 0) + 1;
      }

      // Count by job type
      if (job.jobType) {
        byJobType[job.jobType] = (byJobType[job.jobType] || 0) + 1;
      }

      // Count by state
      if (job.location) {
        const state = extractState(job.location);
        if (state) {
          byState[state] = (byState[state] || 0) + 1;
        }
      }

      // Count high paying jobs (>= $150k)
      if (job.minSalary && job.minSalary >= 150000) {
        highPaying++;
      }

      // Count new jobs this week
      if (job.createdAt >= oneWeekAgo) {
        newThisWeek++;
      }
    }

    // Sort states by count and take top 10
    const sortedStates = Object.entries(byState)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .slice(0, 10);
    const topStates: Record<string, number> = {};
    for (const [state, count] of sortedStates as [string, number][]) {
      topStates[state] = count;
    }

    const response: CategoryCounts = {
      byMode,
      byJobType,
      byState: topStates,
      special: {
        highPaying,
        newThisWeek,
      },
    };

    return NextResponse.json(response, {
      headers: {
        // Cache for 5 minutes
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching job categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job categories' },
      { status: 500 }
    );
  }
}

