'use client';

import { useState, useEffect } from 'react';
import { Users, Mail, Bell, Shield, Briefcase, UserCheck } from 'lucide-react';

interface UserProfile {
    id: string;
    email: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    headline: string | null;
    openToOffers: boolean;
    profileVisible: boolean;
    createdAt: string;
}

interface JobAlert {
    id: string;
    frequency: string;
    isActive: boolean;
    keyword: string | null;
    location: string | null;
    lastSentAt: string | null;
}

interface EmailLead {
    id: string;
    email: string;
    source: string | null;
    isSubscribed: boolean;
    newsletterOptIn: boolean;
    createdAt: string;
    hasAccount: boolean;
    jobAlerts: JobAlert[];
}

interface Summary {
    totalUsers: number;
    jobSeekers: number;
    employers: number;
    admins: number;
    totalSubscribers: number;
    activeSubscribers: number;
    newsletterOptIns: number;
    withAccount: number;
    withoutAccount: number;
    totalAlerts: number;
    activeAlerts: number;
    dailyAlerts: number;
    weeklyAlerts: number;
}

const card: React.CSSProperties = {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    overflow: 'hidden',
};

const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };

const th: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-tertiary)',
    borderBottom: '1px solid var(--border-color)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
    padding: '14px 16px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
};

function badge(text: string, color: 'green' | 'purple' | 'blue' | 'gray' | 'red' | 'orange') {
    const colors = {
        green: { bg: 'rgba(34, 197, 94, 0.12)', text: '#22C55E' },
        purple: { bg: 'rgba(168, 85, 247, 0.12)', text: '#A855F7' },
        blue: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3B82F6' },
        gray: { bg: 'rgba(148, 163, 184, 0.12)', text: '#94A3B8' },
        red: { bg: 'rgba(239, 68, 68, 0.12)', text: '#EF4444' },
        orange: { bg: 'rgba(245, 158, 11, 0.12)', text: '#F59E0B' },
    };
    return (
        <span
            style={{
                display: 'inline-flex',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: colors[color].bg,
                color: colors[color].text,
            }}
        >
            {text}
        </span>
    );
}

const selectStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '13px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [emailLeads, setEmailLeads] = useState<EmailLead[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'users' | 'subscribers' | 'alerts'>('users');
    const [accountFilter, setAccountFilter] = useState<'all' | 'with' | 'without'>('all');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (data.success) {
                setUsers(data.users);
                setEmailLeads(data.emailLeads);
                setSummary(data.summary);
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
                <div style={{ textAlign: 'center', paddingTop: 80 }}>
                    <div
                        style={{
                            width: 48, height: 48, border: '3px solid var(--border-color)',
                            borderTop: '3px solid #2DD4BF', borderRadius: '50%',
                            margin: '0 auto', animation: 'spin 0.8s linear infinite',
                        }}
                    />
                    <p style={{ marginTop: 16, ...sub }}>Loading users…</p>
                </div>
            </div>
        );
    }

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: active ? 600 : 400,
        color: active ? '#2DD4BF' : 'var(--text-secondary)',
        backgroundColor: active ? 'rgba(45, 212, 191, 0.1)' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #2DD4BF' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.2s',
    });

    // Filter subscribers based on account filter
    const filteredLeads = emailLeads.filter(lead => {
        if (accountFilter === 'with') return lead.hasAccount;
        if (accountFilter === 'without') return !lead.hasAccount;
        return true;
    });

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ ...heading, fontSize: 28, marginBottom: 4 }}>Users & Subscribers</h1>
                <p style={sub}>Manage user profiles, email subscribers, and job alerts</p>
            </div>

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
                        { icon: <UserCheck size={18} />, label: 'With Account', value: summary.withAccount, color: '#22C55E' },
                        { icon: <Users size={18} />, label: 'No Account', value: summary.withoutAccount, color: '#F59E0B' },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            style={{
                                ...card,
                                padding: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                            }}
                        >
                            <div style={{ color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {stat.value}
                            </div>
                            <div style={muted}>{stat.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: 0 }}>
                <button onClick={() => setActiveTab('users')} style={tabStyle(activeTab === 'users')}>
                    <span className="flex items-center gap-2"><Users size={16} /> Users ({users.length})</span>
                </button>
                <button onClick={() => setActiveTab('subscribers')} style={tabStyle(activeTab === 'subscribers')}>
                    <span className="flex items-center gap-2"><Mail size={16} /> Subscribers ({emailLeads.length})</span>
                </button>
                <button onClick={() => setActiveTab('alerts')} style={tabStyle(activeTab === 'alerts')}>
                    <span className="flex items-center gap-2"><Bell size={16} /> Alerts ({summary?.totalAlerts || 0})</span>
                </button>
            </div>

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div style={card}>
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
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id}>
                                        <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                                        </td>
                                        <td style={td}>{user.email}</td>
                                        <td style={td}>
                                            {user.role === 'admin'
                                                ? badge('Admin', 'red')
                                                : user.role === 'employer'
                                                    ? badge('Employer', 'purple')
                                                    : badge('Job Seeker', 'blue')}
                                        </td>
                                        <td style={td}>{user.company || '—'}</td>
                                        <td style={td}>
                                            <div className="flex gap-1">
                                                {user.openToOffers && badge('Open', 'green')}
                                                {user.profileVisible && badge('Visible', 'gray')}
                                            </div>
                                        </td>
                                        <td style={td}>
                                            {new Date(user.createdAt).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric', year: 'numeric',
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Subscribers Tab */}
            {activeTab === 'subscribers' && (
                <div style={card}>
                    {/* Filter bar */}
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                    }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Filter:</span>
                        <select
                            value={accountFilter}
                            onChange={(e) => setAccountFilter(e.target.value as 'all' | 'with' | 'without')}
                            style={selectStyle}
                        >
                            <option value="all">All Subscribers ({emailLeads.length})</option>
                            <option value="with">With Account ({emailLeads.filter(l => l.hasAccount).length})</option>
                            <option value="without">No Account ({emailLeads.filter(l => !l.hasAccount).length})</option>
                        </select>
                        <span style={{ ...muted, marginLeft: 'auto' }}>
                            Showing {filteredLeads.length} of {emailLeads.length}
                        </span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <th style={th}>Email</th>
                                    <th style={th}>Source</th>
                                    <th style={th}>Account</th>
                                    <th style={th}>Subscribed</th>
                                    <th style={th}>Newsletter</th>
                                    <th style={th}>Alerts</th>
                                    <th style={th}>Since</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLeads.map((lead) => (
                                    <tr key={lead.id}>
                                        <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {lead.email}
                                        </td>
                                        <td style={td}>{lead.source || '—'}</td>
                                        <td style={td}>
                                            {lead.hasAccount
                                                ? badge('Yes', 'green')
                                                : badge('No', 'orange')}
                                        </td>
                                        <td style={td}>
                                            {lead.isSubscribed ? badge('Active', 'green') : badge('Unsubscribed', 'red')}
                                        </td>
                                        <td style={td}>
                                            {lead.newsletterOptIn ? badge('Yes', 'green') : badge('No', 'gray')}
                                        </td>
                                        <td style={td}>
                                            {lead.jobAlerts.length > 0
                                                ? badge(`${lead.jobAlerts.filter(a => a.isActive).length} active`, 'blue')
                                                : badge('None', 'gray')}
                                        </td>
                                        <td style={td}>
                                            {new Date(lead.createdAt).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric', year: 'numeric',
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Alerts Tab */}
            {activeTab === 'alerts' && (
                <div style={card}>
                    {summary && (
                        <div
                            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
                            style={{ padding: 20, borderBottom: '1px solid var(--border-color)' }}
                        >
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {summary.totalAlerts}
                                </div>
                                <div style={muted}>Total Alerts</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: '#22C55E' }}>
                                    {summary.activeAlerts}
                                </div>
                                <div style={muted}>Active</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: '#3B82F6' }}>
                                    {summary.dailyAlerts}
                                </div>
                                <div style={muted}>Daily</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: '#A855F7' }}>
                                    {summary.weeklyAlerts}
                                </div>
                                <div style={muted}>Weekly</div>
                            </div>
                        </div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <th style={th}>Email</th>
                                    <th style={th}>Frequency</th>
                                    <th style={th}>Status</th>
                                    <th style={th}>Keyword</th>
                                    <th style={th}>Location</th>
                                    <th style={th}>Last Sent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {emailLeads
                                    .filter(l => l.jobAlerts.length > 0)
                                    .flatMap(lead =>
                                        lead.jobAlerts.map(alert => (
                                            <tr key={alert.id}>
                                                <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {lead.email}
                                                </td>
                                                <td style={td}>
                                                    {alert.frequency === 'daily'
                                                        ? badge('Daily', 'blue')
                                                        : badge('Weekly', 'purple')}
                                                </td>
                                                <td style={td}>
                                                    {alert.isActive ? badge('Active', 'green') : badge('Paused', 'gray')}
                                                </td>
                                                <td style={td}>{alert.keyword || 'All jobs'}</td>
                                                <td style={td}>{alert.location || 'All locations'}</td>
                                                <td style={td}>
                                                    {alert.lastSentAt
                                                        ? new Date(alert.lastSentAt).toLocaleDateString('en-US', {
                                                            month: 'short', day: 'numeric',
                                                        })
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
