/**
 * Shared types for the deterministic PMHNP resume scoring engine.
 *
 * This is the output contract other surfaces (API routes, UI components)
 * build against. Do not change field names or the grade union without
 * coordinating with every consumer.
 */

export interface ResumeScoreDimension {
    /** Kebab-case stable id, e.g. "quantified-impact". */
    key: string;
    /** Human readable label, e.g. "Quantified Impact". */
    label: string;
    /** Points earned for this dimension. Always 0 <= score <= max. */
    score: number;
    /** Points possible for this dimension. All dimension maxes sum to 100. */
    max: number;
    /**
     * Plain language, actionable findings. Every dimension always returns at
     * least one finding (either what is good or what to add). Findings are
     * complete sentences and never contain em or en dashes.
     */
    findings: string[];
}

export type ResumeScoreGrade = 'strong' | 'solid' | 'needs-work' | 'critical';

export interface ResumeScoreResult {
    /** 0 to 100. Sum of dimension scores; dimension maxes sum to exactly 100. */
    total: number;
    /** 85+ strong, 70+ solid, 50+ needs-work, below 50 critical. */
    grade: ResumeScoreGrade;
    dimensions: ResumeScoreDimension[];
}
