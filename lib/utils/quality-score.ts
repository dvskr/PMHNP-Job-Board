/**
 * Quality Score Computation
 * 
 * Computes a 0–100 quality score for a job listing based on:
 * - Link quality (direct ATS vs job board redirect)
 * - Salary data presence
 * - Description completeness
 * - Location specificity
 * - Employer-posted (premium) status
 * 
 * Score is computed at ingestion and stored in the DB for zero-cost sorting.
 */

// Direct ATS platforms — best apply experience (one click to employer form)
const DIRECT_ATS_DOMAINS = [
    'boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com',
    'myworkdayjobs.com', 'myworkdaysite.com', 'careers.icims.com',
    'bamboohr.com', 'breezy.hr', 'workable.com', 'recruitee.com',
    'jazz.co', 'jobvite.com', 'smartrecruiters.com', 'paylocity.com',
    'paycomonline.net', 'ultipro.com', 'clearcompany.com',
    'applytojob.com', 'pinpointhq.com', 'usajobs.gov',
    'governmentjobs.com', 'healthcaresource.com', 'dayforce.com',
];

// Job board / aggregator domains — worst experience (redirect + extra clicks)
const JOB_BOARD_DOMAINS = [
    'indeed.com', 'ziprecruiter.com', 'linkedin.com', 'glassdoor.com',
    'monster.com', 'simplyhired.com', 'snagajob.com', 'talent.com',
    'lensa.com', 'ladders.com', 'bebee.com', 'learn4good.com',
    'doccafe.com', 'practicematch.com', 'docjobs.com', 'doximity.com',
    'jobrapido.com', 'whatjobs.com', 'teal.com', 'career.io',
    'gothamenterprises.com', 'jooble.org', 'adzuna.com',
    'localjobs.com', 'enpnetwork.com', 'jobtarget.com', 'getwork.com',
    'tealhq.com', 'jobilize.com', 'rapidapi.com',
];

function getHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function isDirectAtsLink(url: string): boolean {
    const hostname = getHostname(url);
    return DIRECT_ATS_DOMAINS.some(d => hostname.includes(d));
}

function isJobBoardLink(url: string): boolean {
    const hostname = getHostname(url);
    return JOB_BOARD_DOMAINS.some(d => hostname.includes(d));
}

export interface QualityScoreInput {
    applyLink: string;
    displaySalary?: string | null;
    normalizedMinSalary?: number | null;
    normalizedMaxSalary?: number | null;
    descriptionSummary?: string | null;
    description?: string | null;
    city?: string | null;
    state?: string | null;
    isEmployerPosted?: boolean;  // true if submitted via employer form (has EmployerJob record)
}

/**
 * Compute a 0–100 quality score for a job listing.
 * 
 * Scoring breakdown:
 *   Link quality:    0–30 pts
 *   Salary data:     0–20 pts
 *   Description:     0–10 pts
 *   Location:        0–10 pts
 *   Employer-posted: 0–30 pts  (ensures form-submitted jobs always rank top)
 *   
 * Total possible: 100
 */
export function computeQualityScore(input: QualityScoreInput): number {
    let score = 0;

    // ── Link Quality (0–30) ──
    if (isDirectAtsLink(input.applyLink)) {
        score += 30;
    } else if (!isJobBoardLink(input.applyLink)) {
        // Non-ATS, non-job-board = likely employer career page
        score += 20;
    }
    // Job board links get +0

    // ── Salary Data (0–20) ──
    const hasSalary = !!(input.displaySalary || input.normalizedMinSalary || input.normalizedMaxSalary);
    if (hasSalary) {
        score += 20;
    }

    // ── Description Quality (0–10) ──
    if (input.descriptionSummary && input.descriptionSummary.length > 20) {
        score += 10;
    } else if (input.description && input.description.length > 200) {
        score += 5;
    }

    // ── Location Specificity (0–10) ──
    if (input.city && input.state) {
        score += 10;
    } else if (input.state) {
        score += 5;
    }

    // ── Employer-Posted (0–30) ──
    // Jobs submitted through our employer form get maximum boost
    // This ensures they ALWAYS appear above aggregated jobs
    if (input.isEmployerPosted) {
        score += 30;
    }

    return Math.min(score, 100);
}
