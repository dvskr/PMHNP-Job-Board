'use client';

/**
 * State versus national advertised pay, shown on job detail pages.
 *
 * Both figures are medians of advertised pay from the shared salary engine
 * (lib/salary-report), passed in by the page. This widget used to import a
 * hardcoded "national average" constant and compare a state median against
 * it, which put a number with no posting behind it beside one that had
 * hundreds. It now renders only what the engine computed, and drops the
 * national comparison entirely when that figure is withheld.
 */
interface SalaryComparisonWidgetProps {
    stateName: string | null;
    /** Median advertised pay for the state, in thousands (155 = $155k). 0 = withheld. */
    stateMedianK: number;
    /** National median advertised pay, in thousands. 0 = withheld. */
    nationalMedianK: number;
    jobMinSalary?: number | null;
    jobMaxSalary?: number | null;
}

const tileStyle: React.CSSProperties = {
    backgroundColor: '#EDF2EE',
    border: '1px solid rgba(0,0,0,0.05)',
    borderRadius: '14px',
    boxShadow: '3px 3px 6px rgba(0,0,0,0.04), -1px -1px 3px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.5)',
};

export default function SalaryComparisonWidget({
    stateName,
    stateMedianK,
    nationalMedianK,
    jobMinSalary,
    jobMaxSalary,
}: SalaryComparisonWidgetProps) {
    if (!stateName || stateMedianK <= 0) return null;

    const jobMidpoint = jobMinSalary && jobMaxSalary
        ? Math.round((Number(jobMinSalary) + Number(jobMaxSalary)) / 2 / 1000)
        : null;

    const showNational = nationalMedianK > 0;
    const stateVsNationalPct = showNational
        ? Math.round(((stateMedianK - nationalMedianK) / nationalMedianK) * 100)
        : 0;

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

            <div className={`grid ${showNational ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mb-4`}>
                <div className="rounded-xl p-4 text-center" style={tileStyle}>
                    <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        {stateName} median
                    </div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--salary-color, #1d4ed8)' }}>
                        ${stateMedianK}k
                    </div>
                </div>

                {showNational && (
                    <div className="rounded-xl p-4 text-center" style={tileStyle}>
                        <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                            National median
                        </div>
                        <div className="text-2xl font-bold" style={{ color: 'var(--text-secondary)' }}>
                            ${nationalMedianK}k
                        </div>
                    </div>
                )}
            </div>

            {showNational && (
                <div className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    {stateVsNationalPct > 0 ? (
                        <span>
                            {stateName} listings advertise <strong style={{ color: 'var(--color-primary)' }}>{stateVsNationalPct}% more</strong> than the national median
                        </span>
                    ) : stateVsNationalPct < 0 ? (
                        <span>
                            {stateName} listings advertise <strong style={{ color: '#ef4444' }}>{Math.abs(stateVsNationalPct)}% less</strong> than the national median
                        </span>
                    ) : (
                        <span>{stateName} listings advertise pay in line with the national median</span>
                    )}
                </div>
            )}

            {jobMidpoint && jobMidpoint > 10 && (
                <div
                    className="rounded-lg p-3 text-sm"
                    style={{ backgroundColor: '#EDF2EE', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '14px', boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.5), 2px 2px 4px rgba(0,0,0,0.03)', color: 'var(--text-secondary)' }}
                >
                    This position&apos;s advertised pay ({`$${Math.round(Number(jobMinSalary) / 1000)}k to $${Math.round(Number(jobMaxSalary) / 1000)}k`}) is{' '}
                    {jobMidpoint > stateMedianK ? (
                        <strong style={{ color: 'var(--color-primary)' }}>above</strong>
                    ) : jobMidpoint < stateMedianK ? (
                        <strong style={{ color: '#f59e0b' }}>below</strong>
                    ) : (
                        <strong>at</strong>
                    )}{' '}
                    the {stateName} median.
                </div>
            )}

            <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
                Medians of the pay ranges advertised in live PMHNP postings.
            </p>
        </div>
    );
}
