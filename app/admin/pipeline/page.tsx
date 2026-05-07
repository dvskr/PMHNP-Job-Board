'use client';

/**
 * Admin Pipeline Flow panel — Goal #6.
 *
 * Single-tab visualization of the ingest funnel, per-source rejection
 * buckets, and recent cron run history. Designed so a new team member
 * can answer "where did the 47k go?" in one glance.
 */
import { useEffect, useState, useMemo } from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock, Filter, RefreshCw, XCircle } from 'lucide-react';
import { formatCT } from '@/lib/format-ct';

interface SourceFunnel {
    source: string;
    fetched: number;
    added: number;
    duplicates: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
    avgQualityScore: number | null;
}

interface CronRunRow {
    name: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    success: boolean;
    error: string | null;
    metrics: unknown;
}

interface PipelineFlowResponse {
    today: { funnels: SourceFunnel[]; totals: { fetched: number; added: number; rejected: number } };
    last7d: { funnels: SourceFunnel[]; totals: { fetched: number; added: number; rejected: number } };
    recentRuns: CronRunRow[];
    topRejectionReasons: Array<{ reason: string; n: number }>;
    activeSources: string[];
}

type Window = 'today' | 'last7d';

function bucket(reason: string): 'relevance' | 'normalizer' | 'duplicate' | 'dead' | 'other' {
    if (reason.startsWith('relevance_')) return 'relevance';
    if (reason.startsWith('normalizer_')) return 'normalizer';
    if (reason.startsWith('duplicate_')) return 'duplicate';
    if (reason === 'dead_at_ingest') return 'dead';
    return 'other';
}

const BUCKET_COLOR: Record<string, string> = {
    relevance: '#F59E0B',
    normalizer: '#EC4899',
    duplicate: '#8B5CF6',
    dead: '#EF4444',
    other: '#94A3B8',
    added: '#0D9488',
};

function fmt(n: number | null | undefined): string {
    if (n == null) return '—';
    return n.toLocaleString();
}

function fmtDur(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function FunnelBar({ funnel }: { funnel: SourceFunnel }) {
    // Aggregate rejected_by_reason into 5 visual buckets
    const buckets = useMemo(() => {
        const b = { relevance: 0, normalizer: 0, duplicate: 0, dead: 0, other: 0 };
        for (const [reason, n] of Object.entries(funnel.rejectedByReason ?? {})) {
            b[bucket(reason)] += n;
        }
        return b;
    }, [funnel.rejectedByReason]);

    const total = funnel.fetched > 0 ? funnel.fetched : 1;
    const pct = (n: number) => Math.max(0.5, (n / total) * 100); // floor at 0.5% so tiny segments are visible

    const segments: Array<[string, number, string]> = ([
        ['relevance', buckets.relevance, BUCKET_COLOR.relevance] as [string, number, string],
        ['normalizer', buckets.normalizer, BUCKET_COLOR.normalizer] as [string, number, string],
        ['duplicate', buckets.duplicate, BUCKET_COLOR.duplicate] as [string, number, string],
        ['dead', buckets.dead, BUCKET_COLOR.dead] as [string, number, string],
        ['other', buckets.other, BUCKET_COLOR.other] as [string, number, string],
        ['added', funnel.added, BUCKET_COLOR.added] as [string, number, string],
    ]).filter(([, n]) => n > 0);

    return (
        <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                {segments.map(([label, n, color]) => (
                    <div
                        key={label}
                        title={`${label}: ${fmt(n)} (${((n / total) * 100).toFixed(1)}%)`}
                        style={{
                            width: `${pct(n)}%`,
                            background: color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            color: 'white',
                            fontWeight: 600,
                            cursor: 'help',
                        }}
                    >
                        {pct(n) > 6 ? fmt(n) : ''}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function PipelineFlowPage() {
    const [data, setData] = useState<PipelineFlowResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [window, setWindow] = useState<Window>('today');
    const [lastFetched, setLastFetched] = useState<Date | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/admin/pipeline-flow', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json: PipelineFlowResponse = await res.json();
            setData(json);
            setLastFetched(new Date());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const view = data ? data[window] : null;
    const funnels = view?.funnels ?? [];
    const totals = view?.totals ?? { fetched: 0, added: 0, rejected: 0 };

    return (
        <div style={{ padding: '24px 28px', maxWidth: '1280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#1A2E35', fontFamily: 'var(--font-lora), Georgia, serif' }}>
                        Pipeline Flow
                    </h1>
                    <p style={{ marginTop: '6px', fontSize: '14px', color: '#6B7F8A' }}>
                        Per-source ingest funnel · cron run history · top rejection reasons
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {lastFetched && (
                        <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                            Updated {formatCT(lastFetched, 'time')}
                        </span>
                    )}
                    <button
                        onClick={load}
                        disabled={loading}
                        style={{
                            padding: '8px 14px',
                            background: '#0D9488',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: loading ? 'wait' : 'pointer',
                            display: 'flex',
                            gap: '6px',
                            alignItems: 'center',
                            opacity: loading ? 0.6 : 1,
                        }}
                    >
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '12px 16px', color: '#991B1B', marginBottom: '16px' }}>
                    <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    {error}
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {(['today', 'last7d'] as Window[]).map((w) => (
                    <button
                        key={w}
                        onClick={() => setWindow(w)}
                        style={{
                            padding: '8px 16px',
                            background: window === w ? '#1A2E35' : '#FFFFFF',
                            color: window === w ? 'white' : '#1A2E35',
                            border: '1px solid #E8ECF0',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {w === 'today' ? 'Today' : 'Last 7 days'}
                    </button>
                ))}
            </div>

            {/* Totals */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                <KpiCard label="Fetched" value={totals.fetched} accent="#1A2E35" />
                <KpiCard label="Added" value={totals.added} accent={BUCKET_COLOR.added} />
                <KpiCard label="Rejected" value={totals.rejected} accent={BUCKET_COLOR.duplicate} />
            </div>

            {/* Per-source funnels */}
            <Section title="Per-source funnel" icon={<Filter size={16} />}>
                {funnels.length === 0 && !loading && (
                    <div style={{ padding: '24px', color: '#6B7F8A', textAlign: 'center' }}>No source_stats rows yet for this window.</div>
                )}
                <div style={{ display: 'grid', gap: '14px' }}>
                    {funnels.map((f) => (
                        <div key={f.source} style={{ background: '#FFFFFF', border: '1px solid #E8ECF0', borderRadius: '12px', padding: '14px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div style={{ fontWeight: 600, color: '#1A2E35', fontSize: '14px' }}>{f.source}</div>
                                <div style={{ fontSize: '12px', color: '#6B7F8A' }}>
                                    fetched {fmt(f.fetched)} → added <span style={{ color: BUCKET_COLOR.added, fontWeight: 600 }}>{fmt(f.added)}</span>
                                    {f.avgQualityScore != null && <> · avgQ {Math.round(f.avgQualityScore)}</>}
                                </div>
                            </div>
                            <FunnelBar funnel={f} />
                        </div>
                    ))}
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '14px', fontSize: '11px' }}>
                    {Object.entries(BUCKET_COLOR).map(([label, color]) => (
                        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B7F8A' }}>
                            <span style={{ width: '10px', height: '10px', background: color, borderRadius: '2px' }} />
                            {label}
                        </span>
                    ))}
                </div>
            </Section>

            {/* Top rejection reasons */}
            <Section title="Top rejection reasons (last 7d)" icon={<XCircle size={16} />}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#F8FAF9', textAlign: 'left' }}>
                            <th style={{ padding: '10px 14px', fontWeight: 600, color: '#1A2E35' }}>Reason</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600, color: '#1A2E35', textAlign: 'right' }}>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data?.topRejectionReasons ?? []).map((r) => (
                            <tr key={r.reason} style={{ borderTop: '1px solid #E8ECF0' }}>
                                <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: '#1A2E35' }}>{r.reason}</td>
                                <td style={{ padding: '8px 14px', textAlign: 'right', color: '#6B7F8A' }}>{fmt(r.n)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            {/* Recent cron runs */}
            <Section title="Recent cron runs" icon={<Activity size={16} />}>
                {data?.recentRuns?.length === 0 && (
                    <div style={{ padding: '12px 14px', color: '#6B7F8A', fontSize: '13px' }}>
                        No runs logged yet — `withCronTracking` only fires after deploy. After the next ingest cron, rows will appear here.
                    </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#F8FAF9', textAlign: 'left' }}>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Cron</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Started</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Duration</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data?.recentRuns ?? []).map((r, i) => (
                            <tr key={i} style={{ borderTop: '1px solid #E8ECF0' }}>
                                <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{r.name}</td>
                                <td style={{ padding: '8px 14px', color: '#6B7F8A' }}>{formatCT(r.startedAt)}</td>
                                <td style={{ padding: '8px 14px', color: '#6B7F8A' }}>{fmtDur(r.durationMs)}</td>
                                <td style={{ padding: '8px 14px' }}>
                                    {r.success ? (
                                        <span style={{ color: '#0D9488', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <CheckCircle2 size={14} /> ok
                                        </span>
                                    ) : (
                                        <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '4px' }} title={r.error ?? ''}>
                                            <XCircle size={14} /> failed
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            <style jsx global>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function KpiCard({ label, value, accent }: { label: string; value: number | null | undefined; accent: string }) {
    const display = value == null ? '—' : value.toLocaleString();
    return (
        <div style={{ background: '#FFFFFF', border: '1px solid #E8ECF0', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontSize: '12px', color: '#6B7F8A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: accent, marginTop: '4px' }}>{display}</div>
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#1A2E35' }}>
                {icon}
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{title}</h2>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E8ECF0', borderRadius: '12px', overflow: 'hidden' }}>
                {children}
            </div>
        </div>
    );
}
