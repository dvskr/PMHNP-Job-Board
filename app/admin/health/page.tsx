'use client';

import { useEffect, useState } from 'react';
import {
    Activity, AlertTriangle, ArrowRight, CheckCircle2, Database,
    ExternalLink, HeartPulse, Layers, Radio, Search, ShieldAlert, TrendingDown,
} from 'lucide-react';

/* ─── Types ─── */
interface HealthData {
    success: boolean;
    generatedAt: string;
    catalog: {
        total: number;
        published: number;
        unpublished: number;
        manuallyUnpublished: number;
        unpublishedLast24h: number;
        unpublishedLast7d: number;
        deadSuspectedPublished: number;
    };
    sources: Array<{
        source: string;
        total: number;
        published: number;
        deadSuspected: number;
    }>;
    outcomes: Array<{ outcome: string; count: number }>;
    softPatternHits: Array<{ patternId: string | null; count: number }>;
    presenceBuckets: Array<{ bucket: string; count: number }>;
    recentFlips: Array<{
        id: string;
        title: string;
        employer: string;
        sourceProvider: string | null;
        updatedAt: string;
        consecutiveMissing: number;
        lastCheck: {
            outcome: string;
            checkType: string;
            httpStatus: number | null;
            softPatternId: string | null;
            checkedAt: string;
        } | null;
    }>;
    checkThroughput: Array<{ checkType: string; count: number }>;
    lastCheckAt: string | null;
}

/* ─── Design tokens (match existing admin claymorphism) ─── */
const clayCard: React.CSSProperties = {
    backgroundColor: '#FAFBF9',
    border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: '22px',
    padding: '22px',
    boxShadow:
        '8px 8px 20px rgba(0,0,0,0.06), -6px -6px 16px rgba(255,255,255,0.9), ' +
        'inset 3px 3px 6px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.03)',
};
const clayInset: React.CSSProperties = {
    backgroundColor: '#F0F3F2',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: '14px',
    padding: '12px 14px',
    boxShadow:
        'inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 3px rgba(0,0,0,0.03), ' +
        '3px 3px 8px rgba(0,0,0,0.03)',
};
const sectionTitle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 700,
    color: '#1A2E35',
    margin: 0,
    letterSpacing: '-0.01em',
};
const sub: React.CSSProperties = { color: '#6B7F8A', fontSize: '13px' };
const muted: React.CSSProperties = { color: '#94A3B8', fontSize: '12px' };

/* ─── Outcome → semantic color ─── */
function outcomeColor(outcome: string): string {
    if (
        outcome.startsWith('alive') ||
        outcome === 'inconclusive_403' ||
        outcome === 'inconclusive_429' ||
        outcome === 'inconclusive_5xx' ||
        outcome === 'inconclusive_3xx_loop' ||
        outcome === 'inconclusive_network' ||
        outcome === 'inconclusive_other' ||
        outcome.startsWith('seen') ||
        outcome === 'skipped_no_redis' ||
        outcome === 'skipped_partial_fetch' ||
        outcome === 'skipped_low_baseline'
    ) {
        return '#0D9488';
    }
    if (
        outcome.startsWith('http_4') ||
        outcome === 'soft_404' ||
        outcome === 'greenhouse_api_404' ||
        outcome === 'http_410' ||
        outcome === 'missing_from_source'
    ) {
        return '#DC2626';
    }
    return '#6B7F8A';
}

function fmtNumber(n: number): string {
    return n.toLocaleString('en-US');
}

function fmtRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

/* ─── Metric tile ─── */
function MetricTile({
    icon, label, value, accent, hint,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    accent: string;
    hint?: string;
}) {
    return (
        <div style={clayCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{
                    width: '40px', height: '40px', borderRadius: '14px',
                    background: `${accent}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.6), 4px 4px 10px rgba(0,0,0,0.04)`,
                    color: accent,
                }}>
                    {icon}
                </div>
                <div style={{ ...sub, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {label}
                </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#1A2E35', letterSpacing: '-0.02em' }}>
                {typeof value === 'number' ? fmtNumber(value) : value}
            </div>
            {hint && <div style={{ ...muted, marginTop: '6px' }}>{hint}</div>}
        </div>
    );
}

export default function JobHealthDashboard() {
    const [data, setData] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/admin/health', { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json: HealthData = await res.json();
                if (!cancelled) setData(json);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
                <HeartPulse className="animate-pulse" size={48} style={{ color: '#0D9488' }} />
                <p style={{ marginTop: '16px', color: '#6B7F8A' }}>Loading job-health metrics…</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
                <div style={{ ...clayCard, color: '#991B1B', backgroundColor: '#FEF2F2' }}>
                    Error loading job-health data: {error || 'unknown'}
                </div>
            </div>
        );
    }

    const c = data.catalog;
    const deadRatePct = c.published > 0 ? (c.deadSuspectedPublished / c.published) * 100 : 0;

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1A2E35', marginBottom: '4px', fontFamily: 'var(--font-lora), Georgia, serif' }}>
                        Job Health
                    </h1>
                    <p style={sub}>
                        Live view of the dead-link / source-presence detection pipeline (Sprints 1–5).
                        Last check: {data.lastCheckAt ? fmtRelativeTime(data.lastCheckAt) : 'never'}.
                    </p>
                </div>
                <a
                    href="https://app.inngest.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '10px 16px', borderRadius: '14px',
                        backgroundColor: '#FAFBF9', color: '#1A2E35',
                        border: '1px solid rgba(255,255,255,0.6)',
                        fontSize: '13px', fontWeight: 600, textDecoration: 'none',
                        boxShadow: '4px 4px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.6)',
                    }}
                >
                    Inngest dashboard <ExternalLink size={14} />
                </a>
            </div>

            {/* Metric tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                <MetricTile
                    icon={<Database size={20} />} accent="#0D9488"
                    label="Published" value={c.published}
                    hint={`${fmtNumber(c.total)} total in catalog`}
                />
                <MetricTile
                    icon={<ShieldAlert size={20} />} accent={deadRatePct > 5 ? '#DC2626' : '#0D9488'}
                    label="Dead-suspected (live)"
                    value={c.deadSuspectedPublished}
                    hint={`${deadRatePct.toFixed(1)}% of published — 3+ presence misses`}
                />
                <MetricTile
                    icon={<TrendingDown size={20} />} accent="#F59E0B"
                    label="Unpublished 24h"
                    value={c.unpublishedLast24h}
                    hint={`${fmtNumber(c.unpublishedLast7d)} in last 7d`}
                />
                <MetricTile
                    icon={<CheckCircle2 size={20} />} accent="#6366F1"
                    label="Manually unpublished"
                    value={c.manuallyUnpublished}
                    hint="Admin overrides — never auto-resurrected"
                />
            </div>

            {/* Two-column body */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>

                {/* By source */}
                <div style={clayCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <Layers size={18} style={{ color: '#0D9488' }} />
                        <h2 style={sectionTitle}>By source</h2>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {data.sources.map((s) => {
                            const deadRate = s.published > 0 ? (s.deadSuspected / s.published) * 100 : 0;
                            const danger = deadRate > 10;
                            return (
                                <div key={s.source} style={{ ...clayInset, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                        <span style={{ fontWeight: 600, color: '#1A2E35', fontSize: '13px' }}>
                                            {s.source}
                                        </span>
                                        <span style={muted}>
                                            {fmtNumber(s.published)} live · {fmtNumber(s.total)} total
                                        </span>
                                    </div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 10px', borderRadius: '10px',
                                        backgroundColor: danger ? '#FEE2E2' : '#E6FAF8',
                                        color: danger ? '#991B1B' : '#0D9488',
                                        fontSize: '12px', fontWeight: 600,
                                    }}>
                                        {danger && <AlertTriangle size={12} />}
                                        {fmtNumber(s.deadSuspected)} dead ({deadRate.toFixed(1)}%)
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Vote outcomes 7d */}
                <div style={clayCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <Activity size={18} style={{ color: '#0D9488' }} />
                        <h2 style={sectionTitle}>Outcome distribution (7d)</h2>
                    </div>
                    {data.outcomes.length === 0 ? (
                        <div style={muted}>No checks recorded in the last 7 days.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {data.outcomes.map((o) => {
                                const total = data.outcomes.reduce((acc, x) => acc + x.count, 0);
                                const pct = total > 0 ? (o.count / total) * 100 : 0;
                                const color = outcomeColor(o.outcome);
                                return (
                                    <div key={o.outcome} style={clayInset}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <code style={{ fontSize: '12px', color: '#1A2E35', fontWeight: 600 }}>{o.outcome}</code>
                                            <span style={{ fontSize: '12px', color, fontWeight: 600 }}>
                                                {fmtNumber(o.count)} <span style={muted}>({pct.toFixed(1)}%)</span>
                                            </span>
                                        </div>
                                        <div style={{ height: '4px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Soft-404 patterns */}
                <div style={clayCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <Search size={18} style={{ color: '#0D9488' }} />
                        <h2 style={sectionTitle}>Soft-404 pattern hits (7d)</h2>
                    </div>
                    {data.softPatternHits.length === 0 ? (
                        <div style={muted}>No soft-404 matches in the last 7 days.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {data.softPatternHits.map((p) => (
                                <div key={p.patternId ?? 'unknown'} style={{ ...clayInset, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <code style={{ fontSize: '12px', color: '#1A2E35' }}>{p.patternId ?? 'unknown'}</code>
                                    <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600 }}>{fmtNumber(p.count)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Source-presence buckets */}
                <div style={clayCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <Radio size={18} style={{ color: '#0D9488' }} />
                        <h2 style={sectionTitle}>Source-presence (live jobs)</h2>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {data.presenceBuckets.map((b) => {
                            const isDanger = b.bucket.includes('dead-suspected');
                            return (
                                <div key={b.bucket} style={{ ...clayInset, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: '#1A2E35', fontWeight: 600 }}>{b.bucket}</span>
                                    <span style={{
                                        fontSize: '12px',
                                        color: isDanger ? '#DC2626' : '#0D9488',
                                        fontWeight: 600,
                                    }}>
                                        {fmtNumber(b.count)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <p style={{ ...muted, marginTop: '12px' }}>
                        Jobs missing from 3+ consecutive ingests are auto-unpublished by the
                        source-presence-unpublish cron at 12:55 UTC.
                    </p>
                </div>

                {/* Check throughput */}
                <div style={clayCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <Activity size={18} style={{ color: '#0D9488' }} />
                        <h2 style={sectionTitle}>Check throughput (7d)</h2>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {data.checkThroughput.length === 0 ? (
                            <div style={muted}>No checks recorded.</div>
                        ) : data.checkThroughput.map((c) => (
                            <div key={c.checkType} style={{ ...clayInset, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <code style={{ fontSize: '12px', color: '#1A2E35' }}>{c.checkType}</code>
                                <span style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600 }}>{fmtNumber(c.count)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent flips — full width via spanning all cols */}
                <div style={{ ...clayCard, gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <TrendingDown size={18} style={{ color: '#DC2626' }} />
                        <h2 style={sectionTitle}>Recent flips (last 24h, max 25)</h2>
                    </div>
                    {data.recentFlips.length === 0 ? (
                        <div style={muted}>No automatic unpublishes in the last 24 hours.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {data.recentFlips.map((j) => (
                                <div key={j.id} style={{ ...clayInset, display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            {j.title}
                                        </div>
                                        <div style={{ ...muted, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            {j.employer} · {j.sourceProvider ?? 'unknown'}
                                        </div>
                                    </div>
                                    <code style={{
                                        fontSize: '11px',
                                        padding: '3px 8px', borderRadius: '8px',
                                        background: '#FFFFFF',
                                        color: j.lastCheck ? outcomeColor(j.lastCheck.outcome) : '#94A3B8',
                                        fontWeight: 600,
                                    }}>
                                        {j.lastCheck?.outcome ?? 'no_check'}
                                    </code>
                                    <span style={{ ...muted, whiteSpace: 'nowrap' }}>
                                        miss: {j.consecutiveMissing}
                                    </span>
                                    <span style={{ ...muted, whiteSpace: 'nowrap' }}>
                                        {fmtRelativeTime(j.updatedAt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={muted}>
                    Generated {fmtRelativeTime(data.generatedAt)}.
                    Source-presence baseline-tuning ramped 2026-04-29.
                </span>
                <a
                    href="/admin/cron"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '13px', color: '#0D9488', fontWeight: 600,
                        textDecoration: 'none',
                    }}
                >
                    Cron schedule & manual triggers <ArrowRight size={14} />
                </a>
            </div>
        </div>
    );
}
