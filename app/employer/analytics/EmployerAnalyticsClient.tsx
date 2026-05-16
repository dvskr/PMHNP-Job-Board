'use client';

import { useEffect, useState } from 'react';
import { Loader2, Download, BarChart3, Eye, ExternalLink } from 'lucide-react';

interface JobSummary {
  id: string;
  title: string;
  views: number;
  clicks: number;
  ctr: number;
}

interface AnalyticsResponse {
  tier: string;
  summary: { totalViews: number; totalClicks: number; ctr: number };
  jobs?: JobSummary[];
  upgradeHint?: string;
}

const card: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), inset 1px 1px 2px rgba(255,255,255,0.6)',
  padding: '24px',
};

const statTile: React.CSSProperties = {
  ...card,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '20px 22px',
};

export default function EmployerAnalyticsClient() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<'views' | 'clicks' | 'ctr'>('views');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/employer/analytics?days=${days}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((body: AnalyticsResponse) => {
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const sortedJobs = (data?.jobs ?? []).slice().sort((a, b) => b[sortKey] - a[sortKey]);

  const exportCsv = () => {
    if (!data?.jobs) return;
    const rows = [
      ['Job ID', 'Title', 'Views', 'Clicks', 'CTR %'],
      ...data.jobs.map((j) => [j.id, j.title, String(j.views), String(j.clicks), String(j.ctr)]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pmhnp-job-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontSize: 24, fontWeight: 700, color: '#1A2E35', margin: 0 }}>
          <BarChart3 size={22} style={{ display: 'inline', marginRight: 8, color: '#0D9488' }} />
          Job Analytics
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              padding: '6px 12px', borderRadius: 10, fontSize: 13,
              border: '1px solid rgba(0,0,0,0.08)', background: '#F5F6F8',
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data?.jobs?.length}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
              border: 'none', cursor: data?.jobs?.length ? 'pointer' : 'not-allowed',
              opacity: data?.jobs?.length ? 1 : 0.5,
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Loader2 className="animate-spin" size={18} />
          <span>Loading analytics…</span>
        </div>
      )}

      {error && (
        <div style={{ ...card, color: '#EF4444' }}>Failed to load: {error}</div>
      )}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 18 }}>
            <div style={statTile}>
              <span style={{ fontSize: 12, color: '#8A9BA6', fontWeight: 600 }}>Total views</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#1A2E35' }}>{data.summary.totalViews.toLocaleString()}</span>
            </div>
            <div style={statTile}>
              <span style={{ fontSize: 12, color: '#8A9BA6', fontWeight: 600 }}>Apply clicks</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#1A2E35' }}>{data.summary.totalClicks.toLocaleString()}</span>
            </div>
            <div style={statTile}>
              <span style={{ fontSize: 12, color: '#8A9BA6', fontWeight: 600 }}>CTR</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#0F766E' }}>{data.summary.ctr}%</span>
            </div>
          </div>

          {data.upgradeHint && (
            <div style={{ ...card, background: '#FFFBEB', borderColor: '#FCD34D', marginBottom: 18 }}>
              {data.upgradeHint}
            </div>
          )}

          {data.jobs && data.jobs.length > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A2E35', margin: 0 }}>Per-job breakdown</h2>
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  {(['views', 'clicks', 'ctr'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSortKey(k)}
                      style={{
                        padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: sortKey === k ? '#CCFBF1' : '#F5F6F8',
                        color: sortKey === k ? '#0F766E' : '#475569',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {k === 'ctr' ? 'CTR' : k[0].toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#8A9BA6', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <th style={{ padding: '6px 8px' }}>Job</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Views</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Clicks</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>CTR</th>
                      <th style={{ padding: '6px 8px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedJobs.map((j) => (
                      <tr key={j.id} style={{ background: '#F9FAFB', borderRadius: 10 }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1A2E35' }}>{j.title}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{j.views.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{j.clicks.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#0F766E' }}>{j.ctr}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <a href={`/jobs/${j.id}`} style={{ color: '#0D9488', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                            View <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.jobs && data.jobs.length === 0 && (
            <div style={{ ...card, color: '#8A9BA6', textAlign: 'center' }}>
              <Eye size={20} style={{ display: 'block', margin: '0 auto 8px' }} />
              No job activity yet. Post your first job to start tracking views and applies.
            </div>
          )}
        </>
      )}
    </div>
  );
}
