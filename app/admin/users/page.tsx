'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Mail, Bell, Shield, Briefcase, UserCheck, Building2,
    Search, X, ChevronDown, Trash2,
} from 'lucide-react';

/* ─── Types ─── */
interface UserProfile {
    id: string; email: string; role: string;
    firstName: string | null; lastName: string | null;
    company: string | null; headline: string | null;
    openToOffers: boolean; profileVisible: boolean; createdAt: string;
}
interface JobAlert {
    id: string; frequency: string; isActive: boolean;
    keyword: string | null; location: string | null; lastSentAt: string | null;
}
interface EmailLead {
    id: string; email: string; source: string | null;
    isSubscribed: boolean; newsletterOptIn: boolean;
    createdAt: string; hasAccount: boolean; jobAlerts: JobAlert[];
}
interface EmployerLead {
    id: string; companyName: string; contactName: string | null;
    contactEmail: string | null; contactTitle: string | null;
    website: string | null; status: string; source: string | null;
    jobsPosted: number; lastContactedAt: string | null; createdAt: string; hasAccount: boolean;
}
interface Summary {
    totalUsers: number; jobSeekers: number; employers: number; admins: number;
    totalSubscribers: number; activeSubscribers: number; newsletterOptIns: number;
    withAccount: number; withoutAccount: number;
    totalAlerts: number; activeAlerts: number; dailyAlerts: number; weeklyAlerts: number;
    totalEmployerLeads: number; employerProspects: number; employerContacted: number;
    employerWithAccount: number; employerWithoutAccount: number;
}
interface UserDetail {
    id: string; email: string; role: string; firstName: string | null; lastName: string | null;
    phone: string | null; company: string | null; headline: string | null;
    openToOffers: boolean; profileVisible: boolean; createdAt: string;
    jobApplications: Array<{ id: string; appliedAt: string; status: string; job: { title: string; employer: string } }>;
    autofillUsage: Array<{ id: string; atsName: string | null; fieldsFilled: number; createdAt: string }>;
    _count: { jobApplications: number; autofillUsage: number; autofillTelemetry: number; employerJobs: number };
}

/* ─── Styles ─── */
const card: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' };
const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };
const th: React.CSSProperties = { padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none' };

function badge(text: string, color: 'green' | 'purple' | 'blue' | 'gray' | 'red' | 'orange') {
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

type TabType = 'users' | 'subscribers' | 'employers' | 'alerts';

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [emailLeads, setEmailLeads] = useState<EmailLead[]>([]);
    const [employerLeads, setEmployerLeads] = useState<EmployerLead[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('users');

    // Filters
    const [userSearch, setUserSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [subFilter, setSubFilter] = useState('all');
    const [empFilter, setEmpFilter] = useState('all');

    // User profile drill-down
    const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Action states
    const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (data.success) {
                setUsers(data.users);
                setEmailLeads(data.emailLeads);
                setEmployerLeads(data.employerLeads || []);
                setSummary(data.summary);
            }
        } catch (err) { console.error('Error:', err); }
        finally { setLoading(false); }
    };

    const showMsg = (text: string, isError: boolean) => {
        setActionMsg({ text, isError });
        setTimeout(() => setActionMsg(null), 3000);
    };

    const changeRole = async (userId: string, newRole: string) => {
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
                showMsg(`Role updated to ${newRole}`, false);
            }
        } catch { showMsg('Failed to update role', true); }
    };

    const deactivateUser = async (userId: string) => {
        if (!confirm('Deactivate this user? Their profile will be hidden.')) return;
        try {
            const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, profileVisible: false, openToOffers: false } : u));
                showMsg('User deactivated', false);
            }
        } catch { showMsg('Failed to deactivate', true); }
    };

    const viewProfile = async (userId: string) => {
        try {
            setDetailLoading(true);
            const res = await fetch(`/api/admin/users/${userId}`);
            const data = await res.json();
            if (data.success) setSelectedUser(data.user);
        } catch { showMsg('Failed to load profile', true); }
        finally { setDetailLoading(false); }
    };

    // Filtered lists
    const filteredUsers = users.filter(u => {
        if (roleFilter !== 'all' && u.role !== roleFilter) return false;
        if (userSearch) {
            const q = userSearch.toLowerCase();
            const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
            return name.includes(q) || u.email.toLowerCase().includes(q);
        }
        return true;
    });

    const filteredSubs = emailLeads.filter(l => {
        if (subFilter === 'with') return l.hasAccount;
        if (subFilter === 'without') return !l.hasAccount;
        return true;
    });

    const filteredEmps = employerLeads.filter(l => {
        if (empFilter === 'with') return l.hasAccount;
        if (empFilter === 'without') return !l.hasAccount;
        return true;
    });

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '10px 20px', fontSize: '14px', fontWeight: active ? 600 : 400,
        color: active ? '#2DD4BF' : 'var(--text-secondary)',
        backgroundColor: active ? 'rgba(45,212,191,0.1)' : 'transparent',
        border: 'none', borderBottom: active ? '2px solid #2DD4BF' : '2px solid transparent',
        cursor: 'pointer', transition: 'all 0.2s',
    });

    if (loading) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, border: '3px solid var(--border-color)', borderTop: '3px solid #2DD4BF', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ ...sub, marginTop: 16 }}>Loading users…</p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ ...heading, fontSize: 28, marginBottom: 4 }}>Users & Subscribers</h1>
                <p style={sub}>Manage user profiles, subscribers, employer leads, and job alerts</p>
            </div>

            {/* Action message */}
            {actionMsg && (
                <div style={{
                    marginBottom: 16, padding: '12px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    backgroundColor: actionMsg.isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: actionMsg.isError ? '#F87171' : '#22C55E',
                }}>{actionMsg.text}</div>
            )}

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4" style={{ marginBottom: 24 }}>
                    {[
                        { icon: <Users size={18} />, label: 'Total Users', value: summary.totalUsers, color: '#2DD4BF' },
                        { icon: <Briefcase size={18} />, label: 'Job Seekers', value: summary.jobSeekers, color: '#3B82F6' },
                        { icon: <UserCheck size={18} />, label: 'Employers', value: summary.employers, color: '#A855F7' },
                        { icon: <Mail size={18} />, label: 'Subscribers', value: summary.activeSubscribers, color: '#22C55E' },
                        { icon: <Bell size={18} />, label: 'Active Alerts', value: summary.activeAlerts, color: '#F59E0B' },
                        { icon: <Shield size={18} />, label: 'Newsletter', value: summary.newsletterOptIns, color: '#EC4899' },
                        { icon: <Building2 size={18} />, label: 'Employer Leads', value: summary.totalEmployerLeads, color: '#8B5CF6' },
                        { icon: <Users size={18} />, label: 'No Account', value: summary.withoutAccount + summary.employerWithoutAccount, color: '#F59E0B' },
                    ].map(stat => (
                        <div key={stat.label} style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{ color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
                            <div style={muted}>{stat.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: 0, overflowX: 'auto' }}>
                <button onClick={() => setActiveTab('users')} style={tabStyle(activeTab === 'users')}>
                    <span className="flex items-center gap-2"><Users size={16} /> Users ({users.length})</span>
                </button>
                <button onClick={() => setActiveTab('subscribers')} style={tabStyle(activeTab === 'subscribers')}>
                    <span className="flex items-center gap-2"><Mail size={16} /> Subscribers ({emailLeads.length})</span>
                </button>
                <button onClick={() => setActiveTab('employers')} style={tabStyle(activeTab === 'employers')}>
                    <span className="flex items-center gap-2"><Building2 size={16} /> Employer Leads ({employerLeads.length})</span>
                </button>
                <button onClick={() => setActiveTab('alerts')} style={tabStyle(activeTab === 'alerts')}>
                    <span className="flex items-center gap-2"><Bell size={16} /> Alerts ({summary?.totalAlerts || 0})</span>
                </button>
            </div>

            {/* ═══ USERS TAB ═══ */}
            {activeTab === 'users' && (
                <div style={card}>
                    {/* Search & Filter bar */}
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 200px' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input type="text" placeholder="Search name or email..." value={userSearch} onChange={e => setUserSearch(e.target.value)}
                                style={{ ...inputStyle, width: '100%', paddingLeft: 32 }} />
                        </div>
                        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="all">All Roles</option>
                            <option value="job_seeker">Job Seekers</option>
                            <option value="employer">Employers</option>
                            <option value="admin">Admins</option>
                        </select>
                        <span style={{ ...muted, marginLeft: 'auto' }}>Showing {filteredUsers.length} of {users.length}</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <th style={th}>Name</th>
                                    <th style={th}>Email</th>
                                    <th style={th}>Role</th>
                                    <th style={th}>Company</th>
                                    <th style={th}>Status</th>
                                    <th style={th}>Joined</th>
                                    <th style={{ ...th, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map(user => (
                                    <tr key={user.id}>
                                        <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => viewProfile(user.id)}>
                                            {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                                        </td>
                                        <td style={td}>{user.email}</td>
                                        <td style={td}>
                                            <select
                                                value={user.role}
                                                onChange={e => changeRole(user.id, e.target.value)}
                                                style={{
                                                    padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                                                    backgroundColor: user.role === 'admin' ? 'rgba(239,68,68,0.12)' : user.role === 'employer' ? 'rgba(168,85,247,0.12)' : 'rgba(59,130,246,0.12)',
                                                    color: user.role === 'admin' ? '#EF4444' : user.role === 'employer' ? '#A855F7' : '#3B82F6',
                                                }}
                                            >
                                                <option value="job_seeker">Job Seeker</option>
                                                <option value="employer">Employer</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </td>
                                        <td style={td}>{user.company || '—'}</td>
                                        <td style={td}>
                                            <div className="flex gap-1">
                                                {user.openToOffers && badge('Open', 'green')}
                                                {user.profileVisible && badge('Visible', 'gray')}
                                                {!user.profileVisible && badge('Hidden', 'red')}
                                            </div>
                                        </td>
                                        <td style={td}>{new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <button onClick={() => deactivateUser(user.id)} title="Deactivate"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#EF4444' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 40 }}>No users found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ SUBSCRIBERS TAB ═══ */}
            {activeTab === 'subscribers' && (
                <div style={card}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Filter:</span>
                        <select value={subFilter} onChange={e => setSubFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="all">All ({emailLeads.length})</option>
                            <option value="with">With Account ({emailLeads.filter(l => l.hasAccount).length})</option>
                            <option value="without">No Account ({emailLeads.filter(l => !l.hasAccount).length})</option>
                        </select>
                        <span style={{ ...muted, marginLeft: 'auto' }}>Showing {filteredSubs.length}</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                <th style={th}>Email</th><th style={th}>Source</th><th style={th}>Account</th>
                                <th style={th}>Subscribed</th><th style={th}>Newsletter</th><th style={th}>Alerts</th><th style={th}>Since</th>
                            </tr></thead>
                            <tbody>
                                {filteredSubs.map(lead => (
                                    <tr key={lead.id}>
                                        <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>{lead.email}</td>
                                        <td style={td}>{lead.source || '—'}</td>
                                        <td style={td}>{lead.hasAccount ? badge('Yes', 'green') : badge('No', 'orange')}</td>
                                        <td style={td}>{lead.isSubscribed ? badge('Active', 'green') : badge('Unsub', 'red')}</td>
                                        <td style={td}>{lead.newsletterOptIn ? badge('Yes', 'green') : badge('No', 'gray')}</td>
                                        <td style={td}>{lead.jobAlerts.length > 0 ? badge(`${lead.jobAlerts.filter(a => a.isActive).length} active`, 'blue') : badge('None', 'gray')}</td>
                                        <td style={td}>{new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ EMPLOYERS TAB ═══ */}
            {activeTab === 'employers' && (
                <div style={card}>
                    {summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4" style={{ padding: 20, borderBottom: '1px solid var(--border-color)' }}>
                            {[{ l: 'Total', v: summary.totalEmployerLeads, c: 'var(--text-primary)' }, { l: 'Prospects', v: summary.employerProspects, c: '#F59E0B' }, { l: 'Contacted', v: summary.employerContacted, c: '#3B82F6' }, { l: 'With Account', v: summary.employerWithAccount, c: '#22C55E' }, { l: 'No Account', v: summary.employerWithoutAccount, c: '#EF4444' }].map(s => (
                                <div key={s.l} style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div><div style={muted}>{s.l}</div></div>
                            ))}
                        </div>
                    )}
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="all">All ({employerLeads.length})</option>
                            <option value="with">With Account ({employerLeads.filter(l => l.hasAccount).length})</option>
                            <option value="without">No Account ({employerLeads.filter(l => !l.hasAccount).length})</option>
                        </select>
                        <span style={{ ...muted, marginLeft: 'auto' }}>Showing {filteredEmps.length}</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                <th style={th}>Company</th><th style={th}>Contact</th><th style={th}>Email</th>
                                <th style={th}>Account</th><th style={th}>Status</th><th style={th}>Jobs</th><th style={th}>Since</th>
                            </tr></thead>
                            <tbody>
                                {filteredEmps.map(lead => (
                                    <tr key={lead.id}>
                                        <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: '#2DD4BF', textDecoration: 'none' }}>{lead.companyName}</a> : lead.companyName}
                                        </td>
                                        <td style={td}>{lead.contactName || '—'}</td>
                                        <td style={td}>{lead.contactEmail || '—'}</td>
                                        <td style={td}>{lead.hasAccount ? badge('Yes', 'green') : badge('No', 'orange')}</td>
                                        <td style={td}>
                                            {lead.status === 'prospect' && badge('Prospect', 'orange')}
                                            {lead.status === 'contacted' && badge('Contacted', 'blue')}
                                            {lead.status === 'active' && badge('Active', 'green')}
                                            {lead.status === 'declined' && badge('Declined', 'red')}
                                            {!['prospect', 'contacted', 'active', 'declined'].includes(lead.status) && badge(lead.status, 'gray')}
                                        </td>
                                        <td style={td}>{lead.jobsPosted}</td>
                                        <td style={td}>{new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                    </tr>
                                ))}
                                {filteredEmps.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 40 }}>No employer leads</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ ALERTS TAB ═══ */}
            {activeTab === 'alerts' && (
                <div style={card}>
                    {summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ padding: 20, borderBottom: '1px solid var(--border-color)' }}>
                            {[{ l: 'Total', v: summary.totalAlerts, c: 'var(--text-primary)' }, { l: 'Active', v: summary.activeAlerts, c: '#22C55E' }, { l: 'Daily', v: summary.dailyAlerts, c: '#3B82F6' }, { l: 'Weekly', v: summary.weeklyAlerts, c: '#A855F7' }].map(s => (
                                <div key={s.l} style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div><div style={muted}>{s.l}</div></div>
                            ))}
                        </div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                <th style={th}>Email</th><th style={th}>Frequency</th><th style={th}>Status</th>
                                <th style={th}>Keyword</th><th style={th}>Location</th><th style={th}>Last Sent</th>
                            </tr></thead>
                            <tbody>
                                {emailLeads.filter(l => l.jobAlerts.length > 0).flatMap(lead =>
                                    lead.jobAlerts.map(alert => (
                                        <tr key={alert.id}>
                                            <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>{lead.email}</td>
                                            <td style={td}>{alert.frequency === 'daily' ? badge('Daily', 'blue') : badge('Weekly', 'purple')}</td>
                                            <td style={td}>{alert.isActive ? badge('Active', 'green') : badge('Paused', 'gray')}</td>
                                            <td style={td}>{alert.keyword || 'All jobs'}</td>
                                            <td style={td}>{alert.location || 'All locations'}</td>
                                            <td style={td}>{alert.lastSentAt ? new Date(alert.lastSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ USER PROFILE MODAL ═══ */}
            {selectedUser && (
                <>
                    <div onClick={() => setSelectedUser(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        zIndex: 51, width: '90%', maxWidth: 650, maxHeight: '85vh', overflowY: 'auto',
                        backgroundColor: 'var(--bg-secondary)', borderRadius: 16, border: '1px solid var(--border-color)', padding: 28,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ ...heading, fontSize: 20 }}>User Profile</h2>
                            <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
                        </div>

                        {/* Profile info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                            {[
                                { l: 'Name', v: `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() || '—' },
                                { l: 'Email', v: selectedUser.email },
                                { l: 'Role', v: selectedUser.role },
                                { l: 'Company', v: selectedUser.company || '—' },
                                { l: 'Phone', v: selectedUser.phone || '—' },
                                { l: 'Headline', v: selectedUser.headline || '—' },
                                { l: 'Joined', v: new Date(selectedUser.createdAt).toLocaleDateString() },
                                { l: 'Status', v: `${selectedUser.profileVisible ? 'Visible' : 'Hidden'} / ${selectedUser.openToOffers ? 'Open' : 'Closed'}` },
                            ].map(f => (
                                <div key={f.l}>
                                    <div style={{ ...muted, fontWeight: 600, marginBottom: 2 }}>{f.l}</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{f.v}</div>
                                </div>
                            ))}
                        </div>

                        {/* Activity Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 20 }}>
                            {[
                                { l: 'Applications', v: selectedUser._count.jobApplications, c: '#22C55E' },
                                { l: 'Autofill Uses', v: selectedUser._count.autofillUsage, c: '#A855F7' },
                                { l: 'Telemetry', v: selectedUser._count.autofillTelemetry, c: '#3B82F6' },
                                { l: 'Jobs Posted', v: selectedUser._count.employerJobs, c: '#F59E0B' },
                            ].map(s => (
                                <div key={s.l} style={{ textAlign: 'center', padding: 12, borderRadius: 10, backgroundColor: 'var(--bg-tertiary)' }}>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
                                    <div style={muted}>{s.l}</div>
                                </div>
                            ))}
                        </div>

                        {/* Recent Applications */}
                        {selectedUser.jobApplications.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <h3 style={{ ...heading, fontSize: 15, marginBottom: 10 }}>Recent Applications</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {selectedUser.jobApplications.slice(0, 5).map(app => (
                                        <div key={app.id} style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{app.job.title}</div>
                                                <div style={muted}>{app.job.employer}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                {badge(app.status, app.status === 'applied' ? 'blue' : app.status === 'hired' ? 'green' : 'gray')}
                                                <div style={{ ...muted, marginTop: 2 }}>{new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recent Autofill */}
                        {selectedUser.autofillUsage.length > 0 && (
                            <div>
                                <h3 style={{ ...heading, fontSize: 15, marginBottom: 10 }}>Recent Autofill Usage</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {selectedUser.autofillUsage.slice(0, 5).map(af => (
                                        <div key={af.id} style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{af.atsName || 'Unknown ATS'}</div>
                                                <div style={muted}>{af.fieldsFilled} fields filled</div>
                                            </div>
                                            <div style={muted}>{new Date(af.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
