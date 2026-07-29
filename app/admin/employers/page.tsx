'use client';

import { useState, useEffect } from 'react';
import { formatCT } from '@/lib/format-ct';
import {
    Building2, UserCheck, UserX, Briefcase, CheckCircle2, CreditCard, Inbox,
    AlertTriangle, Search, ChevronDown,
} from 'lucide-react';

/* ─── Types ───
 * The GET /api/admin/employers contract, imported rather than mirrored. The
 * route produces these exact types from the same module, so a field rename on
 * either side is a compile error instead of a silently blank column. This repo
 * has already paid for hand-mirrored shapes drifting (see
 * tests/lib/filter-clauses-parity.test.ts).
 *
 * `import type` erases at build time, so nothing from that module reaches the
 * client bundle.
 *
 * NOTE: `id` is the Supabase auth id (UserProfile.supabaseId), because
 * EmployerJob.userId references supabaseId. It is NOT the same identifier the
 * /api/admin/users table calls `id` (that one is the UserProfile CUID), so do
 * not feed this id to /api/admin/users/[id]. Account-less posters carry a
 * synthetic 'orphan:<key>' id instead.
 */
import type {
    AdminEmployerRow as EmployerRow,
    AdminEmployerSummary as Summary,
    EmployerApplicationCounts as EmployerApplications,
    EmployerHiringStatus as HiringStatus,
} from '@/lib/admin/employer-overview-types';

/* ─── Styles ─── */
const card: React.CSSProperties = { backgroundColor: '#FAFBF9', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '18px', boxShadow: '8px 8px 20px rgba(0,0,0,0.05), -6px -6px 16px rgba(255,255,255,0.9), inset 3px 3px 6px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' };
const heading: React.CSSProperties = { color: '#1A2E35', fontWeight: 700 };
const sub: React.CSSProperties = { color: '#6B7F8A', fontSize: '14px' };
const muted: React.CSSProperties = { color: '#94A3B8', fontSize: '12px' };
const th: React.CSSProperties = { padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', borderBottom: '1px solid #E8ECF0', textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '14px 16px', fontSize: '13px', color: '#6B7F8A', borderBottom: '1px solid #E8ECF0', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: '8px', fontSize: '13px', backgroundColor: '#F8FAF9', border: '1px solid rgba(255,255,255,0.5)', color: '#1A2E35', outline: 'none' };

type BadgeColor = 'green' | 'purple' | 'blue' | 'gray' | 'red' | 'orange';

function badge(text: string, color: BadgeColor) {
    const colors = {
        green: { bg: 'rgba(34,197,94,0.12)', text: '#22C55E' },
        purple: { bg: 'rgba(168,85,247,0.12)', text: '#A855F7' },
        blue: { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
        gray: { bg: 'rgba(148,163,184,0.12)', text: '#94A3B8' },
        red: { bg: 'rgba(239,68,68,0.12)', text: '#EF4444' },
        orange: { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
    };
    return <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: colors[color].bg, color: colors[color].text }}>{text}</span>;
}

/* ─── Hiring status presentation ─── */
const HIRING_STATUS: Record<HiringStatus, { label: string; color: BadgeColor }> = {
    hired: { label: 'Hired', color: 'green' },
    in_progress: { label: 'In progress', color: 'blue' },
    untriaged: { label: 'Untriaged', color: 'orange' },
    all_rejected: { label: 'All rejected', color: 'red' },
    no_applicants: { label: 'No applicants', color: 'gray' },
    no_posts: { label: 'No posts', color: 'gray' },
};
const HIRING_STATUS_KEYS = Object.keys(HIRING_STATUS) as HiringStatus[];

/**
 * Posts whose paymentStatus is none of paid, free, or pending. The Stripe
 * webhook also writes 'refunded' and 'disputed', and those still count toward
 * posts.total, so without this the Payment column renders an empty cell for an
 * employer whose only post was refunded.
 */
function otherPaymentPosts(emp: EmployerRow): number {
    return Math.max(0, emp.posts.total - emp.posts.paid - emp.posts.free - emp.posts.pending);
}

function hiringBadge(status: HiringStatus) {
    const meta = HIRING_STATUS[status];
    // Unknown value fallback, mirroring the pattern in app/admin/users/page.tsx
    if (!meta) return badge(String(status), 'gray');
    return badge(meta.label, meta.color);
}

type SortKey = 'posts' | 'applications' | 'untriaged' | 'lastPosted' | 'name';
type SortDir = 'asc' | 'desc';

/**
 * Row filter. 'has_untriaged' is deliberately NOT a hiringStatus: it selects
 * every employer holding at least one applicant still at 'applied', including
 * those whose hiringStatus reads 'in_progress' or 'hired' because they moved
 * some other candidate. That is the same population the summary counts as
 * employersWithUntriaged, so the stat tile and the filtered table agree.
 * Filtering on hiringStatus 'untriaged' alone would silently hide every
 * employer who triaged one applicant and abandoned the rest.
 */
type RowFilter = 'all' | 'has_untriaged' | HiringStatus;

export default function AdminEmployersPage() {
    const [employers, setEmployers] = useState<EmployerRow[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<RowFilter>('all');
    const [accountFilter, setAccountFilter] = useState('all');

    // Sorting
    const [sortKey, setSortKey] = useState<SortKey>('applications');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/admin/employers');
            const data = await res.json();
            // The route returns { success: true, summary, employers }; guard on the
            // payload itself so a bare { summary, employers } body also renders.
            if (res.ok && data?.summary && Array.isArray(data.employers)) {
                setEmployers(data.employers);
                setSummary(data.summary);
            } else {
                setLoadError(true);
            }
        } catch (err) {
            console.error('Error:', err);
            setLoadError(true);
        } finally { setLoading(false); }
    };

    const applySort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'));
            return;
        }
        setSortKey(key);
        setSortDir(key === 'name' ? 'asc' : 'desc');
    };

    /* ─── Filter, then sort. Both client side over the already fetched rows. ─── */
    const filtered = employers.filter(e => {
        if (statusFilter === 'has_untriaged') {
            if (e.applications.applied === 0) return false;
        } else if (statusFilter !== 'all' && e.hiringStatus !== statusFilter) return false;
        if (accountFilter === 'with' && !e.hasAccount) return false;
        if (accountFilter === 'without' && e.hasAccount) return false;
        if (search) {
            const q = search.toLowerCase();
            return e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
        }
        return true;
    });

    const sortValue = (e: EmployerRow): number | string => {
        if (sortKey === 'posts') return e.posts.total;
        if (sortKey === 'applications') return e.applications.total;
        if (sortKey === 'untriaged') return e.applications.applied;
        if (sortKey === 'lastPosted') return e.lastPostedAt ? new Date(e.lastPostedAt).getTime() : 0;
        return e.name.toLowerCase();
    };

    const sorted = [...filtered].sort((a, b) => {
        const av = sortValue(a);
        const bv = sortValue(b);
        let cmp = 0;
        if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
        else cmp = Number(av) - Number(bv);
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const statusCount = (status: HiringStatus) => employers.filter(e => e.hiringStatus === status).length;
    const untriagedCount = employers.filter(e => e.applications.applied > 0).length;

    const sortableTh = (label: string, key: SortKey) => (
        <th style={{ ...th, cursor: 'pointer', color: sortKey === key ? '#0D9488' : '#94A3B8' }}
            onClick={() => applySort(key)} title={`Sort by ${label.toLowerCase()}`}>
            <span className="flex items-center gap-1">
                {label}
                {sortKey === key && (
                    <ChevronDown size={12} style={{ transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none' }} />
                )}
            </span>
        </th>
    );

    if (loading) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ width: 48, height: 48, border: '3px solid #E8ECF0', borderTop: '3px solid #0D9488', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ ...sub, marginTop: 16 }}>Loading employers…</p>
            </div>
        );
    }

    const statTiles: Array<{ icon: React.ReactNode; label: string; value: number; color: string; onClick?: () => void }> = summary ? [
        { icon: <Building2 size={18} />, label: 'Employer Accounts', value: summary.totalAccounts, color: '#0D9488' },
        { icon: <UserCheck size={18} />, label: 'Accounts With Posts', value: summary.accountsWithPosts, color: '#3B82F6' },
        { icon: <UserX size={18} />, label: 'Never Posted', value: summary.accountsNeverPosted, color: '#EC4899' },
        { icon: <Briefcase size={18} />, label: 'Total Posts', value: summary.totalPosts, color: '#A855F7' },
        { icon: <CheckCircle2 size={18} />, label: 'Active Posts', value: summary.activePosts, color: '#22C55E' },
        { icon: <CreditCard size={18} />, label: 'Paid Posts', value: summary.paidPosts, color: '#8B5CF6' },
        { icon: <Inbox size={18} />, label: 'Applications', value: summary.totalApplications, color: '#3B82F6' },
        {
            // Drills into 'has_untriaged', which is exactly the population this
            // number counts. Filtering on hiringStatus 'untriaged' here would
            // show fewer rows than the tile advertises.
            icon: <AlertTriangle size={18} />, label: 'Sitting On Untriaged', value: summary.employersWithUntriaged, color: '#F59E0B',
            onClick: () => setStatusFilter('has_untriaged'),
        },
    ] : [];

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ ...heading, fontSize: 28, marginBottom: 4 }}>Employers</h1>
                <p style={sub}>Every employer account with their posts, applicants, and hiring progress</p>
            </div>

            {loadError && (
                <div style={{
                    marginBottom: 16, padding: '12px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    backgroundColor: 'rgba(239,68,68,0.1)', color: '#F87171',
                }}>Failed to load employer data. Refresh to try again.</div>
            )}

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4" style={{ marginBottom: 24 }}>
                    {statTiles.map(stat => (
                        <div key={stat.label} onClick={stat.onClick}
                            title={stat.onClick ? 'Filter the table to these employers' : undefined}
                            role={stat.onClick ? 'button' : undefined}
                            tabIndex={stat.onClick ? 0 : undefined}
                            onKeyDown={stat.onClick ? (ev => {
                                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); stat.onClick?.(); }
                            }) : undefined}
                            style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: stat.onClick ? 'pointer' : 'default' }}>
                            <div style={{ color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#1A2E35' }}>{stat.value}</div>
                            <div style={muted}>{stat.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ EMPLOYER TABLE ═══ */}
            <div style={card}>
                {/* Secondary breakdown strip */}
                {summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4" style={{ padding: 20, borderBottom: '1px solid #E8ECF0' }}>
                        {[
                            { l: 'Untriaged Applicants', v: summary.untriagedApplications, c: '#F59E0B', t: 'Applications still sitting at status applied. Nobody has looked at them.' },
                            { l: 'Inactive Posts', v: summary.inactivePosts, c: '#94A3B8', t: 'Unpublished, paused, archived, or expired posts.' },
                            { l: 'Free Posts', v: summary.freePosts, c: '#3B82F6', t: 'Posts published on the free tier.' },
                            { l: 'Pending Checkouts', v: summary.pendingCheckouts, c: '#EF4444', t: 'Checkout started, never completed. These are not paid posts.' },
                            { l: 'Posters Without Account', v: summary.orphanPosters, c: '#A855F7', t: 'Legacy posts with no linked employer account.' },
                        ].map(s => (
                            <div key={s.l} style={{ textAlign: 'center' }} title={s.t}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
                                <div style={muted}>{s.l}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Search & Filter bar */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #E8ECF0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input type="text" placeholder="Search employer or email..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ ...inputStyle, width: '100%', paddingLeft: 32 }} />
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as RowFilter)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="all">All Hiring Status ({employers.length})</option>
                        <option value="has_untriaged">Holding untriaged applicants ({untriagedCount})</option>
                        {HIRING_STATUS_KEYS.map(key => (
                            <option key={key} value={key}>{HIRING_STATUS[key].label} ({statusCount(key)})</option>
                        ))}
                    </select>
                    <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="all">All Accounts ({employers.length})</option>
                        <option value="with">With Account ({employers.filter(e => e.hasAccount).length})</option>
                        <option value="without">No Account ({employers.filter(e => !e.hasAccount).length})</option>
                    </select>
                    <select value={sortKey} onChange={e => applySort(e.target.value as SortKey)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="applications">Sort: Most applications</option>
                        <option value="untriaged">Sort: Most untriaged</option>
                        <option value="posts">Sort: Most posts</option>
                        <option value="lastPosted">Sort: Last posted</option>
                        <option value="name">Sort: Employer name</option>
                    </select>
                    <span style={{ ...muted, marginLeft: 'auto' }}>Showing {sorted.length} of {employers.length}</span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F8FAF9' }}>
                                <th style={th}>Employer</th>
                                <th style={th}>Email</th>
                                <th style={th}>Account</th>
                                {sortableTh('Posts', 'posts')}
                                <th style={th}>Payment</th>
                                {sortableTh('Applications', 'applications')}
                                <th style={th}>ATS Funnel</th>
                                <th style={th}>Hiring Status</th>
                                <th style={th}>Views</th>
                                {sortableTh('Last Posted', 'lastPosted')}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map(emp => {
                                const untriaged = emp.hiringStatus === 'untriaged';
                                return (
                                    <tr key={emp.id} style={untriaged ? { backgroundColor: 'rgba(245,158,11,0.06)' } : undefined}>
                                        <td style={{ ...td, fontWeight: 600, color: '#1A2E35' }}>{emp.name || '—'}</td>
                                        <td style={td}>{emp.email || '—'}</td>
                                        <td style={td}>
                                            {emp.hasAccount ? badge('Yes', 'green') : badge('No', 'orange')}
                                            <div style={{ ...muted, marginTop: 4 }}>{formatCT(emp.accountCreatedAt, 'date')}</div>
                                        </td>
                                        <td style={td}>
                                            <div style={{ fontWeight: 600, color: '#1A2E35' }}>{emp.posts.total}</div>
                                            <div style={{ ...muted, marginTop: 2 }}>
                                                {emp.posts.active} active, {emp.posts.inactive} inactive
                                            </div>
                                        </td>
                                        <td style={td}>
                                            <div className="flex gap-1">
                                                {emp.posts.paid > 0 && badge(`${emp.posts.paid} paid`, 'green')}
                                                {emp.posts.free > 0 && badge(`${emp.posts.free} free`, 'gray')}
                                                {emp.posts.pending > 0 && badge(`${emp.posts.pending} pending`, 'red')}
                                                {/* The API classifies paid, free, and pending. Anything else the
                                                    Stripe webhook writes (a refund or a dispute) would otherwise
                                                    leave this cell blank, so surface the remainder. */}
                                                {otherPaymentPosts(emp) > 0 && (
                                                    <span title="Posts on another payment lifecycle status, for example refunded or disputed.">
                                                        {badge(`${otherPaymentPosts(emp)} other`, 'purple')}
                                                    </span>
                                                )}
                                                {emp.posts.total === 0 && badge('None', 'gray')}
                                            </div>
                                        </td>
                                        <td style={td}>
                                            <div style={{ fontWeight: 600, color: '#1A2E35' }}>{emp.applications.total}</div>
                                            {emp.applications.withdrawn > 0 && (
                                                <div style={{ ...muted, marginTop: 2 }}>{emp.applications.withdrawn} withdrawn</div>
                                            )}
                                        </td>
                                        <td style={td}>
                                            <FunnelCell apps={emp.applications} />
                                        </td>
                                        <td style={td}>{hiringBadge(emp.hiringStatus)}</td>
                                        <td style={td}>
                                            <div style={{ fontWeight: 600, color: '#1A2E35' }}>{emp.views}</div>
                                            <div style={{ ...muted, marginTop: 2 }}>{emp.applyClicks} apply clicks</div>
                                        </td>
                                        <td style={td}>{formatCT(emp.lastPostedAt, 'date')}</td>
                                    </tr>
                                );
                            })}
                            {sorted.length === 0 && (
                                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 40 }}>No employers found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ─── ATS funnel cell ───
 * Compact stage counts. The 'applied' stage is the operator signal: those are
 * candidates the employer has never actioned, so it stays amber and bold while
 * every other zero stage fades back.
 */
function FunnelCell({ apps }: { apps: EmployerApplications }) {
    const stages: Array<{ label: string; value: number; color: string }> = [
        { label: 'new', value: apps.applied, color: '#F59E0B' },
        { label: 'screen', value: apps.screening, color: '#3B82F6' },
        { label: 'interview', value: apps.interview, color: '#3B82F6' },
        { label: 'offer', value: apps.offered, color: '#A855F7' },
        { label: 'hired', value: apps.hired, color: '#22C55E' },
        { label: 'rejected', value: apps.rejected, color: '#EF4444' },
    ];

    if (apps.total === 0) return <span style={muted}>No applicants</span>;

    return (
        <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
            {stages.map((s, i) => (
                <span key={s.label} className="flex items-center gap-2">
                    {i > 0 && <span style={{ color: '#CBD5E1' }}>·</span>}
                    <span style={{ color: s.value > 0 ? s.color : '#CBD5E1', fontWeight: s.value > 0 ? 700 : 400 }}>
                        {s.value} {s.label}
                    </span>
                </span>
            ))}
        </div>
    );
}
