'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, MousePointerClick, TrendingUp, BarChart3, Award, ArrowUp, ArrowDown, Minus, DollarSign, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface JobStat {
    id: string;
    title: string;
    views: number;
    clicks: number;
    ctr: number;
}

interface AnalyticsData {
    summary: {
        totalViews: number;
        totalClicks: number;
        ctr: number;
    };
    jobs: JobStat[];
    chart: {
        labels: string[];
        clicks: number[];
    };
}

interface Benchmarks {
    avgViews: number;
    avgClicks: number;
    avgCtr: number;
    medianViews: number;
    medianClicks: number;
    featuredAvgViews: number;
    featuredAvgClicks: number;
    standardAvgViews: number;
    standardAvgClicks: number;
    totalJobsInPool: number;
    platformMedianSalary: number;
    platformAvgSalary: number;
    jobsWithSalary: number;
}

interface EmployerJobInsight {
    id: string;
    title: string;
    views: number;
    clicks: number;
    ctr: number;
    isFeatured: boolean;
    displaySalary: string | null;
    midSalary: number | null;
    salaryRating: 'above' | 'at' | 'below' | 'unknown';
    suggestions: string[];
}

export default function AnalyticsTab() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
    const [employerJobs, setEmployerJobs] = useState<EmployerJobInsight[]>([]);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState(false);

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await fetch('/api/employer/analytics');
            if (!res.ok) {
                setError(true);
                setData({ summary: { totalViews: 0, totalClicks: 0, ctr: 0 }, jobs: [], chart: { labels: [], clicks: [] } });
                return;
            }
            const text = await res.text();
            if (!text) {
                setError(true);
                setData({ summary: { totalViews: 0, totalClicks: 0, ctr: 0 }, jobs: [], chart: { labels: [], clicks: [] } });
                return;
            }
            const json = JSON.parse(text);
            setData(json);
        } catch (err) {
            console.error('Error fetching analytics:', err);
            setError(true);
            setData({ summary: { totalViews: 0, totalClicks: 0, ctr: 0 }, jobs: [], chart: { labels: [], clicks: [] } });
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchBenchmarks = useCallback(async () => {
        try {
            const res = await fetch('/api/employer/analytics/benchmarks');
            if (res.ok) {
                const json = await res.json();
                setBenchmarks(json.benchmarks);
                setEmployerJobs(json.employerJobs || []);
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchAnalytics();
        fetchBenchmarks();
    }, [fetchAnalytics, fetchBenchmarks]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    if (!data) return null;

    const summary = data.summary || { totalViews: 0, totalClicks: 0, ctr: 0 };

    const chart = data.chart || null;
    const chartClicks = chart && chart.clicks ? chart.clicks : [];
    const chartLabels = chart && chart.labels ? chart.labels : [];
    const maxClicks = chartClicks.length > 0 ? Math.max(...chartClicks, 1) : 1;

    return (
        <div>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div
                    className="rounded-xl p-5"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                            <Eye size={18} style={{ color: '#3B82F6' }} />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                            Total Views
                        </span>
                    </div>
                    <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {summary.totalViews.toLocaleString()}
                    </p>
                </div>

                <div
                    className="rounded-xl p-5"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                            <MousePointerClick size={18} style={{ color: '#10B981' }} />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                            Apply Clicks
                        </span>
                    </div>
                    <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {summary.totalClicks.toLocaleString()}
                    </p>
                </div>

                <div
                    className="rounded-xl p-5"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)' }}>
                            <TrendingUp size={18} style={{ color: '#A855F7' }} />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                            Click-through Rate
                        </span>
                    </div>
                    <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {summary.ctr}%
                    </p>
                </div>
            </div>

            {/* Simple Bar Chart — Apply Clicks over time */}
            <div
                className="rounded-xl p-6 mb-8"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            >
                <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={18} style={{ color: 'var(--text-tertiary)' }} />
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Apply Clicks — Last 30 Days
                    </h3>
                </div>
                <div className="flex items-end gap-[2px] h-32">
                    {chartClicks.map((count, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-t transition-all hover:opacity-80 group relative"
                            style={{
                                height: `${Math.max((count / maxClicks) * 100, 2)}%`,
                                backgroundColor: count > 0 ? '#14B8A6' : 'var(--bg-tertiary)',
                                minWidth: '3px',
                            }}
                            title={`${chartLabels[i]}: ${count} clicks`}
                        />
                    ))}
                </div>
                <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{chartLabels[0]}</span>
                    <span>{chartLabels[chartLabels.length - 1]}</span>
                </div>
            </div>

            {/* Per-Job Breakdown */}
            {(data.jobs || []).length > 0 && (
                <div
                    className="rounded-xl overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th className="text-left p-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Job</th>
                                <th className="text-right p-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Views</th>
                                <th className="text-right p-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Clicks</th>
                                <th className="text-right p-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>CTR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data.jobs || []).map(job => (
                                <tr key={job.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td className="p-4 font-medium truncate max-w-[250px]" style={{ color: 'var(--text-primary)' }}>
                                        {job.title}
                                    </td>
                                    <td className="p-4 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                        {job.views.toLocaleString()}
                                    </td>
                                    <td className="p-4 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                        {job.clicks.toLocaleString()}
                                    </td>
                                    <td className="p-4 text-right tabular-nums font-semibold" style={{ color: job.ctr >= 5 ? '#10B981' : 'var(--text-secondary)' }}>
                                        {job.ctr}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ═══ Benchmark Comparison ═══ */}
            {benchmarks && benchmarks.totalJobsInPool > 0 && (
                <div
                    className="rounded-xl p-6 mt-8"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Award size={18} style={{ color: '#F59E0B' }} />
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            How You Compare
                        </h3>
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                            vs {benchmarks.totalJobsInPool} jobs on platform
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        {[
                            {
                                label: 'Views',
                                yours: summary.totalViews,
                                avg: benchmarks.avgViews,
                                color: '#3B82F6',
                            },
                            {
                                label: 'Clicks',
                                yours: summary.totalClicks,
                                avg: benchmarks.avgClicks,
                                color: '#10B981',
                            },
                            {
                                label: 'CTR',
                                yours: summary.ctr,
                                avg: benchmarks.avgCtr,
                                color: '#A855F7',
                                suffix: '%',
                            },
                        ].map((m) => {
                            const diff = m.avg > 0 ? ((m.yours - m.avg) / m.avg) * 100 : 0;
                            const isAbove = diff > 5;
                            const isBelow = diff < -5;
                            return (
                                <div
                                    key={m.label}
                                    className="rounded-lg p-4"
                                    style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                                >
                                    <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                                        {m.label}
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                                {typeof m.yours === 'number' ? m.yours.toLocaleString() : m.yours}{m.suffix || ''}
                                            </div>
                                            <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                                Platform avg: {m.avg.toLocaleString()}{m.suffix || ''}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs font-semibold" style={{
                                            color: isAbove ? '#10B981' : isBelow ? '#EF4444' : 'var(--text-tertiary)',
                                        }}>
                                            {isAbove ? <ArrowUp size={14} /> : isBelow ? <ArrowDown size={14} /> : <Minus size={14} />}
                                            {Math.abs(Math.round(diff))}%
                                        </div>
                                    </div>
                                    {/* Bar comparison */}
                                    <div className="mt-3 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] w-8" style={{ color: 'var(--text-tertiary)' }}>You</span>
                                            <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                                <div className="h-full rounded-full transition-all" style={{
                                                    width: `${Math.min((m.yours / Math.max(m.yours, m.avg, 1)) * 100, 100)}%`,
                                                    backgroundColor: m.color,
                                                }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] w-8" style={{ color: 'var(--text-tertiary)' }}>Avg</span>
                                            <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                                <div className="h-full rounded-full transition-all" style={{
                                                    width: `${Math.min((m.avg / Math.max(m.yours, m.avg, 1)) * 100, 100)}%`,
                                                    backgroundColor: 'var(--text-tertiary)',
                                                    opacity: 0.4,
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Featured vs Standard */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg p-3" style={{ border: '1px solid rgba(245,158,11,0.2)', backgroundColor: 'rgba(245,158,11,0.04)' }}>
                            <div className="text-[10px] font-semibold mb-1" style={{ color: '#F59E0B', textTransform: 'uppercase' }}>⭐ Featured Jobs Avg</div>
                            <div className="flex gap-4">
                                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                    <strong>{benchmarks.featuredAvgViews.toLocaleString()}</strong> views
                                </span>
                                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                    <strong>{benchmarks.featuredAvgClicks.toLocaleString()}</strong> clicks
                                </span>
                            </div>
                        </div>
                        <div className="rounded-lg p-3" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                            <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Standard Jobs Avg</div>
                            <div className="flex gap-4">
                                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                    <strong>{benchmarks.standardAvgViews.toLocaleString()}</strong> views
                                </span>
                                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                    <strong>{benchmarks.standardAvgClicks.toLocaleString()}</strong> clicks
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Salary Competitiveness ═══ */}
            {employerJobs.length > 0 && benchmarks && benchmarks.platformMedianSalary > 0 && (
                <div
                    className="rounded-xl p-6 mt-8"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <DollarSign size={18} style={{ color: '#10B981' }} />
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Salary Competitiveness
                        </h3>
                    </div>
                    <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                        Platform median: <strong>${benchmarks.platformMedianSalary.toLocaleString()}</strong>/yr
                        {benchmarks.jobsWithSalary > 0 && ` (based on ${benchmarks.jobsWithSalary} jobs with salary data)`}
                    </p>

                    <div className="space-y-2">
                        {employerJobs.map(job => {
                            const ratingConfig = {
                                above: { label: 'Above Market', color: '#10B981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', icon: <ArrowUp size={12} /> },
                                at: { label: 'At Market', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', icon: <Minus size={12} /> },
                                below: { label: 'Below Market', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', icon: <ArrowDown size={12} /> },
                                unknown: { label: 'No Salary', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)', border: 'var(--border-color)', icon: <AlertTriangle size={12} /> },
                            };
                            const r = ratingConfig[job.salaryRating];
                            return (
                                <div
                                    key={job.id}
                                    className="flex items-center justify-between rounded-lg px-4 py-3"
                                    style={{ border: `1px solid ${r.border}`, backgroundColor: r.bg }}
                                >
                                    <div className="flex-1 min-w-0 mr-3">
                                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                            {job.title}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            {job.displaySalary || 'No salary listed'}
                                            {job.midSalary ? ` · ~$${job.midSalary.toLocaleString()}/yr` : ''}
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md whitespace-nowrap" style={{
                                        color: r.color, backgroundColor: r.bg, border: `1px solid ${r.border}`,
                                    }}>
                                        {r.icon} {r.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══ Improvement Suggestions ═══ */}
            {employerJobs.some(j => j.suggestions.length > 0) && (
                <div
                    className="rounded-xl p-6 mt-8"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Lightbulb size={18} style={{ color: '#F59E0B' }} />
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Improvement Suggestions
                        </h3>
                    </div>

                    <div className="space-y-4">
                        {employerJobs.filter(j => j.suggestions.length > 0).map(job => (
                            <div key={job.id} className="rounded-lg p-4" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                        {job.title}
                                    </span>
                                    {job.isFeatured && (
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{
                                            backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B',
                                        }}>Featured</span>
                                    )}
                                </div>
                                <ul className="space-y-1.5">
                                    {job.suggestions.map((s, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            <span className="mt-0.5 shrink-0">
                                                {s.includes('salary') || s.includes('Salary') ? (
                                                    <DollarSign size={12} style={{ color: '#EF4444' }} />
                                                ) : s.includes('Low') ? (
                                                    <AlertTriangle size={12} style={{ color: '#F59E0B' }} />
                                                ) : (
                                                    <CheckCircle2 size={12} style={{ color: '#3B82F6' }} />
                                                )}
                                            </span>
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
