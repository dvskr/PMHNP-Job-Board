'use client';

import { useState, useEffect } from 'react';
import {
    Eye, MousePointerClick, FileCheck, TrendingUp, Activity, Users,
    BarChart3, MessageSquare, AlertTriangle, Zap, Globe,
} from 'lucide-react';

/* ─── Types ─── */
interface DayPoint { date: string; count: number }
interface TopJob {
    id: string; title: string; employer: string;
    views: number; clicks: number; applications: number;
    viewToClickRate: number; source: string | null; createdAt: string;
}
interface FeedbackItem { id: string; rating: number; message: string | null; page: string | null; createdAt: string }
interface ReportItem {
    id: string; reason: string; details: string | null; createdAt: string;
    job: { id: string; title: string; employer: string };
}
interface Summary {
    totalViews: number; totalClicks: number; totalApplications: number;
    views24h: number; views7d: number; clicks24h: number; clicks7d: number;
    apps24h: number; apps7d: number;
    totalUsers: number; newUsers7d: number; totalSubscribers: number;
    newsletterOptIns: number;
    activeAlerts: number; dailyAlerts: number; weeklyAlerts: number;
    activeJobs: number; employerPostedJobs: number;
    totalEmployerLeads: number;
    roleBreakdown: Record<string, number>;
    jobSourceBreakdown: Record<string, number>;
    employerLeadStatuses: Record<string, number>;
    conversionRates: { viewToClick: number; clickToApply: number; viewToApply: number };
}
interface UserGrowthData { users: DayPoint[]; subscribers: DayPoint[] }
interface AnalyticsData {
    summary?: Summary;
    sparklines?: { views: DayPoint[]; clicks: DayPoint[]; applications: DayPoint[] };
    topJobs?: TopJob[];
    userGrowth?: UserGrowthData;
    autofill?: { totalUsage: number; uniqueUsers: number };
    feedback?: { items: FeedbackItem[]; avgRating: number | null };
    reports?: ReportItem[];
}

/* ─── Styles ─── */
const card: React.CSSProperties = {
    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
    borderRadius: '14px', overflow: 'hidden',
};
const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };
const th: React.CSSProperties = {
    padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)',
    backgroundColor: 'var(--bg-tertiary)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
    padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap',
};

function BarChart({ data, color, height = 120 }: { data: DayPoint[]; color: string; height?: number }) {
    if (!data.length) return <p style={sub}>No data available</p>;
    const max = Math.max(...data.map(d => d.count), 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: `${height}px`, paddingTop: '8px' }}>
            {data.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>{d.count}</span>
                    <div
                        title={`${d.date}: ${d.count}`}
                        style={{
                            width: '100%', maxWidth: '36px', borderRadius: '4px 4px 0 0',
                            backgroundColor: color,
                            opacity: 0.3 + (d.count / max) * 0.7,
                            height: `${Math.max(4, (d.count / max) * (height - 30))}px`,
                            transition: 'height 0.4s ease',
                        }}
                    />
                    <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                        {d.date.slice(5)}
                    </span>
                </div>
            ))}
        </div>
    );
}

function FunnelStep({ icon, label, value, rate, color, width }: {
    icon: React.ReactNode; label: string; value: number; rate?: number; color: string; width: string;
}) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{
                width, height: '56px', borderRadius: '10px',
                background: `linear-gradient(135deg, ${color}25, ${color}10)`,
                border: `1px solid ${color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 10px', gap: '10px',
            }}>
                {icon}
                <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{value.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
            {rate !== undefined && (
                <div style={{ fontSize: '12px', marginTop: '4px', fontWeight: 700, color: rate >= 5 ? '#22C55E' : rate >= 2 ? '#F59E0B' : '#EF4444' }}>
                    {rate}% conversion
                </div>
            )}
        </div>
    );
}

type TabType = 'overview' | 'engagement' | 'users' | 'feedback' | 'reports';

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [days, setDays] = useState(30);

    useEffect(() => { fetchData(); }, [days]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/admin/analytics?days=${days}`);
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '10px 20px', fontSize: '14px', fontWeight: active ? 600 : 400,
        color: active ? '#2DD4BF' : 'var(--text-secondary)',
        backgroundColor: active ? 'rgba(45,212,191,0.1)' : 'transparent',
        border: 'none', borderBottom: active ? '2px solid #2DD4BF' : '2px solid transparent',
        cursor: 'pointer', transition: 'all 0.2s',
    });

    if (loading && !data) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, border: '3px solid var(--border-color)', borderTop: '3px solid #2DD4BF', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ ...sub, marginTop: 16 }}>Loading analytics…</p>
            </div>
        );
    }

    if (!data) return null;
    const s = data.summary;

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ ...heading, fontSize: 26 }}>Analytics</h1>
                    <p style={muted}>Deep dive into user engagement and platform performance</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {[7, 30, 90].map(d => (
                        <button key={d} onClick={() => setDays(d)} style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                            backgroundColor: days === d ? '#2DD4BF' : 'var(--bg-tertiary)',
                            color: days === d ? '#0F172A' : 'var(--text-secondary)',
                            border: days === d ? 'none' : '1px solid var(--border-color)',
                        }}>{d}d</button>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: 24, overflowX: 'auto' }}>
                {([
                    ['overview', 'Overview', <BarChart3 key="o" size={16} />],
                    ['engagement', 'Engagement', <Activity key="e" size={16} />],
                    ['users', 'User Growth', <Users key="u" size={16} />],
                    ['feedback', 'Feedback', <MessageSquare key="f" size={16} />],
                    ['reports', 'Reports', <AlertTriangle key="r" size={16} />],
                ] as [TabType, string, React.ReactNode][]).map(([key, label, icon]) => (
                    <button key={key} onClick={() => setActiveTab(key)} style={tabStyle(activeTab === key)}>
                        <span className="flex items-center gap-2">{icon} {label}</span>
                    </button>
                ))}
            </div>

            {/* ═══ OVERVIEW TAB ═══ */}
            {activeTab === 'overview' && s && (
                <>
                    {/* Big Funnel */}
                    <div style={{ ...card, padding: 28, marginBottom: 24 }}>
                        <h2 style={{ ...heading, fontSize: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={20} style={{ color: '#2DD4BF' }} /> Engagement Funnel ({days} days)
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8" style={{ maxWidth: 700, margin: '0 auto' }}>
                            <FunnelStep icon={<Eye size={22} style={{ color: '#3B82F6' }} />} label="Job Views" value={s.totalViews} color="#3B82F6" width="100%" />
                            <FunnelStep icon={<MousePointerClick size={22} style={{ color: '#A855F7' }} />} label="Apply Clicks" value={s.totalClicks} rate={s.conversionRates.viewToClick} color="#A855F7" width="85%" />
                            <FunnelStep icon={<FileCheck size={22} style={{ color: '#22C55E' }} />} label="Applications" value={s.totalApplications} rate={s.conversionRates.clickToApply} color="#22C55E" width="65%" />
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 20 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: s.conversionRates.viewToApply >= 1 ? '#22C55E' : '#F59E0B' }}>
                                Overall: {s.conversionRates.viewToApply}% view-to-application rate
                            </span>
                        </div>
                    </div>

                    {/* Platform Health + Audience */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ marginBottom: 24 }}>
                        {/* Platform Health */}
                        <div style={{ ...card, padding: 24 }}>
                            <h3 style={{ ...heading, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BarChart3 size={18} style={{ color: '#2DD4BF' }} /> Platform Health
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{s.activeJobs.toLocaleString()}</div>
                                    <div style={muted}>Active Jobs</div>
                                </div>
                                <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{s.employerPostedJobs}</div>
                                    <div style={muted}>Employer-Posted</div>
                                </div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Jobs by Source</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {Object.entries(s.jobSourceBreakdown || {})
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 6)
                                    .map(([source, count]) => {
                                        const pct = s.activeJobs > 0 ? (count / s.activeJobs * 100) : 0;
                                        return (
                                            <div key={source} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 90, textTransform: 'capitalize', flexShrink: 0 }}>{source}</span>
                                                <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#2DD4BF', borderRadius: 4 }} />
                                                </div>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', width: 40, textAlign: 'right' }}>{count}</span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Audience */}
                        <div style={{ ...card, padding: 24 }}>
                            <h3 style={{ ...heading, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Users size={18} style={{ color: '#3B82F6' }} /> Audience
                            </h3>
                            {/* Role breakdown */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                                {[
                                    { label: 'Job Seekers', value: s.roleBreakdown?.job_seeker || 0, color: '#3B82F6' },
                                    { label: 'Employers', value: s.roleBreakdown?.employer || 0, color: '#A855F7' },
                                    { label: 'Admins', value: s.roleBreakdown?.admin || 0, color: '#F59E0B' },
                                ].map(r => (
                                    <div key={r.label} style={{ padding: '12px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: r.color }}>{r.value}</div>
                                        <div style={{ ...muted, fontSize: 11 }}>{r.label}</div>
                                    </div>
                                ))}
                            </div>
                            {/* Newsletter + Alerts */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)' }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B' }}>{s.newsletterOptIns}</div>
                                    <div style={muted}>Newsletter Opt-ins</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.totalSubscribers} total leads</div>
                                </div>
                                <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)' }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#22C55E' }}>{s.activeAlerts}</div>
                                    <div style={muted}>Active Alerts</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.dailyAlerts} daily · {s.weeklyAlerts} weekly</div>
                                </div>
                            </div>
                            {/* Employer leads */}
                            {s.totalEmployerLeads > 0 && (
                                <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#A855F7' }}>{s.totalEmployerLeads}</div>
                                        <div style={muted}>Employer Leads</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        {Object.entries(s.employerLeadStatuses || {}).map(([status, count]) => (
                                            <div key={status} style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{count}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{status}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Engagement Quick Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ marginBottom: 24 }}>
                        {[
                            { icon: <Eye size={18} />, label: 'Views (24h)', value: s.views24h, delta: `${s.views7d} / week`, color: '#3B82F6' },
                            { icon: <MousePointerClick size={18} />, label: 'Clicks (24h)', value: s.clicks24h, delta: `${s.clicks7d} / week`, color: '#A855F7' },
                            { icon: <FileCheck size={18} />, label: 'Applications (24h)', value: s.apps24h, delta: `${s.apps7d} / week`, color: '#22C55E' },
                            { icon: <Zap size={18} />, label: 'Autofill Uses', value: data.autofill?.totalUsage || 0, delta: `${data.autofill?.uniqueUsers || 0} users`, color: '#EC4899' },
                        ].map(c => (
                            <div key={c.label} style={{ ...card, padding: '20px 22px' }}>
                                <div style={{ color: c.color, marginBottom: 8 }}>{c.icon}</div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{c.value.toLocaleString()}</div>
                                <div style={muted}>{c.label}</div>
                                <div style={{ fontSize: 11, color: c.color, fontWeight: 600, marginTop: 4 }}>{c.delta}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ═══ ENGAGEMENT TAB ═══ */}
            {activeTab === 'engagement' && (
                <>
                    {/* Charts */}
                    {data.sparklines && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginBottom: 24 }}>
                            {[
                                { label: 'Views', data: data.sparklines.views, color: '#3B82F6' },
                                { label: 'Clicks', data: data.sparklines.clicks, color: '#A855F7' },
                                { label: 'Applications', data: data.sparklines.applications, color: '#22C55E' },
                            ].map(c => (
                                <div key={c.label} style={{ ...card, padding: 24 }}>
                                    <h3 style={{ ...heading, fontSize: 16, marginBottom: 16 }}>{c.label} (Last 7 Days)</h3>
                                    <BarChart data={c.data} color={c.color} />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Top Jobs Table */}
                    {data.topJobs && data.topJobs.length > 0 && (
                        <div style={{ ...card, marginBottom: 24 }}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
                                <h2 style={{ ...heading, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <TrendingUp size={20} style={{ color: '#22C55E' }} /> Top Performing Jobs
                                </h2>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            {['#', 'Title', 'Employer', 'Views', 'Clicks', 'Apps', 'View→Click', 'Source'].map(h => (
                                                <th key={h} style={{ ...th, textAlign: ['Views', 'Clicks', 'Apps', 'View→Click'].includes(h) ? 'right' : 'left' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topJobs.map((job, i) => (
                                            <tr key={job.id}>
                                                <td style={td}>
                                                    <span style={{ fontWeight: 700, color: i < 3 ? ['#F59E0B', '#94A3B8', '#CD7F32'][i] : 'var(--text-tertiary)' }}>
                                                        #{i + 1}
                                                    </span>
                                                </td>
                                                <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {job.title}
                                                </td>
                                                <td style={td}>{job.employer}</td>
                                                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{job.views.toLocaleString()}</td>
                                                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{job.clicks.toLocaleString()}</td>
                                                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{job.applications}</td>
                                                <td style={{ ...td, textAlign: 'right' }}>
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                                        backgroundColor: job.viewToClickRate >= 5 ? 'rgba(34,197,94,0.12)' : job.viewToClickRate >= 2 ? 'rgba(234,179,8,0.12)' : 'rgba(148,163,184,0.12)',
                                                        color: job.viewToClickRate >= 5 ? '#22C55E' : job.viewToClickRate >= 2 ? '#EAB308' : '#94A3B8',
                                                    }}>{job.viewToClickRate}%</span>
                                                </td>
                                                <td style={{ ...td, textTransform: 'capitalize' }}>{job.source || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ═══ USER GROWTH TAB ═══ */}
            {activeTab === 'users' && data.userGrowth && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ marginBottom: 24 }}>
                    <div style={{ ...card, padding: 24 }}>
                        <h3 style={{ ...heading, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Users size={18} style={{ color: '#3B82F6' }} /> New Users ({days}d)
                        </h3>
                        <BarChart data={data.userGrowth.users} color="#3B82F6" height={160} />
                        <div style={{ marginTop: 12, textAlign: 'center', ...muted }}>
                            Total: {data.userGrowth.users.reduce((a, b) => a + b.count, 0)} new users
                        </div>
                    </div>
                    <div style={{ ...card, padding: 24 }}>
                        <h3 style={{ ...heading, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Globe size={18} style={{ color: '#22C55E' }} /> New Subscribers ({days}d)
                        </h3>
                        <BarChart data={data.userGrowth.subscribers} color="#22C55E" height={160} />
                        <div style={{ marginTop: 12, textAlign: 'center', ...muted }}>
                            Total: {data.userGrowth.subscribers.reduce((a, b) => a + b.count, 0)} new subscribers
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ FEEDBACK TAB ═══ */}
            {activeTab === 'feedback' && data.feedback && (
                <div style={{ ...card, marginBottom: 24 }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ ...heading, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MessageSquare size={20} style={{ color: '#F59E0B' }} /> User Feedback
                        </h2>
                        {data.feedback.avgRating !== null && (
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>
                                Avg: {'⭐'.repeat(Math.round(data.feedback.avgRating))} ({data.feedback.avgRating.toFixed(1)})
                            </span>
                        )}
                    </div>
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {data.feedback.items.length === 0 && <p style={sub}>No feedback yet</p>}
                        {data.feedback.items.map(fb => (
                            <div key={fb.id} style={{
                                padding: '14px 18px', borderRadius: '10px',
                                backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ color: '#F59E0B', fontWeight: 700 }}>{'⭐'.repeat(fb.rating)}</span>
                                    <span style={muted}>{new Date(fb.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>
                                {fb.message && <p style={{ ...sub, margin: 0 }}>{fb.message}</p>}
                                {fb.page && <p style={{ ...muted, marginTop: 4 }}>Page: {fb.page}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ REPORTS TAB ═══ */}
            {activeTab === 'reports' && data.reports && (
                <div style={{ ...card, marginBottom: 24 }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
                        <h2 style={{ ...heading, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={20} style={{ color: '#EF4444' }} /> Job Reports ({data.reports.length})
                        </h2>
                    </div>
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {data.reports.length === 0 && <p style={sub}>No reports 🎉</p>}
                        {data.reports.map(r => (
                            <div key={r.id} style={{
                                padding: '14px 18px', borderRadius: '10px',
                                backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <div>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{r.job.title}</span>
                                        <span style={{ ...muted, marginLeft: 8 }}>by {r.job.employer}</span>
                                    </div>
                                    <span style={muted}>{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>
                                <span style={{
                                    display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                                    backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444', marginBottom: 4,
                                }}>{r.reason}</span>
                                {r.details && <p style={{ ...sub, margin: '6px 0 0' }}>{r.details}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
