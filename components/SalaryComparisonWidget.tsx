'use client';

import { NATIONAL_AVG_PMHNP_SALARY_K } from '@/lib/salary-stats';

interface SalaryComparisonWidgetProps {
    stateName: string | null;
    stateAvgSalary: number; // in thousands (e.g., 155 = $155k)
    jobMinSalary?: number | null;
    jobMaxSalary?: number | null;
}

const NATIONAL_AVG_SALARY = NATIONAL_AVG_PMHNP_SALARY_K; // $158k national average for PMHNPs

export default function SalaryComparisonWidget({
    stateName,
    stateAvgSalary,
    jobMinSalary,
    jobMaxSalary,
}: SalaryComparisonWidgetProps) {
    if (!stateName || stateAvgSalary <= 0) return null;

    const jobMidpoint = jobMinSalary && jobMaxSalary
        ? Math.round((Number(jobMinSalary) + Number(jobMaxSalary)) / 2 / 1000)
        : null;

    const stateVsNational = stateAvgSalary - NATIONAL_AVG_SALARY;
    const stateVsNationalPct = Math.round((stateVsNational / NATIONAL_AVG_SALARY) * 100);

    return (
        <div
            className="rounded-2xl p-5 md:p-6 mb-4 lg:mb-6"
            style={{ backgroundColor: '#F7FBF8', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '6px 6px 14px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}
        >
            <h2
                className="text-lg font-bold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
            >
                💰 Salary Insights for {stateName}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
                {/* State Average */}
                <div
                    className="rounded-xl p-4 text-center"
                    style={{ backgroundColor: '#EDF2EE', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '14px', boxShadow: '3px 3px 6px rgba(0,0,0,0.04), -1px -1px 3px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.5)' }}
                >
                    <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        {stateName} Avg
                    </div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--salary-color, #1d4ed8)' }}>
                        ${stateAvgSalary}k
                    </div>
                </div>

                {/* National Average */}
                <div
                    className="rounded-xl p-4 text-center"
                    style={{ backgroundColor: '#EDF2EE', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '14px', boxShadow: '3px 3px 6px rgba(0,0,0,0.04), -1px -1px 3px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.5)' }}
                >
                    <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        National Avg
                    </div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--text-secondary)' }}>
                        ${NATIONAL_AVG_SALARY}k
                    </div>
                </div>
            </div>

            {/* Comparison bar */}
            <div className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                {stateVsNational > 0 ? (
                    <span>
                        {stateName} pays <strong style={{ color: 'var(--color-primary)' }}>+{stateVsNationalPct}%</strong> above the national average
                    </span>
                ) : stateVsNational < 0 ? (
                    <span>
                        {stateName} pays <strong style={{ color: '#ef4444' }}>{stateVsNationalPct}%</strong> below the national average
                    </span>
                ) : (
                    <span>{stateName} pays at the national average</span>
                )}
            </div>

            {/* This job comparison */}
            {jobMidpoint && jobMidpoint > 10 && (
                <div
                    className="rounded-lg p-3 text-sm"
                    style={{ backgroundColor: '#EDF2EE', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '14px', boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.5), 2px 2px 4px rgba(0,0,0,0.03)', color: 'var(--text-secondary)' }}
                >
                    This position&apos;s salary ({`$${Math.round(Number(jobMinSalary) / 1000)}k-$${Math.round(Number(jobMaxSalary) / 1000)}k`}) is{' '}
                    {jobMidpoint > stateAvgSalary ? (
                        <strong style={{ color: 'var(--color-primary)' }}>above</strong>
                    ) : jobMidpoint < stateAvgSalary ? (
                        <strong style={{ color: '#f59e0b' }}>below</strong>
                    ) : (
                        <strong>at</strong>
                    )}{' '}
                    the {stateName} average.
                </div>
            )}
        </div>
    );
}
