import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';

interface SalaryInsightsProps {
    stateName: string | null;
    stateAvgSalary: number; // in thousands (e.g., 155 for $155k)
    jobMinSalary?: number | null; // annual salary
    jobMaxSalary?: number | null; // annual salary
    nationalAvgSalary?: number; // in thousands, defaults to 155
}

export default function SalaryInsights({
    stateName,
    stateAvgSalary,
    jobMinSalary,
    jobMaxSalary,
    nationalAvgSalary = 155,
}: SalaryInsightsProps) {
    // Calculate job's average salary if available
    const hasJobSalary = (jobMinSalary && jobMinSalary >= 30000) || (jobMaxSalary && jobMaxSalary >= 30000);
    const jobAvgSalary = hasJobSalary
        ? Math.round(((jobMinSalary || jobMaxSalary || 0) + (jobMaxSalary || jobMinSalary || 0)) / 2 / 1000)
        : null;

    // Determine comparison
    const comparisonToState = jobAvgSalary && stateAvgSalary > 0
        ? ((jobAvgSalary - stateAvgSalary) / stateAvgSalary) * 100
        : null;

    // Skip if no meaningful data
    if (!stateAvgSalary || stateAvgSalary <= 0) {
        return null;
    }

    return (
        <section className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-5 md:p-6 mb-4 lg:mb-6 border border-green-200">
            <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-bold text-gray-900">
                    Salary Insights{stateName ? ` for ${stateName}` : ''}
                </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* State Average */}
                <div className="bg-white rounded-lg p-4 border border-green-100">
                    <div className="text-sm text-gray-600 mb-1">
                        {stateName ? `Average PMHNP Salary in ${stateName}` : 'National Average PMHNP Salary'}
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        ${stateAvgSalary}k
                        <span className="text-sm font-normal text-gray-500">/year</span>
                    </div>
                    {stateName && stateAvgSalary !== nationalAvgSalary && (
                        <div className="text-xs text-gray-500 mt-1">
                            National average: ${nationalAvgSalary}k
                        </div>
                    )}
                </div>

                {/* This Position */}
                {jobAvgSalary && (
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                        <div className="text-sm text-gray-600 mb-1">This Position</div>
                        <div className="text-2xl font-bold text-gray-900">
                            {jobMinSalary && jobMaxSalary && jobMinSalary !== jobMaxSalary ? (
                                <>
                                    ${Math.round(jobMinSalary / 1000)}k - ${Math.round(jobMaxSalary / 1000)}k
                                </>
                            ) : (
                                <>${jobAvgSalary}k</>
                            )}
                            <span className="text-sm font-normal text-gray-500">/year</span>
                        </div>
                        {comparisonToState !== null && (
                            <div className={`flex items-center gap-1 text-sm mt-1 ${comparisonToState > 5 ? 'text-green-600' :
                                    comparisonToState < -5 ? 'text-orange-600' :
                                        'text-gray-600'
                                }`}>
                                {comparisonToState > 5 ? (
                                    <>
                                        <TrendingUp className="w-4 h-4" />
                                        {Math.round(comparisonToState)}% above state average
                                    </>
                                ) : comparisonToState < -5 ? (
                                    <>
                                        <TrendingDown className="w-4 h-4" />
                                        {Math.abs(Math.round(comparisonToState))}% below state average
                                    </>
                                ) : (
                                    <>
                                        <Minus className="w-4 h-4" />
                                        Near state average
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-green-200">
                <p className="text-sm text-gray-600 mb-2">
                    PMHNP salaries vary based on experience, setting, and location.
                    Telehealth positions often offer competitive rates with added flexibility.
                </p>
                <Link
                    href="/salary-guide"
                    className="text-sm text-green-700 hover:text-green-800 font-medium"
                >
                    View complete 2026 PMHNP Salary Guide →
                </Link>
            </div>
        </section>
    );
}
