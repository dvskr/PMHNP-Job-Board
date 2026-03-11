'use client';

interface SalaryComparisonWidgetProps {
    stateName: string | null;
    stateAvgSalary: number; // in thousands (e.g., 155 = $155k)
    jobMinSalary?: number | null;
    jobMaxSalary?: number | null;
}

const NATIONAL_AVG_SALARY = 158; // $158k national average for PMHNPs

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
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
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
                    style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
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
                    style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
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
                    style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
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
