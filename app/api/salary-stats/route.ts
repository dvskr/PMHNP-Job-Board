import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

interface SalaryByState {
  state: string;
  avgSalary: number;
  jobCount: number;
}

interface SalaryByMode {
  mode: string;
  avgSalary: number;
  jobCount: number;
}

interface TopEmployer {
  employer: string;
  minSalary: number;
  maxSalary: number;
  avgSalary: number;
  location: string;
  jobCount: number;
}

function extractState(location: string): string {
  // Common state abbreviations
  const stateAbbreviations = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];

  const stateNames: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
  };

  const upperLocation = location.toUpperCase();
  const lowerLocation = location.toLowerCase();

  // Check for state abbreviation
  for (const abbr of stateAbbreviations) {
    if (upperLocation.includes(abbr) && 
        (upperLocation.includes(`, ${abbr}`) || 
         upperLocation.includes(` ${abbr}`) ||
         upperLocation.endsWith(abbr))) {
      return abbr;
    }
  }

  // Check for full state name
  for (const [name, abbr] of Object.entries(stateNames)) {
    if (lowerLocation.includes(name)) {
      return abbr;
    }
  }

  // Check for Remote
  if (lowerLocation.includes('remote')) {
    return 'Remote';
  }

  return 'Other';
}

export async function GET() {
  try {
    // Fetch all published jobs with salary data
    const jobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        OR: [
          { minSalary: { not: null } },
          { maxSalary: { not: null } },
        ],
      },
      select: {
        id: true,
        employer: true,
        location: true,
        mode: true,
        minSalary: true,
        maxSalary: true,
      },
    });

    // Calculate overall average
    let totalSalary = 0;
    let salaryCount = 0;
    
    jobs.forEach((job) => {
      if (job.minSalary || job.maxSalary) {
        const avg = job.minSalary && job.maxSalary 
          ? (job.minSalary + job.maxSalary) / 2 
          : (job.minSalary || job.maxSalary)!;
        totalSalary += avg;
        salaryCount++;
      }
    });

    const overallAverage = salaryCount > 0 ? Math.round(totalSalary / salaryCount) : 0;

    // Calculate by state
    const stateMap = new Map<string, { total: number; count: number }>();
    jobs.forEach((job) => {
      const state = extractState(job.location);
      const avg = job.minSalary && job.maxSalary 
        ? (job.minSalary + job.maxSalary) / 2 
        : (job.minSalary || job.maxSalary)!;
      
      const current = stateMap.get(state) || { total: 0, count: 0 };
      stateMap.set(state, { total: current.total + avg, count: current.count + 1 });
    });

    const salaryByState: SalaryByState[] = Array.from(stateMap.entries())
      .map(([state, data]) => ({
        state,
        avgSalary: Math.round(data.total / data.count),
        jobCount: data.count,
      }))
      .sort((a, b) => b.avgSalary - a.avgSalary)
      .slice(0, 10);

    // Calculate by mode
    const modeMap = new Map<string, { total: number; count: number }>();
    jobs.forEach((job) => {
      const mode = job.mode || 'Not Specified';
      const avg = job.minSalary && job.maxSalary 
        ? (job.minSalary + job.maxSalary) / 2 
        : (job.minSalary || job.maxSalary)!;
      
      const current = modeMap.get(mode) || { total: 0, count: 0 };
      modeMap.set(mode, { total: current.total + avg, count: current.count + 1 });
    });

    const salaryByMode: SalaryByMode[] = Array.from(modeMap.entries())
      .map(([mode, data]) => ({
        mode,
        avgSalary: Math.round(data.total / data.count),
        jobCount: data.count,
      }))
      .sort((a, b) => b.avgSalary - a.avgSalary);

    // Calculate top employers
    const employerMap = new Map<string, { 
      minSalary: number; 
      maxSalary: number; 
      total: number; 
      count: number;
      location: string;
    }>();
    
    jobs.forEach((job) => {
      const current = employerMap.get(job.employer);
      const jobMin = job.minSalary || job.maxSalary || 0;
      const jobMax = job.maxSalary || job.minSalary || 0;
      const avg = (jobMin + jobMax) / 2;
      
      if (current) {
        employerMap.set(job.employer, {
          minSalary: Math.min(current.minSalary, jobMin),
          maxSalary: Math.max(current.maxSalary, jobMax),
          total: current.total + avg,
          count: current.count + 1,
          location: current.location,
        });
      } else {
        employerMap.set(job.employer, {
          minSalary: jobMin,
          maxSalary: jobMax,
          total: avg,
          count: 1,
          location: job.location,
        });
      }
    });

    const topEmployers: TopEmployer[] = Array.from(employerMap.entries())
      .map(([employer, data]) => ({
        employer,
        minSalary: data.minSalary,
        maxSalary: data.maxSalary,
        avgSalary: Math.round(data.total / data.count),
        location: data.location,
        jobCount: data.count,
      }))
      .sort((a, b) => b.avgSalary - a.avgSalary)
      .slice(0, 5);

    return NextResponse.json({
      overallAverage,
      totalJobsWithSalary: salaryCount,
      salaryByState,
      salaryByMode,
      topEmployers,
    });
  } catch (error) {
    console.error('Error fetching salary stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch salary stats' },
      { status: 500 }
    );
  }
}

