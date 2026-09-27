/**
 * House punctuation rule, applied to job titles.
 *
 * WHY THIS EXISTS. The repo bans em and en dashes in user-facing copy and
 * copy-style.test.ts enforces it, but that test can only see strings we
 * write. A job title is DATA: it arrives from an ATS feed or from an
 * employer typing into the post form, and it reaches emails, OG images,
 * page titles and JSON-LD with the dash intact. A rejection email reading
 * "Full-Time PMHNP {em dash} Colorado Telehealth Psychiatry" is the house
 * rule being broken through a route the rule cannot reach. So it is applied
 * where the title is stored instead.
 *
 * WHY ITS OWN MODULE. Both chokepoints need it: lib/job-normalizer.ts for
 * ingested jobs and lib/sanitize.ts for employer-submitted ones. sanitize.ts
 * is imported by a great many routes, and having it pull in job-normalizer's
 * whole dependency graph to reach one string function would be a real cost
 * for no reason.
 */

/**
 * Every dash character that is really a separator rather than a hyphen:
 * figure dash, en dash, em dash, horizontal bar, and the minus sign, which
 * ATS exports produce surprisingly often.
 *
 * The ASCII hyphen is deliberately absent. "Full-Time" and "Board-Certified"
 * are hyphenated words, not punctuation to rewrite.
 */
const SEPARATOR_DASHES = '[\\u2012\\u2013\\u2014\\u2015\\u2212]';

const NUMERIC_RANGE = new RegExp(`(\\d)\\s*${SEPARATOR_DASHES}\\s*(\\d)`, 'g');
const ANY_SEPARATOR = new RegExp(`\\s*${SEPARATOR_DASHES}\\s*`, 'g');

/**
 * Rewrite separator dashes in a job title.
 *
 * A dash BETWEEN DIGITS is a range and becomes "to", which is the form the
 * copy rule asks for. Every other one is joining two halves of a title and
 * becomes a comma.
 *
 * SAFE FOR DEDUP. buildJobIdentityKey runs titles through
 * deduplicator.normalizeTitle, which replaces every non-alphanumeric
 * character with a space, so a comma and a dash produce an identical key.
 * The inserted "to" is dropped there as a common word, so numeric ranges
 * match as before too.
 */
export function normalizeTitlePunctuation(raw: string | null | undefined): string {
    if (!raw) return '';
    return String(raw)
        // "20 to 30 hours", never "20, 30 hours".
        .replace(NUMERIC_RANGE, '$1 to $2')
        .replace(ANY_SEPARATOR, ', ')
        // A dash at either end leaves a dangling separator behind.
        .replace(/^[\s,]+/, '')
        .replace(/[\s,]+$/, '')
        // A title that already had a comma beside the dash now has two.
        .replace(/(?:,\s*){2,}/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
