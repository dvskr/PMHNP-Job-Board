import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TOP_EMPLOYERS } from '@/lib/aggregators/constants';
import { Prisma } from '@prisma/client';

// ─── State name lookup ───────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'District of Columbia',
};

// ─── Category definitions ────────────────────────────────────────────────────

type Category = 'highest_paying' | 'newest' | 'remote' | 'by_state' | 'high_salary' | 'part_time' | 'health_systems' | 'sign_on_bonus';

const VALID_CATEGORIES: Category[] = [
    'highest_paying', 'newest', 'remote', 'by_state',
    'high_salary', 'part_time', 'health_systems', 'sign_on_bonus',
];

const CATEGORY_LABELS: Record<Category, string> = {
    highest_paying: 'Highest Paying PMHNP Jobs This Week',
    newest: 'Newest PMHNP Jobs Posted Today',
    remote: 'Remote PMHNP Jobs',
    by_state: 'PMHNP Jobs in {state}',
    high_salary: '$200K+ PMHNP Jobs',
    part_time: 'Part-Time & PRN PMHNP Jobs',
    health_systems: 'PMHNP Jobs at Major Health Systems',
    sign_on_bonus: 'PMHNP Jobs with Sign-On Bonuses',
};

// Top 20 health systems for the health_systems query
const HEALTH_SYSTEM_NAMES = TOP_EMPLOYERS.slice(0, 20);

// Sign-on bonus keywords for text search
const SIGN_ON_KEYWORDS = ['sign-on bonus', 'signing bonus', 'sign on bonus', 'signon bonus', 'sign-on', 'signing bonus'];

// ─── Select fields ───────────────────────────────────────────────────────────

const JOB_SELECT = {
    id: true,
    title: true,
    employer: true,
    city: true,
    state: true,
    stateCode: true,
    normalizedMinSalary: true,
    normalizedMaxSalary: true,
    displaySalary: true,
    salaryRange: true,
    jobType: true,
    mode: true,
    isRemote: true,
    isHybrid: true,
    slug: true,
    createdAt: true,
    sourceProvider: true,
    description: true,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null, display: string | null, range: string | null): string {
    if (display) return display;
    if (range) return range;
    if (min && max) {
        const fMin = min >= 1000 ? `$${Math.round(min / 1000)}K` : `$${min}`;
        const fMax = max >= 1000 ? `$${Math.round(max / 1000)}K` : `$${max}`;
        return `${fMin} - ${fMax}`;
    }
    if (min) return `$${Math.round(min / 1000)}K+`;
    if (max) return `Up to $${Math.round(max / 1000)}K`;
    return 'Salary not disclosed';
}

function formatJobType(jobType: string | null): string {
    if (!jobType) return 'Full-Time';
    const map: Record<string, string> = {
        full_time: 'Full-Time', part_time: 'Part-Time', contract: 'Contract',
        per_diem: 'Per Diem', prn: 'PRN', travel: 'Travel', temporary: 'Temporary',
        internship: 'Internship', volunteer: 'Volunteer',
    };
    return map[jobType.toLowerCase()] || jobType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function remoteDisplay(isRemote: boolean, isHybrid: boolean): string {
    if (isRemote) return 'Remote';
    if (isHybrid) return 'Hybrid';
    return 'On-site';
}

function detectSignOnBonus(description: string): { has: boolean; amount: string | null } {
    const lower = description.toLowerCase();
    const has = SIGN_ON_KEYWORDS.some(kw => lower.includes(kw));
    if (!has) return { has: false, amount: null };

    // Try to extract amount
    const match = description.match(/\$[\d,]+\s*(?:sign[- ]?on|signing)\s*bonus/i)
        || description.match(/(?:sign[- ]?on|signing)\s*bonus\s*(?:of\s*)?\$[\d,]+/i);
    const amount = match ? match[0] : null;
    return { has: true, amount };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJob(job: any) {
    const signOn = detectSignOnBonus(job.description || '');
    return {
        id: job.id,
        title: job.title,
        company: job.employer,
        city: job.city || null,
        state: job.stateCode || job.state || null,
        state_full: STATE_NAMES[(job.stateCode || '').toUpperCase()] || job.state || null,
        salary_min: job.normalizedMinSalary || null,
        salary_max: job.normalizedMaxSalary || null,
        salary_display: formatSalary(job.normalizedMinSalary, job.normalizedMaxSalary, job.displaySalary, job.salaryRange),
        type: job.jobType || 'full_time',
        type_display: formatJobType(job.jobType),
        remote: job.isRemote,
        remote_display: remoteDisplay(job.isRemote, job.isHybrid),
        has_sign_on_bonus: signOn.has,
        sign_on_amount: signOn.amount,
        url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
        posted_date: job.createdAt ? new Date(job.createdAt).toISOString().split('T')[0] : null,
        source: job.sourceProvider || null,
    };
}

// ─── Query builders per category ─────────────────────────────────────────────

function buildQuery(category: Category, state: string | null, limit: number) {
    const baseWhere: Prisma.JobWhereInput = { isPublished: true };

    switch (category) {
        case 'highest_paying':
            return {
                where: { ...baseWhere, normalizedMaxSalary: { gt: 0 } },
                orderBy: { normalizedMaxSalary: 'desc' as const },
            };

        case 'newest':
            return {
                where: { ...baseWhere, createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
                orderBy: { createdAt: 'desc' as const },
            };

        case 'remote':
            return {
                where: { ...baseWhere, isRemote: true, normalizedMaxSalary: { gt: 0 } },
                orderBy: { normalizedMaxSalary: 'desc' as const },
            };

        case 'by_state':
            return {
                where: { ...baseWhere, stateCode: state?.toUpperCase() || 'CA' },
                orderBy: { normalizedMaxSalary: 'desc' as const },
            };

        case 'high_salary':
            return {
                where: { ...baseWhere, normalizedMinSalary: { gte: 200000 } },
                orderBy: { normalizedMaxSalary: 'desc' as const },
            };

        case 'part_time':
            return {
                where: { ...baseWhere, jobType: { in: ['part_time', 'per_diem', 'prn', 'contract'] } },
                orderBy: { normalizedMaxSalary: 'desc' as const },
            };

        case 'health_systems':
            return {
                where: {
                    ...baseWhere,
                    OR: HEALTH_SYSTEM_NAMES.map(name => ({
                        employer: { contains: name, mode: 'insensitive' as const },
                    })),
                },
                orderBy: { normalizedMaxSalary: 'desc' as const },
            };

        case 'sign_on_bonus':
            return {
                where: {
                    ...baseWhere,
                    OR: SIGN_ON_KEYWORDS.map(kw => ({
                        description: { contains: kw, mode: 'insensitive' as const },
                    })),
                },
                orderBy: { normalizedMaxSalary: 'desc' as const },
            };

        default:
            return {
                where: baseWhere,
                orderBy: { createdAt: 'desc' as const },
            };
    }
}

// ─── GET /api/jobs/featured ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    // Auth check — reuse BLOG_API_KEY
    const authHeader = request.headers.get('Authorization');
    const apiKey = process.env.BLOG_API_KEY;

    if (!apiKey) {
        return NextResponse.json(
            { error: 'BLOG_API_KEY not configured on server' },
            { status: 500 }
        );
    }

    const providedKey = authHeader?.replace('Bearer ', '');
    if (!providedKey || providedKey !== apiKey) {
        return NextResponse.json(
            { error: 'Unauthorized — invalid or missing API key' },
            { status: 401 }
        );
    }

    // Parse params
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as Category | null;
    const state = searchParams.get('state');
    const limitParam = parseInt(searchParams.get('limit') || '10', 10);
    const limit = Math.min(Math.max(limitParam, 1), 20);

    if (!category || !VALID_CATEGORIES.includes(category)) {
        return NextResponse.json(
            { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
            { status: 400 }
        );
    }

    if (category === 'by_state' && !state) {
        return NextResponse.json(
            { error: 'state parameter is required when category=by_state (e.g. state=CA)' },
            { status: 400 }
        );
    }

    try {
        const { where, orderBy } = buildQuery(category, state, limit);

        // Run count + fetch in parallel
        const [totalMatching, jobs] = await Promise.all([
            prisma.job.count({ where }),
            prisma.job.findMany({
                where,
                orderBy,
                take: limit,
                select: JOB_SELECT,
            }),
        ]);

        // Build label
        let label = CATEGORY_LABELS[category];
        if (category === 'by_state' && state) {
            const stateFull = STATE_NAMES[state.toUpperCase()] || state;
            label = label.replace('{state}', stateFull);
        }

        return NextResponse.json({
            category,
            category_label: label,
            total_matching: totalMatching,
            returned: jobs.length,
            generated_at: new Date().toISOString(),
            jobs: jobs.map(mapJob),
        });
    } catch (error) {
        console.error('[Featured Jobs API] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
