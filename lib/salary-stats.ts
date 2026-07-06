/**
 * Shared salary statistics for on-page display.
 *
 * Every national-average PMHNP salary mention rendered anywhere on the
 * site MUST derive from these constants — never hardcode the figure in
 * a component. (Before this file existed, four components disagreed:
 * $155k, $158k, and $160K+ were all shown as the "national average".)
 *
 * Constants-only module — safe to import from both server and
 * 'use client' components.
 */

/** National average PMHNP salary in USD. */
export const NATIONAL_AVG_PMHNP_SALARY = 158000;

/** National average in thousands (e.g. 158 → "$158k" widgets). */
export const NATIONAL_AVG_PMHNP_SALARY_K = NATIONAL_AVG_PMHNP_SALARY / 1000;

/** National average formatted for prose, e.g. "$158,000". */
export const NATIONAL_AVG_PMHNP_SALARY_FORMATTED = `$${NATIONAL_AVG_PMHNP_SALARY.toLocaleString('en-US')}`;
