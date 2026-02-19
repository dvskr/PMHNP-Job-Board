'use client';

import { useState, useEffect } from 'react';

interface Stats {
  totalActive: number;
  addedLast24h: number;
  bySource: Record<string, number>;
  jobsByDay: Record<string, number>;
  topEmployers: Array<{ employer: string; count: number }>;
  additionalMetrics?: {
    totalJobs: number;
    publishedJobs: number;
    unpublishedJobs: number;
    featuredJobs: number;
    jobTypeDistribution: Record<string, number>;
    modeDistribution: Record<string, number>;
  };
  lastUpdated: string;
}

interface SourcePerformance {
  source: string;
  totalJobs: number;
  jobsLast7Days: number;
  jobsLast30Days: number;
  avgQualityScore: number;
  totalViews: number;
  totalApplyClicks: number;
  clickThroughRate: number;
  duplicateRate: number;
  costPerJob: number | null;
}

interface ClickAnalytics {
  summary: {
    totalClicks: number;
    uniqueJobs: number;
    avgClicksPerJob: number;
  };
  bySource: Array<{
    source: string;
    clicks: number;
    jobs: number;
    avgPerJob: number;
  }>;
  byDay: Array<{
    date: string;
    clicks: number;
  }>;
  topJobs: Array<{
    jobId: string;
    title: string;
    employer: string;
    clicks: number;
  }>;
}

/* ─── Shared inline style objects ─── */
const s = {
  card: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    overflow: 'hidden' as const,
  },
  cardBody: { padding: '24px' },
  heading: { color: 'var(--text-primary)', fontWeight: 700 as const },
  sub: { color: 'var(--text-secondary)', fontSize: '14px' },
  muted: { color: 'var(--text-tertiary)', fontSize: '12px' },
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: '11px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-tertiary)',
    backgroundColor: 'var(--bg-tertiary)',
  },
  td: {
    padding: '14px 16px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid var(--border-color)',
  },
  tdBold: {
    padding: '14px 16px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid var(--border-color)',
  },
};

export default function AdminJobsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sourceAnalytics, setSourceAnalytics] = useState<SourcePerformance[] | null>(null);
  const [clickAnalytics, setClickAnalytics] = useState<ClickAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('all');

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      setStats(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSourceAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics/sources');
      if (!response.ok) return;
      const data = await response.json();
      setSourceAnalytics(data.sources || []);
    } catch (err) {
      console.error('Error fetching source analytics:', err);
    }
  };

  const fetchClickAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics/clicks?days=30');
      if (!response.ok) return;
      setClickAnalytics(await response.json());
    } catch (err) {
      console.error('Error fetching click analytics:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchSourceAnalytics();
    fetchClickAnalytics();
    const interval = setInterval(() => {
      fetchStats();
      fetchSourceAnalytics();
      fetchClickAnalytics();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerIngestion = async () => {
    try {
      setActionLoading(true);
      setActionResult(null);
      const response = await fetch('/api/admin/trigger-ingestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: selectedSource === 'all' ? undefined : selectedSource,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ingestion failed');
      }
      const result = await response.json();
      const totalAdded = result.ingestion?.summary?.totalAdded || 0;
      const totalFetched = result.ingestion?.summary?.totalFetched || 0;
      const totalDuplicates = result.ingestion?.summary?.totalDuplicates || 0;
      setActionResult(
        `Success! Fetched ${totalFetched} jobs, added ${totalAdded} new, ${totalDuplicates} duplicates`
      );
      setTimeout(fetchStats, 2000);
    } catch (err) {
      setActionResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Loading / Error ─── */
  if (loading && !stats) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '80px', paddingRight: '16px', paddingBottom: '32px', paddingLeft: '16px', textAlign: 'center' }}>
        <div
          style={{
            width: 48, height: 48, border: '3px solid var(--border-color)',
            borderTop: '3px solid #2DD4BF', borderRadius: '50%',
            margin: '0 auto', animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ marginTop: '16px', ...s.sub }}>Loading statistics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '32px', paddingRight: '16px', paddingBottom: '32px', paddingLeft: '16px' }}>
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '12px', padding: '24px',
          }}
        >
          <h2 style={{ color: '#EF4444', fontWeight: 700, marginBottom: '8px' }}>Error</h2>
          <p style={{ color: '#F87171', fontSize: '14px' }}>{error}</p>
          <button
            onClick={fetchStats}
            style={{
              marginTop: '12px', padding: '10px 20px',
              background: '#EF4444', color: '#fff', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const avgDailyNew = Object.keys(stats.jobsByDay).length > 0
    ? Math.round(Object.values(stats.jobsByDay).reduce((a: number, b: number) => a + b, 0) / Object.keys(stats.jobsByDay).length)
    : 0;
  const totalBySource = Object.values(stats.bySource).reduce((a: number, b: number) => a + b, 0);
  const sortedDays = Object.entries(stats.jobsByDay).sort(([a]: [string, number], [b]: [string, number]) => a.localeCompare(b));
  const trend = sortedDays.length >= 2
    ? (sortedDays[sortedDays.length - 1]?.[1] ?? 0) > (sortedDays[sortedDays.length - 2]?.[1] ?? 0)
    : null;

  /* ─── Color-coded badge helper ─── */
  const badge = (value: string, color: 'green' | 'yellow' | 'red' | 'gray') => {
    const colors = {
      green: { bg: 'rgba(34,197,94,0.12)', fg: '#22C55E' },
      yellow: { bg: 'rgba(234,179,8,0.12)', fg: '#EAB308' },
      red: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444' },
      gray: { bg: 'var(--bg-tertiary)', fg: 'var(--text-secondary)' },
    };
    const c = colors[color];
    return (
      <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: c.bg, color: c.fg }}>
        {value}
      </span>
    );
  };

  /* ─── Highlight card helper ─── */
  const highlightCard = (
    emoji: string,
    label: string,
    accent: string,
    name: string,
    detail: string,
  ) => (
    <div
      style={{
        ...s.card,
        padding: '20px 24px',
        borderColor: accent + '30',
        background: `linear-gradient(135deg, ${accent}08, ${accent}05)`,
      }}
    >
      <h3 style={{ fontSize: '12px', fontWeight: 600, color: accent, marginBottom: '12px' }}>
        {emoji} {label}
      </h3>
      <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{name}</p>
      <p style={{ fontSize: '13px', color: accent, marginTop: '4px' }}>{detail}</p>
    </div>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '32px', paddingRight: '16px', paddingBottom: '32px', paddingLeft: '16px' }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '28px' }}>
        <div>
          <h1 style={{ ...s.heading, fontSize: '26px' }}>Job Aggregation Dashboard</h1>
          <p style={{ ...s.muted, marginTop: '4px' }}>
            Last updated: {new Date(stats.lastUpdated).toLocaleString()}
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          style={{
            padding: '10px 22px', borderRadius: '10px', cursor: 'pointer',
            backgroundColor: '#2DD4BF', color: '#0F172A', border: 'none',
            fontWeight: 700, fontSize: '13px', transition: 'opacity 0.2s',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Total Active Jobs', value: stats.totalActive, color: 'var(--text-primary)' },
          { label: 'Added Last 24h', value: stats.addedLast24h, color: '#22C55E' },
          { label: 'Active Sources', value: Object.keys(stats.bySource).length, color: '#2DD4BF' },
          { label: 'Avg Daily New', value: avgDailyNew, color: '#A855F7' },
        ].map((c) => (
          <div key={c.label} style={{ ...s.card, padding: '20px 24px' }}>
            <h3 style={{ ...s.muted, marginBottom: '8px' }}>{c.label}</h3>
            <p style={{ fontSize: '30px', fontWeight: 800, color: c.color }}>{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* ─── Top Sources Highlights ─── */}
      {sourceAnalytics && sourceAnalytics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5" style={{ marginBottom: '28px' }}>
          {(() => {
            const bestVolume = [...sourceAnalytics].sort((a, b) => b.totalJobs - a.totalJobs)[0];
            const bestQuality = [...sourceAnalytics].sort((a, b) => b.avgQualityScore - a.avgQualityScore)[0];
            const bestClicks = [...sourceAnalytics].sort((a, b) => b.clickThroughRate - a.clickThroughRate)[0];
            return (
              <>
                {bestVolume && highlightCard('🏆', 'Best for Volume', '#2DD4BF', bestVolume.source, `${bestVolume.totalJobs.toLocaleString()} active jobs`)}
                {bestQuality && highlightCard('⭐', 'Best for Quality', '#22C55E', bestQuality.source, `${(bestQuality.avgQualityScore * 100).toFixed(0)}% quality score`)}
                {bestClicks && highlightCard('🎯', 'Best for Clicks', '#A855F7', bestClicks.source, `${(bestClicks.clickThroughRate * 100).toFixed(1)}% CTR`)}
              </>
            );
          })()}
        </div>
      )}

      {/* ─── Jobs by Source ─── */}
      <div style={{ ...s.card, marginBottom: '28px' }}>
        <div style={s.cardBody}>
          <h2 style={{ ...s.heading, fontSize: '18px', marginBottom: '16px' }}>Jobs by Source</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={s.th}>Source</th>
                  <th style={s.th}>Count</th>
                  <th style={s.th}>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.bySource)
                  .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
                  .map(([source, count]: [string, number]) => (
                    <tr key={source}>
                      <td style={{ ...s.tdBold, textTransform: 'capitalize' }}>{source}</td>
                      <td style={s.td}>{count.toLocaleString()}</td>
                      <td style={s.td}>{((count / totalBySource) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <td style={{ ...s.tdBold, borderBottom: 'none' }}>Total</td>
                  <td style={{ ...s.tdBold, borderBottom: 'none' }}>{totalBySource.toLocaleString()}</td>
                  <td style={{ ...s.tdBold, borderBottom: 'none' }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Jobs Added Per Day ─── */}
      <div style={{ ...s.card, marginBottom: '28px' }}>
        <div style={s.cardBody}>
          <h2 style={{ ...s.heading, fontSize: '18px', marginBottom: '16px' }}>
            Jobs Added Per Day (Last 7 Days)
            {trend !== null && (
              <span style={{ marginLeft: '12px', fontSize: '13px', color: trend ? '#22C55E' : '#EF4444' }}>
                {trend ? '↑ Trending Up' : '↓ Trending Down'}
              </span>
            )}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedDays.length > 0 ? (
              sortedDays.map(([date, count]: [string, number]) => (
                <div key={date} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '110px', fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>{date}</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        background: 'linear-gradient(90deg, #2DD4BF, #14B8A6)',
                        height: '28px', borderRadius: '6px',
                        width: `${(count / Math.max(...Object.values(stats.jobsByDay))) * 100}%`,
                        minWidth: '24px',
                      }}
                    />
                    <span style={{ marginLeft: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{count}</span>
                  </div>
                </div>
              ))
            ) : (
              <p style={s.sub}>No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Top Employers ─── */}
      <div style={{ ...s.card, marginBottom: '28px' }}>
        <div style={s.cardBody}>
          <h2 style={{ ...s.heading, fontSize: '18px', marginBottom: '16px' }}>Top Employers</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={s.th}>Rank</th>
                  <th style={s.th}>Employer</th>
                  <th style={s.th}>Job Count</th>
                </tr>
              </thead>
              <tbody>
                {stats.topEmployers.map((emp, i) => (
                  <tr key={emp.employer}>
                    <td style={s.td}>#{i + 1}</td>
                    <td style={s.tdBold}>{emp.employer}</td>
                    <td style={s.td}>{emp.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Source Performance ─── */}
      {sourceAnalytics && sourceAnalytics.length > 0 && (
        <div style={{ ...s.card, marginBottom: '28px' }}>
          <div style={s.cardBody}>
            <h2 style={{ ...s.heading, fontSize: '18px', marginBottom: '16px' }}>Source Performance</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Source', 'Active Jobs', '7-Day Adds', 'Quality', 'Views', 'Clicks', 'CTR', 'Dup Rate'].map((h) => (
                      <th key={h} style={{ ...s.th, textAlign: h === 'Source' ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sourceAnalytics.map((src) => {
                    const q = src.avgQualityScore * 100;
                    const ctr = src.clickThroughRate * 100;
                    const dup = src.duplicateRate * 100;
                    const qColor = q >= 75 ? 'green' : q >= 50 ? 'yellow' : 'red';
                    const ctrColor = ctr >= 5 ? 'green' : ctr >= 2 ? 'yellow' : 'gray';
                    const dupColor = dup >= 50 ? 'red' : dup >= 30 ? 'yellow' : 'green';

                    return (
                      <tr key={src.source}>
                        <td style={{ ...s.tdBold, textTransform: 'capitalize' }}>{src.source}</td>
                        <td style={{ ...s.tdBold, textAlign: 'right' }}>{src.totalJobs.toLocaleString()}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{src.jobsLast7Days.toLocaleString()}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{badge(`${q.toFixed(0)}`, qColor as 'green' | 'yellow' | 'red')}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{src.totalViews.toLocaleString()}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{src.totalApplyClicks.toLocaleString()}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{badge(`${ctr.toFixed(1)}%`, ctrColor as 'green' | 'yellow' | 'red' | 'gray')}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{badge(`${dup.toFixed(0)}%`, dupColor as 'green' | 'yellow' | 'red')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '14px', ...s.muted }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block' }} /> Good
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#EAB308', display: 'inline-block' }} /> Average
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#EF4444', display: 'inline-block' }} /> Needs improvement
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Apply Click Analytics ─── */}
      {clickAnalytics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginBottom: '28px' }}>
          <div style={s.card}>
            <div style={s.cardBody}>
              <h2 style={{ ...s.heading, fontSize: '18px', marginBottom: '24px' }}>Apply Click Analytics (Last 30 Days)</h2>

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5" style={{ marginBottom: '28px' }}>
                {[
                  { label: 'Total Clicks', value: clickAnalytics.summary.totalClicks.toLocaleString(), detail: `${clickAnalytics.summary.uniqueJobs} unique jobs`, accent: '#818CF8' },
                  { label: 'Avg Clicks per Job', value: clickAnalytics.summary.avgClicksPerJob.toFixed(2), detail: 'Engagement rate', accent: '#2DD4BF' },
                  {
                    label: 'Best Converting Source',
                    value: clickAnalytics.bySource[0]?.source || 'N/A',
                    detail: clickAnalytics.bySource[0] ? `${clickAnalytics.bySource[0].clicks} clicks (${clickAnalytics.bySource[0].avgPerJob.toFixed(2)} per job)` : 'No data',
                    accent: '#F59E0B',
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    style={{
                      ...s.card, padding: '20px 24px',
                      borderColor: c.accent + '30',
                      background: `linear-gradient(135deg, ${c.accent}08, ${c.accent}05)`,
                    }}
                  >
                    <h3 style={{ fontSize: '12px', fontWeight: 600, color: c.accent, marginBottom: '8px' }}>{c.label}</h3>
                    <p style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{c.value}</p>
                    <p style={{ fontSize: '12px', color: c.accent, marginTop: '4px' }}>{c.detail}</p>
                  </div>
                ))}
              </div>

              {/* Clicks by Source */}
              {clickAnalytics.bySource.length > 0 && (
                <div style={{ marginBottom: '28px' }}>
                  <h3 style={{ ...s.heading, fontSize: '16px', marginBottom: '14px' }}>Clicks by Source</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Source', 'Total Clicks', 'Jobs Clicked', 'Avg per Job', 'Performance'].map((h) => (
                            <th key={h} style={{ ...s.th, textAlign: h === 'Source' ? 'left' : 'right' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clickAnalytics.bySource.map((src) => {
                          const perf = src.avgPerJob;
                          const perfLabel = perf >= 0.5 ? '🔥 Hot' : perf >= 0.3 ? '👍 Good' : '📊 Low';
                          const perfColor = perf >= 0.5 ? 'green' : perf >= 0.3 ? 'yellow' : 'red';
                          return (
                            <tr key={src.source}>
                              <td style={{ ...s.tdBold, textTransform: 'capitalize' }}>{src.source}</td>
                              <td style={{ ...s.tdBold, textAlign: 'right' }}>{src.clicks.toLocaleString()}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{src.jobs.toLocaleString()}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{src.avgPerJob.toFixed(2)}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{badge(perfLabel, perfColor as 'green' | 'yellow' | 'red')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top 10 Most Clicked Jobs */}
              {clickAnalytics.topJobs.length > 0 && (
                <div>
                  <h3 style={{ ...s.heading, fontSize: '16px', marginBottom: '14px' }}>Top 10 Most Clicked Jobs</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={s.th}>Rank</th>
                          <th style={s.th}>Job Title</th>
                          <th style={s.th}>Employer</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clickAnalytics.topJobs.map((job, i) => (
                          <tr key={job.jobId}>
                            <td style={s.td}>
                              <span style={{ fontWeight: 700, color: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#CD7F32' : 'var(--text-tertiary)' }}>
                                #{i + 1}
                              </span>
                            </td>
                            <td style={s.tdBold}>{job.title}</td>
                            <td style={s.td}>{job.employer}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>
                              {badge(`${job.clicks} clicks`, 'gray')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Actions ─── */}
      <div style={s.card}>
        <div style={s.cardBody}>
          <h2 style={{ ...s.heading, fontSize: '18px', marginBottom: '16px' }}>Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="flex flex-col sm:flex-row" style={{ gap: '12px' }}>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: '10px',
                  backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', fontSize: '14px',
                  outline: 'none',
                }}
              >
                <option value="all">All Sources</option>
                <option value="adzuna">Adzuna</option>
                <option value="jooble">Jooble</option>
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="usajobs">USAJobs</option>
                <option value="jsearch">JSearch</option>
              </select>
              <button
                onClick={handleTriggerIngestion}
                disabled={actionLoading}
                style={{
                  padding: '10px 24px', borderRadius: '10px', cursor: 'pointer',
                  backgroundColor: '#22C55E', color: '#0F172A', border: 'none',
                  fontWeight: 700, fontSize: '13px', transition: 'opacity 0.2s',
                  opacity: actionLoading ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >
                {actionLoading ? 'Running…' : 'Trigger Ingestion'}
              </button>
            </div>

            {actionResult && (
              <div
                style={{
                  padding: '14px 18px', borderRadius: '10px', fontSize: '13px',
                  backgroundColor: actionResult.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                  color: actionResult.includes('Error') ? '#F87171' : '#22C55E',
                }}
              >
                {actionResult}
              </div>
            )}

            <p style={s.muted}>
              ⚠️ Note: Full ingestion can take 40+ seconds. The page will refresh automatically when complete.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
