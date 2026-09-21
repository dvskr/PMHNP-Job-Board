/**
 * Shared national salary figure for on-page display.
 *
 * WHY THIS IS NOW A RE-EXPORT. This module used to declare its own
 * `NATIONAL_AVG_PMHNP_SALARY = 158000`, unsourced, while lib/stats-sources.ts
 * declared a sourced $155,000 for the same idea. Both rendered as "the
 * national average" on different pages, so the site contradicted itself by
 * $3,000 and one of the two numbers had no citation at all. Two modules each
 * calling itself the single source of truth is not a single source of truth.
 *
 * There is one number now, and it is the cited one.
 *
 * READ THIS BEFORE USING IT. The figure is BLS OEWS 29-1171, which covers
 * nurse practitioners across ALL specialties. BLS does not break out
 * psychiatric mental health NPs. So this is labor-market CONTEXT, not a PMHNP
 * salary, and copy that quotes it must say so.
 *
 * For PMHNP pay, use the live engine instead: lib/salary-report computes
 * medians from the advertised ranges in real postings and publishes the sample
 * size behind every figure. That is what /salary-guide renders and what
 * llms-full.txt serves, and it is the number that should appear anywhere the
 * site answers "what do PMHNPs earn".
 *
 * Constants-only module, safe to import from server and 'use client'
 * components alike.
 */

import { STAT_SOURCES } from './stats-sources';

/** BLS average for nurse practitioners (all specialties), in USD. */
export const NATIONAL_AVG_PMHNP_SALARY = Number(STAT_SOURCES.npAverageSalaryBls.value);

/** The same figure in thousands, for "$155k" style widgets. */
export const NATIONAL_AVG_PMHNP_SALARY_K = NATIONAL_AVG_PMHNP_SALARY / 1000;

/** The same figure formatted for prose, e.g. "$155,000". */
export const NATIONAL_AVG_PMHNP_SALARY_FORMATTED = STAT_SOURCES.npAverageSalaryBls.formatted;

/** Attribution to render beside the figure. Never quote it bare. */
export const NATIONAL_AVG_SOURCE = STAT_SOURCES.npAverageSalaryBls.source;
