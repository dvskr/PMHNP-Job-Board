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
    applyLink: string | null;
    displaySalary?: string | null;
    normalizedMinSalary?: number | null;
    normalizedMaxSalary?: number | null;
    descriptionSummary?: string | null;
    description?: string | null;
    city?: string | null;
    state?: string | null;
    isEmployerPosted?: boolean;  // true if submitted via employer form (has EmployerJob record)
    originalPostedAt?: Date | null;  // for freshness scoring
    createdAt?: Date | null;         // fallback for freshness scoring
}

/**
 * Compute a 0–100 quality score for a job listing.
 * 
 * Scoring breakdown:
 *   Link quality:    0–30 pts  (direct ATS vs redirect)
 *   Salary data:     0–20 pts  (graduated by completeness)
 *   Description:     0–10 pts  (graduated by length/quality)
 *   Location:        0–10 pts  (city+state vs state-only)
 *   Freshness:       0–20 pts  (age-based decay)
 *   Employer-posted: 0–30 pts  (ensures form-submitted jobs always rank top)
 *   
 * Total possible: 120, clamped to 100
 */
export function computeQualityScore(input: QualityScoreInput): number {
    let score = 0;

    // ── Link Quality (0–30) ──
    if (input.applyLink && isDirectAtsLink(input.applyLink)) {
        score += 30;
    } else if (input.applyLink && !isJobBoardLink(input.applyLink)) {
        // Non-ATS, non-job-board = likely employer career page
        score += 20;
    }
    // Job board links get +0

    // ── Salary Data (0–20) — graduated ──
    const hasMin = !!(input.normalizedMinSalary && input.normalizedMinSalary > 0);
    const hasMax = !!(input.normalizedMaxSalary && input.normalizedMaxSalary > 0);
    const hasDisplay = !!(input.displaySalary && input.displaySalary.length > 0);

    if (hasMin && hasMax) {
        score += 20;  // Full range — best
    } else if (hasMin || hasMax) {
        score += 15;  // Partial range
    } else if (hasDisplay) {
        score += 10;  // Display string only (text-extracted, lower confidence)
    }
    // No salary = +0

    // ── Description Quality (0–10) — graduated ──
    const descLen = input.description?.length || 0;
    const summaryLen = input.descriptionSummary?.length || 0;
    const effectiveLen = Math.max(descLen, summaryLen);

    if (effectiveLen > 1000) {
        score += 10;  // Rich, detailed description
    } else if (effectiveLen > 500) {
        score += 7;   // Good description
    } else if (effectiveLen > 200) {
        score += 5;   // Basic description
    } else if (effectiveLen > 50) {
        score += 2;   // Stub
    }
    // Empty/tiny = +0

    // ── Location Specificity (0–10) ──
    if (input.city && input.state) {
        score += 10;
    } else if (input.state) {
        score += 5;
    }

    // ── Freshness (0–20) — age-based decay ──
    const refDate = input.originalPostedAt || input.createdAt;
    if (refDate) {
        const ageMs = Date.now() - new Date(refDate).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        if (ageDays < 3) {
            score += 20;  // Fresh (< 3 days)
        } else if (ageDays < 7) {
            score += 15;  // Recent (< 7 days)
        } else if (ageDays < 14) {
            score += 10;  // Normal (< 14 days)
        } else if (ageDays < 45) {
            score += 5;   // Aging (< 45 days)
        }
        // Stale (> 45 days) = +0
    }

    // ── Employer-Posted (0–30) ──
    // Jobs submitted through our employer form get maximum boost
    // This ensures they ALWAYS appear above aggregated jobs
    if (input.isEmployerPosted) {
        score += 30;
    }

    return Math.min(score, 100);
}
