'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Building, Save, Loader2, User, CreditCard, Globe, Mail,
    Phone, CheckCircle, AlertTriangle, FileText, Lock, Bell,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface CompanyInfo {
    name: string;
    logoUrl: string | null;
    description: string | null;
    website: string | null;
    contactEmail: string;
}

interface ProfileInfo {
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    company: string | null;
}

interface Payment {
    id: string;
    jobTitle: string;
    tier: string;
    status: string;
    date: string;
    expiresAt: string | null;
    isActive: boolean;
}

interface AlertPrefs {
    specialties: string[];
    states: string[];
    minExperience: number | null;
    workMode: string;
    isActive: boolean;
}

const SPECIALTY_PRESETS = [
    'ADHD', 'Anxiety/Depression', 'PTSD', 'Addiction',
    'Child & Adolescent', 'Geriatric', 'Eating Disorders',
    'OCD', 'Bipolar', 'Schizophrenia', 'General Adult',
];
const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];
const WORK_MODES = ['Remote', 'On-site', 'Hybrid', 'Telehealth', 'Any'];

const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '20px',
};
const cardTitle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
};
const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    borderWidth: '1.5px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
};
const labelStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '6px',
    display: 'block',
};

export default function EmployerSettingsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [profile, setProfile] = useState<ProfileInfo | null>(null);
    const [company, setCompany] = useState<CompanyInfo | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [alertPrefs, setAlertPrefs] = useState<AlertPrefs>({ specialties: [], states: [], minExperience: null, workMode: '', isActive: false });
    const [savingAlerts, setSavingAlerts] = useState(false);
    const [activeSection, setActiveSection] = useState<'company' | 'billing' | 'alerts' | 'account'>('company');

    useEffect(() => {
        (async () => {
            try {
                const [settingsRes, billingRes] = await Promise.all([
                    fetch('/api/employer/settings'),
                    fetch('/api/employer/billing'),
                ]);
                if (settingsRes.status === 401) { router.push('/login'); return; }
                if (settingsRes.status === 403) { router.push('/'); return; }
                const settingsData = await settingsRes.json();
                setProfile(settingsData.profile);
                setCompany(settingsData.companyInfo);

                if (billingRes.ok) {
                    const billingData = await billingRes.json();
                    setPayments(billingData.payments);
                }

                // Fetch alert preferences
                try {
                    const alertRes = await fetch('/api/employer/candidate-alerts');
                    if (alertRes.ok) {
                        const alertData = await alertRes.json();
                        if (alertData.alert) {
                            setAlertPrefs(alertData.alert);
                        }
                    }
                } catch { /* silent */ }
            } catch {
                router.push('/login');
            } finally {
                setLoading(false);
            }
        })();
    }, [router]);

    const showMsg = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleSave = async () => {
        if (!profile) return;
        setSaving(true);
        try {
            const res = await fetch('/api/employer/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    phone: profile.phone,
                    company: profile.company,
                    companyDescription: company?.description,
                    companyWebsite: company?.website,
                    companyLogoUrl: company?.logoUrl,
                }),
            });
            if (!res.ok) throw new Error();
            showMsg('success', 'Settings saved!');
        } catch {
            showMsg('error', 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!profile) return;
        setSendingReset(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
                redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
            });
            if (error) throw error;
            showMsg('success', 'Password reset email sent!');
        } catch {
            showMsg('error', 'Failed to send reset email.');
        } finally {
            setSendingReset(false);
        }
    };

    const handleSaveAlerts = async () => {
        setSavingAlerts(true);
        try {
            const res = await fetch('/api/employer/candidate-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(alertPrefs),
            });
            if (!res.ok) throw new Error();
            showMsg('success', 'Alert preferences saved!');
        } catch {
            showMsg('error', 'Failed to save alerts.');
        } finally {
            setSavingAlerts(false);
        }
    };

    if (loading) {
        return (
            <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#2DD4BF' }} />
                </div>
            </div>
        );
    }

    if (!profile) return null;

    const sections = [
        { key: 'company' as const, label: 'Company', icon: Building },
        { key: 'billing' as const, label: 'Billing', icon: CreditCard },
        { key: 'alerts' as const, label: 'Alerts', icon: Bell },
        { key: 'account' as const, label: 'Account', icon: User },
    ];

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>
            {/* Toast */}
            {message && (
                <div style={{
                    position: 'fixed', top: '80px', right: '20px', zIndex: 100,
                    padding: '14px 20px', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: message.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: message.type === 'success' ? '#10B981' : '#EF4444',
                    fontSize: '14px', fontWeight: 500,
                    backdropFilter: 'blur(12px)',
                }}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Employer Settings
                </h1>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        padding: '10px 24px',
                        borderRadius: '12px',
                        background: saving ? 'rgba(45,212,191,0.3)' : 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        border: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 2px 12px rgba(45,212,191,0.25)',
                    }}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            {/* Section Nav */}
            <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {sections.map(s => (
                    <button
                        key={s.key}
                        onClick={() => setActiveSection(s.key)}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeSection === s.key ? 'shadow-sm' : 'hover:opacity-80'}`}
                        style={{
                            backgroundColor: activeSection === s.key ? 'var(--bg-secondary)' : 'transparent',
                            color: activeSection === s.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        }}
                    >
                        <s.icon size={16} />
                        {s.label}
                    </button>
                ))}
            </div>

            {/* ═══ Company Section ═══ */}
            {activeSection === 'company' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={cardStyle}>
                        <h3 style={cardTitle}>
                            <Building size={20} style={{ color: '#2DD4BF' }} />
                            Company Information
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div>
                                <label style={labelStyle}>Company Name</label>
                                <input
                                    type="text"
                                    value={profile.company || ''}
                                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                                    placeholder="Your company name"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Company Website</label>
                                <div style={{ position: 'relative' }}>
                                    <Globe size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="url"
                                        value={company?.website || ''}
                                        onChange={(e) => setCompany(prev => prev ? { ...prev, website: e.target.value } : { name: '', logoUrl: null, description: null, website: e.target.value, contactEmail: profile.email })}
                                        placeholder="https://yourcompany.com"
                                        style={{ ...inputStyle, paddingLeft: '36px' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Company Logo URL</label>
                                <input
                                    type="url"
                                    value={company?.logoUrl || ''}
                                    onChange={(e) => setCompany(prev => prev ? { ...prev, logoUrl: e.target.value } : { name: '', logoUrl: e.target.value, description: null, website: null, contactEmail: profile.email })}
                                    placeholder="https://yourcompany.com/logo.png"
                                    style={inputStyle}
                                />
                                {company?.logoUrl && (
                                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <img
                                            src={company.logoUrl}
                                            alt="Company logo preview"
                                            style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Logo preview</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label style={labelStyle}>Company Description</label>
                                <textarea
                                    value={company?.description || ''}
                                    onChange={(e) => {
                                        if (e.target.value.length <= 1000) {
                                            setCompany(prev => prev ? { ...prev, description: e.target.value } : { name: '', logoUrl: null, description: e.target.value, website: null, contactEmail: profile.email });
                                        }
                                    }}
                                    placeholder="Tell candidates about your company, culture, and mission..."
                                    rows={4}
                                    style={{ ...inputStyle, resize: 'vertical', minHeight: '100px' }}
                                />
                                <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {(company?.description || '').length}/1000
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div style={cardStyle}>
                        <h3 style={cardTitle}>
                            <User size={20} style={{ color: '#818CF8' }} />
                            Contact Information
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={labelStyle}>First Name</label>
                                <input
                                    type="text"
                                    value={profile.firstName || ''}
                                    onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                                    placeholder="First name"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Last Name</label>
                                <input
                                    type="text"
                                    value={profile.lastName || ''}
                                    onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                                    placeholder="Last name"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Email</label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="email"
                                        value={profile.email}
                                        disabled
                                        style={{ ...inputStyle, paddingLeft: '36px', opacity: 0.6, cursor: 'not-allowed' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Phone</label>
                                <div style={{ position: 'relative' }}>
                                    <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="tel"
                                        value={profile.phone || ''}
                                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                        placeholder="(555) 555-5555"
                                        style={{ ...inputStyle, paddingLeft: '36px' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Billing Section ═══ */}
            {activeSection === 'billing' && (
                <div style={cardStyle}>
                    <h3 style={cardTitle}>
                        <CreditCard size={20} style={{ color: '#F59E0B' }} />
                        Payment History
                    </h3>
                    {payments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <FileText size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                                No payment history yet. Post your first job to get started!
                            </p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Job</th>
                                        <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Tier</th>
                                        <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                                        <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                {p.jobTitle}
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    backgroundColor: p.tier.includes('Featured') ? 'rgba(245,158,11,0.12)' : 'rgba(45,212,191,0.12)',
                                                    color: p.tier.includes('Featured') ? '#F59E0B' : '#2DD4BF',
                                                }}>
                                                    {p.tier}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    backgroundColor: p.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                                                    color: p.isActive ? '#10B981' : '#6B7280',
                                                }}>
                                                    {p.isActive ? 'Active' : 'Expired'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Alerts Section ═══ */}
            {activeSection === 'alerts' && (
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ ...cardTitle, marginBottom: 0 }}>
                            <Bell size={20} style={{ color: '#F59E0B' }} />
                            New Candidate Alerts
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={alertPrefs.isActive}
                                    onChange={(e) => setAlertPrefs(prev => ({ ...prev, isActive: e.target.checked }))}
                                    style={{ accentColor: '#2DD4BF', width: '16px', height: '16px' }}
                                />
                                Enabled
                            </label>
                            <button
                                onClick={handleSaveAlerts}
                                disabled={savingAlerts}
                                style={{
                                    padding: '8px 18px', borderRadius: '10px',
                                    background: savingAlerts ? 'rgba(45,212,191,0.3)' : 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                                    color: '#fff', fontSize: '13px', fontWeight: 600, border: 'none', cursor: savingAlerts ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                }}
                            >
                                {savingAlerts ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Save
                            </button>
                        </div>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                        Get notified when new PMHNP candidates match your criteria.
                    </p>

                    {/* Specialties */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ ...labelStyle, textTransform: 'uppercase', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Specialties</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {SPECIALTY_PRESETS.map(s => {
                                const selected = alertPrefs.specialties.includes(s);
                                return (
                                    <button key={s} onClick={() => setAlertPrefs(prev => ({
                                        ...prev,
                                        specialties: selected ? prev.specialties.filter(x => x !== s) : [...prev.specialties, s],
                                    }))} style={{
                                        fontSize: '12px', padding: '5px 10px', borderRadius: '8px',
                                        border: `1px solid ${selected ? '#A78BFA' : 'var(--border-color)'}`,
                                        backgroundColor: selected ? 'rgba(139,92,246,0.15)' : 'transparent',
                                        color: selected ? '#A78BFA' : 'var(--text-secondary)',
                                        cursor: 'pointer', fontWeight: selected ? 600 : 400,
                                    }}>{s}</button>
                                );
                            })}
                        </div>
                    </div>

                    {/* States */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ ...labelStyle, textTransform: 'uppercase', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>
                            Licensed States {alertPrefs.states.length > 0 && `(${alertPrefs.states.length})`}
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {US_STATES.map(st => {
                                const selected = alertPrefs.states.includes(st);
                                return (
                                    <button key={st} onClick={() => setAlertPrefs(prev => ({
                                        ...prev,
                                        states: selected ? prev.states.filter(x => x !== st) : [...prev.states, st],
                                    }))} style={{
                                        fontSize: '11px', padding: '4px 7px', borderRadius: '6px',
                                        border: `1px solid ${selected ? '#2DD4BF' : 'var(--border-color)'}`,
                                        backgroundColor: selected ? 'rgba(45,212,191,0.15)' : 'transparent',
                                        color: selected ? '#2DD4BF' : 'var(--text-secondary)',
                                        cursor: 'pointer', fontWeight: selected ? 600 : 400, minWidth: '36px', textAlign: 'center' as const,
                                    }}>{st}</button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Experience + Work Mode */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ ...labelStyle, textTransform: 'uppercase', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Min Experience</label>
                            <select
                                value={alertPrefs.minExperience ?? ''}
                                onChange={e => setAlertPrefs(prev => ({ ...prev, minExperience: e.target.value ? Number(e.target.value) : null }))}
                                style={inputStyle}
                            >
                                <option value="">Any</option>
                                <option value="0">New Grad</option>
                                <option value="1">1+ years</option>
                                <option value="3">3+ years</option>
                                <option value="5">5+ years</option>
                                <option value="10">10+ years</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ ...labelStyle, textTransform: 'uppercase', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Work Mode</label>
                            <select
                                value={alertPrefs.workMode}
                                onChange={e => setAlertPrefs(prev => ({ ...prev, workMode: e.target.value }))}
                                style={inputStyle}
                            >
                                <option value="">Any</option>
                                {WORK_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Account Section ═══ */}
            {activeSection === 'account' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Password */}
                    <div style={cardStyle}>
                        <h3 style={cardTitle}>
                            <Lock size={20} style={{ color: '#EF4444' }} />
                            Security
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                            Click below to receive a password reset link at <strong>{profile.email}</strong>.
                        </p>
                        <button
                            onClick={handlePasswordReset}
                            disabled={sendingReset}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '10px',
                                border: '1px solid rgba(239,68,68,0.3)',
                                backgroundColor: 'rgba(239,68,68,0.06)',
                                color: '#EF4444',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: sendingReset ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                        >
                            {sendingReset ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                            {sendingReset ? 'Sending...' : 'Reset Password'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

