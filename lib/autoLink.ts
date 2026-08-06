/**
 * Auto Internal Linking System (A24)
 *
 * Scans text content and auto-links relevant keywords to internal pages.
 * This extends the existing `autoLinkStates()` pattern from lib/blog.ts
 * to cover job categories, employment types, and career resources.
 */

// Category keywords → internal page mappings
const CATEGORY_LINKS: { pattern: RegExp; href: string; label: string }[] = [
    // Employment types
    { pattern: /\b(remote\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/remote', label: 'remote PMHNP jobs' },
    { pattern: /\b(telehealth\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/telehealth', label: 'telehealth PMHNP jobs' },
    { pattern: /\b(travel\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/travel', label: 'travel PMHNP jobs' },
    { pattern: /\b(per\s*[-\s]?diem\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/per-diem', label: 'per diem PMHNP jobs' },
    { pattern: /\b(inpatient\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/inpatient', label: 'inpatient PMHNP jobs' },
    { pattern: /\b(outpatient\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/outpatient', label: 'outpatient PMHNP jobs' },

    // Specialties
    { pattern: /\b(new\s*[-\s]?grad\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/new-grad', label: 'new grad PMHNP jobs' },
    { pattern: /\b(child\s+(?:and\s+)?adolescent\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/child-adolescent', label: 'child & adolescent PMHNP jobs' },
    { pattern: /\b(substance\s+abuse\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/substance-abuse', label: 'substance abuse PMHNP jobs' },
    { pattern: /\b(addiction\s+(?:PMHNP|psychiatric|psych\s+NP)\s+(?:jobs?|positions?|opportunities?))\b/gi, href: '/jobs/addiction', label: 'addiction PMHNP jobs' },

    // Resources
    { pattern: /\b(PMHNP\s+salary\s+(?:guide|data|information|comparison))\b/gi, href: '/salary-guide', label: 'PMHNP salary guide' },
    { pattern: /\b(PMHNP\s+job\s+alerts?)\b/gi, href: '/job-alerts', label: 'PMHNP job alerts' },

    // Career tools (organic audit 2026-08 D7): /tools pages were orphaned —
    // zero blog posts linked them and no pattern here could. These phrases
    // already occur naturally in salary/negotiation/contract content.
    { pattern: /\b(offer\s+analyzer)\b/gi, href: '/tools/offer-analyzer', label: 'the PMHNP Offer Analyzer' },
    { pattern: /\b(salary\s+converter|hourly[-\s]to[-\s]annual\s+(?:calculator|converter|conversion))\b/gi, href: '/tools/salary-converter', label: 'the hourly to annual salary converter' },
    { pattern: /\b(1099\s+vs\.?\s+W-?2\s+(?:calculator|take[-\s]?home|comparison))\b/gi, href: '/tools/1099-vs-w2-calculator', label: 'the 1099 vs W-2 calculator' },
    { pattern: /\b(practice\s+authority\s+map)\b/gi, href: '/tools/practice-authority-map', label: 'the interactive practice authority map' },
    { pattern: /\b((?:free\s+)?PMHNP\s+career\s+tools)\b/gi, href: '/tools', label: 'free PMHNP career tools' },
];

// Link limit per article to avoid over-optimization
const MAX_LINKS_PER_CONTENT = 5;

/**
 * Auto-link category keywords in HTML content.
 * Skips content inside existing <a> tags, <code>, and headings.
 * Each pattern is linked at most once per content block.
 */
export function autoLinkCategories(html: string): string {
    let linksAdded = 0;
    let result = html;

    for (const { pattern, href, label } of CATEGORY_LINKS) {
        if (linksAdded >= MAX_LINKS_PER_CONTENT) break;

        // Reset regex state
        pattern.lastIndex = 0;

        // Only replace the first occurrence
        const match = pattern.exec(result);
        if (!match) continue;

        const matchIndex = match.index;

        // Check if this match is inside an existing tag (simplified check)
        const beforeMatch = result.slice(0, matchIndex);
        const openTags = (beforeMatch.match(/<a[\s>]/gi) || []).length;
        const closeTags = (beforeMatch.match(/<\/a>/gi) || []).length;
        if (openTags > closeTags) continue; // Inside an <a> tag

        // Check if inside <code> or <h1-h6>
        const lastOpenCode = beforeMatch.lastIndexOf('<code');
        const lastCloseCode = beforeMatch.lastIndexOf('</code>');
        if (lastOpenCode > lastCloseCode) continue;

        const lastOpenHeading = Math.max(
            beforeMatch.lastIndexOf('<h1'), beforeMatch.lastIndexOf('<h2'),
            beforeMatch.lastIndexOf('<h3'), beforeMatch.lastIndexOf('<h4'),
        );
        const lastCloseHeading = Math.max(
            beforeMatch.lastIndexOf('</h1>'), beforeMatch.lastIndexOf('</h2>'),
            beforeMatch.lastIndexOf('</h3>'), beforeMatch.lastIndexOf('</h4>'),
        );
        if (lastOpenHeading > lastCloseHeading) continue;

        // Replace this occurrence with an internal link
        const replacement = `<a href="${href}" class="text-teal-600 hover:underline font-medium" title="Browse ${label}">${match[0]}</a>`;

        result =
            result.slice(0, matchIndex) +
            replacement +
            result.slice(matchIndex + match[0].length);

        linksAdded++;
    }

    return result;
}

/**
 * Generate "Related Resources" links for a job page based on job attributes.
 * Returns an array of { label, href } objects for rendering.
 */
export function getJobRelatedResources(job: {
    state?: string | null;
    stateCode?: string | null;
    isRemote?: boolean | null;
    mode?: string | null;
    jobType?: string | null;
    title?: string;
}): { label: string; href: string }[] {
    const links: { label: string; href: string }[] = [];

    // State page
    if (job.state) {
        const stateSlug = job.state.toLowerCase().replace(/\s+/g, '-');
        links.push({
            label: `All PMHNP Jobs in ${job.state}`,
            href: `/jobs/state/${stateSlug}`,
        });
    }

    // Work mode
    if (job.isRemote) {
        links.push({ label: 'Remote PMHNP Jobs', href: '/jobs/remote' });
    }
    if (job.mode?.toLowerCase().includes('telehealth')) {
        links.push({ label: 'Telehealth PMHNP Jobs', href: '/jobs/telehealth' });
    }

    // Job type
    if (job.jobType?.toLowerCase() === 'per diem') {
        links.push({ label: 'Per Diem PMHNP Jobs', href: '/jobs/per-diem' });
    } else if (job.jobType?.toLowerCase() === 'travel') {
        links.push({ label: 'Travel PMHNP Jobs', href: '/jobs/travel' });
    }

    // Title-based specialties
    const titleLower = job.title?.toLowerCase() || '';
    if (titleLower.includes('new grad') || titleLower.includes('entry level')) {
        links.push({ label: 'New Grad PMHNP Jobs', href: '/jobs/new-grad' });
    }
    if (titleLower.includes('child') || titleLower.includes('adolescent') || titleLower.includes('pediatric')) {
        links.push({ label: 'Child & Adolescent PMHNP Jobs', href: '/jobs/child-adolescent' });
    }
    if (titleLower.includes('substance') || titleLower.includes('addiction')) {
        links.push({ label: 'Addiction PMHNP Jobs', href: '/jobs/addiction' });
    }
    if (titleLower.includes('inpatient')) {
        links.push({ label: 'Inpatient PMHNP Jobs', href: '/jobs/inpatient' });
    }
    if (titleLower.includes('outpatient')) {
        links.push({ label: 'Outpatient PMHNP Jobs', href: '/jobs/outpatient' });
    }

    // Career tools (organic audit 2026-08 D7): tools funnel from job-detail
    // surfaces. The Offer Analyzer is universally relevant (every job page
    // is an offer-evaluation moment); the converter and 1099 calculator
    // attach only where the job type makes them concrete.
    links.push({ label: 'Offer Analyzer: Check Any Salary Offer', href: '/tools/offer-analyzer' });
    const jobTypeLower = job.jobType?.toLowerCase() || '';
    if (
        jobTypeLower.includes('per diem') ||
        jobTypeLower.includes('travel') ||
        jobTypeLower.includes('contract') ||
        jobTypeLower.includes('locum') ||
        jobTypeLower.includes('1099')
    ) {
        links.push({ label: 'Salary Converter: Hourly to Annual', href: '/tools/salary-converter' });
        links.push({ label: '1099 vs W-2 Take-Home Calculator', href: '/tools/1099-vs-w2-calculator' });
    }

    // Always add salary guide (year computed, never hardcoded — a literal
    // "2026" here would go stale every January).
    links.push({ label: `${new Date().getFullYear()} PMHNP Salary Guide`, href: '/salary-guide' });

    return links;
}
