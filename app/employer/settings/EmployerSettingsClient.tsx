'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Save, Loader2, Globe, Mail,
    Phone, CheckCircle, AlertTriangle, FileText, Lock,
} from 'lucide-react';
import Image from 'next/image';
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

/* ═══ Clay Design Tokens ═══ */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
    padding: '28px',
    marginBottom: '20px',
};

const clayInput: React.CSSProperties = {
    width: '100%', padding: '12px 16px', fontSize: '14px',
    borderRadius: '14px', border: '1px solid rgba(0,0,0,0.08)',
    background: '#F5F6F8', color: '#1A2E35',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
    outline: 'none', fontFamily: 'inherit',
    transition: 'all 0.2s ease',
};

const clayBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    padding: '12px 24px', borderRadius: '14px',
    fontSize: '14px', fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
    cursor: 'pointer', transition: 'all 0.2s ease',
};

const clayIconWrap: React.CSSProperties = {
    width: '40px', height: '40px', borderRadius: '12px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '3px 3px 8px rgba(0,0,0,0.06), inset 1px 1px 2px rgba(255,255,255,0.3)',
};

const clayPill = (selected: boolean, accent: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 12px', borderRadius: '10px',
    fontSize: '12px', fontWeight: selected ? 600 : 400,
    border: selected ? `1px solid ${accent}40` : '1px solid rgba(0,0,0,0.06)',
    background: selected ? `${accent}18` : '#F5F6F8',
    color: selected ? accent : '#8A9BA6',
    boxShadow: selected
        ? `2px 2px 5px ${accent}12, inset 1px 1px 2px rgba(255,255,255,0.5)`
        : 'inset 1px 1px 3px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.4)',
    cursor: 'pointer', transition: 'all 0.2s ease',
});

const clayTabActive: React.CSSProperties = {
    ...clayBtn, padding: '16px', fontSize: '14px',
    background: '#FFFFFF', color: '#1A2E35',
    width: '100%', justifyContent: 'flex-start',
    boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.05)',
};

const clayTabInactive: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '16px', borderRadius: '14px', width: '100%', justifyContent: 'flex-start',
    fontSize: '14px', fontWeight: 500,
    background: 'transparent', color: '#8A9BA6',
    border: 'none', cursor: 'pointer',
    transition: 'all 0.2s ease',
};

export default function EmployerSettingsClient() {
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
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        border: '3px solid #E5E7EB', borderTopColor: '#0D9488',
                        animation: 'spin 0.8s linear infinite',
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (!profile) return null;

    const sections = [
        { key: 'company' as const, label: 'Company Profile', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-icon-office.webp', desc: 'Brand & info' },
        { key: 'billing' as const, label: 'Billing & Plans', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-icon-credit-card.webp', desc: 'Payment history' },
        { key: 'alerts' as const, label: 'Candidate Alerts', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-icon-bell.webp', desc: 'Match notifications' },
        { key: 'account' as const, label: 'Account Security', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-icon-shield.webp', desc: 'Password reset' },
    ];

    const Label = ({ children }: { children: React.ReactNode }) => (
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '8px' }}>
            {children}
        </label>
    );

    return (
        <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '40px 20px', display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Toast */}
            {message && (
                <div style={{
                    position: 'fixed', top: '80px', right: '20px', zIndex: 100,
                    ...clayCard, padding: '14px 20px', marginBottom: 0,
                    background: message.type === 'success' ? '#F0FDFA' : '#FEF2F2',
                    border: `1px solid ${message.type === 'success' ? '#99F6E4' : '#FECACA'}`,
                    display: 'flex', alignItems: 'center', gap: '10px',
                    color: message.type === 'success' ? '#059669' : '#DC2626',
                    fontSize: '14px', fontWeight: 600,
                }}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Sidebar Navigation */}
            <div className="settings-sidebar" style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 16px' }}>
                    Settings
                </h1>
                
                <div style={{ ...clayCard, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sections.map(s => (
                        <button
                            key={s.key}
                            onClick={() => setActiveSection(s.key)}
                            style={activeSection === s.key ? clayTabActive : clayTabInactive}
                        >
                            <Image src={s.icon} alt={s.label} width={32} height={32} style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: activeSection === s.key ? '#1A2E35' : '#8A9BA6' }}>{s.label}</div>
                                <div style={{ fontSize: '11.5px', color: '#B0BEC5', fontWeight: 500, marginTop: '2px' }}>{s.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="settings-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Header Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="clay-save-btn"
                        style={{
                            ...clayBtn,
                            background: saving ? 'rgba(13,148,136,0.3)' : 'linear-gradient(145deg, #0D9488, #10B981)',
                            color: '#fff',
                            boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.6 : 1,
                        }}
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>

            {/* ═══ Company Section ═══ */}
            {activeSection === 'company' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={clayCard}>
                        <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '16px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                                Company Information
                            </h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div>
                                <Label>Company Name</Label>
                                <input
                                    type="text"
                                    value={profile.company || ''}
                                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                                    placeholder="Your company name"
                                    style={clayInput}
                                />
                            </div>
                            <div>
                                <Label>Company Website</Label>
                                <div style={{ position: 'relative' }}>
                                    <Globe size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#B0BEC5' }} />
                                    <input
                                        type="url"
                                        value={company?.website || ''}
                                        onChange={(e) => setCompany(prev => prev ? { ...prev, website: e.target.value } : { name: '', logoUrl: null, description: null, website: e.target.value, contactEmail: profile.email })}
                                        placeholder="https://yourcompany.com"
                                        style={{ ...clayInput, paddingLeft: '38px' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Company Logo URL</Label>
                                <input
                                    type="url"
                                    value={company?.logoUrl || ''}
                                    onChange={(e) => setCompany(prev => prev ? { ...prev, logoUrl: e.target.value } : { name: '', logoUrl: e.target.value, description: null, website: null, contactEmail: profile.email })}
                                    placeholder="https://yourcompany.com/logo.png"
                                    style={clayInput}
                                />
                                {company?.logoUrl && (
                                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <img
                                            src={company.logoUrl}
                                            alt="Company logo preview"
                                            style={{
                                                width: '48px', height: '48px', borderRadius: '14px',
                                                objectFit: 'cover', border: '1px solid rgba(0,0,0,0.06)',
                                                boxShadow: '2px 2px 6px rgba(0,0,0,0.06)',
                                            }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <span style={{ fontSize: '12px', color: '#B0BEC5' }}>Logo preview</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <Label>Company Description</Label>
                                <textarea
                                    value={company?.description || ''}
                                    onChange={(e) => {
                                        if (e.target.value.length <= 1000) {
                                            setCompany(prev => prev ? { ...prev, description: e.target.value } : { name: '', logoUrl: null, description: e.target.value, website: null, contactEmail: profile.email });
                                        }
                                    }}
                                    placeholder="Tell candidates about your company, culture, and mission..."
                                    rows={4}
                                    style={{ ...clayInput, resize: 'vertical', minHeight: '100px' }}
                                />
                                <div style={{ textAlign: 'right', fontSize: '11px', color: '#B0BEC5', marginTop: '4px' }}>
                                    {(company?.description || '').length}/1000
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div style={clayCard}>
                        <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '16px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                                Contact Information
                            </h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <Label>First Name</Label>
                                <input type="text" value={profile.firstName || ''} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} placeholder="First name" style={clayInput} />
                            </div>
                            <div>
                                <Label>Last Name</Label>
                                <input type="text" value={profile.lastName || ''} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} placeholder="Last name" style={clayInput} />
                            </div>
                            <div>
                                <Label>Email</Label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#B0BEC5' }} />
                                    <input type="email" value={profile.email} disabled style={{ ...clayInput, paddingLeft: '38px', opacity: 0.5, cursor: 'not-allowed' }} />
                                </div>
                            </div>
                            <div>
                                <Label>Phone</Label>
                                <div style={{ position: 'relative' }}>
                                    <Phone size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#B0BEC5' }} />
                                    <input type="tel" value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 555-5555" style={{ ...clayInput, paddingLeft: '38px' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Billing Section ═══ */}
            {activeSection === 'billing' && (
                <div style={clayCard}>
                    <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '16px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                            Payment History
                        </h3>
                    </div>
                    {payments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <div style={{
                                width: '56px', height: '56px', borderRadius: '18px', margin: '0 auto 16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: '#F5F6F8',
                                boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.4)',
                            }}>
                                <FileText size={24} color="#B0BEC5" />
                            </div>
                            <p style={{ color: '#8A9BA6', fontSize: '14px', margin: 0 }}>
                                No payment history yet. Post your first job to get started!
                            </p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                                        {['Job', 'Tier', 'Status', 'Date'].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '10px 8px', color: '#8A9BA6', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                            <td style={{ padding: '14px 8px', color: '#1A2E35', fontWeight: 600 }}>{p.jobTitle}</td>
                                            <td style={{ padding: '14px 8px' }}>
                                                <span style={{
                                                    fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '8px',
                                                    background: p.tier.includes('Featured') ? '#FFF8E1' : '#F0FDFA',
                                                    color: p.tier.includes('Featured') ? '#F59E0B' : '#0D9488',
                                                    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.03)',
                                                }}>{p.tier}</span>
                                            </td>
                                            <td style={{ padding: '14px 8px' }}>
                                                <span style={{
                                                    fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '8px',
                                                    background: p.isActive ? '#D1FAE5' : '#F3F4F6',
                                                    color: p.isActive ? '#059669' : '#6B7280',
                                                    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.03)',
                                                }}>{p.isActive ? 'Active' : 'Expired'}</span>
                                            </td>
                                            <td style={{ padding: '14px 8px', color: '#8A9BA6', fontSize: '13px' }}>
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
                <div style={clayCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '16px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                            Candidate Alerts
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <label style={{ fontSize: '13px', color: '#8A9BA6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" checked={alertPrefs.isActive} onChange={(e) => setAlertPrefs(prev => ({ ...prev, isActive: e.target.checked }))} style={{ accentColor: '#0D9488', width: '16px', height: '16px' }} />
                                Enabled
                            </label>
                            <button
                                onClick={handleSaveAlerts}
                                disabled={savingAlerts}
                                style={{
                                    ...clayBtn, padding: '8px 16px', fontSize: '13px',
                                    background: savingAlerts ? 'rgba(13,148,136,0.3)' : 'linear-gradient(145deg, #0D9488, #10B981)',
                                    color: '#fff',
                                    boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                                    cursor: savingAlerts ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {savingAlerts ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Save
                            </button>
                        </div>
                    </div>
                    <p style={{ color: '#8A9BA6', fontSize: '13px', marginBottom: '20px' }}>
                        Get notified when new PMHNP candidates match your criteria.
                    </p>

                    {/* Specialties */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8A9BA6', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Specialties</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {SPECIALTY_PRESETS.map(s => {
                                const selected = alertPrefs.specialties.includes(s);
                                return (
                                    <button key={s} onClick={() => setAlertPrefs(prev => ({
                                        ...prev,
                                        specialties: selected ? prev.specialties.filter(x => x !== s) : [...prev.specialties, s],
                                    }))} style={clayPill(selected, '#8B5CF6')}>{s}</button>
                                );
                            })}
                        </div>
                    </div>

                    {/* States */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8A9BA6', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                                        ...clayPill(selected, '#0D9488'),
                                        padding: '4px 8px', fontSize: '11px', minWidth: '36px',
                                        textAlign: 'center' as const,
                                    }}>{st}</button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Experience + Work Mode */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8A9BA6', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Min Experience</label>
                            <select value={alertPrefs.minExperience ?? ''} onChange={e => setAlertPrefs(prev => ({ ...prev, minExperience: e.target.value ? Number(e.target.value) : null }))} style={clayInput}>
                                <option value="">Any</option>
                                <option value="0">New Grad</option>
                                <option value="1">1+ years</option>
                                <option value="3">3+ years</option>
                                <option value="5">5+ years</option>
                                <option value="10">10+ years</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#8A9BA6', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Work Mode</label>
                            <select value={alertPrefs.workMode} onChange={e => setAlertPrefs(prev => ({ ...prev, workMode: e.target.value }))} style={clayInput}>
                                <option value="">Any</option>
                                {WORK_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Account Section ═══ */}
            {activeSection === 'account' && (
                <div style={clayCard}>
                    <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '16px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                            Security
                        </h3>
                    </div>
                    <p style={{ color: '#8A9BA6', fontSize: '14px', marginBottom: '16px', lineHeight: 1.5 }}>
                        Click below to receive a password reset link at <strong style={{ color: '#1A2E35' }}>{profile.email}</strong>.
                    </p>
                    <button
                        onClick={handlePasswordReset}
                        disabled={sendingReset}
                        className="clay-reset-btn"
                        style={{
                            ...clayBtn, padding: '10px 20px',
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            color: '#DC2626',
                            boxShadow: '4px 4px 10px rgba(239,68,68,0.06), inset 1px 1px 2px rgba(255,255,255,0.5)',
                            cursor: sendingReset ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {sendingReset ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                        {sendingReset ? 'Sending...' : 'Reset Password'}
                    </button>
                </div>
            )}

            </div>

            <style>{`
                @media (max-width: 768px) {
                    .settings-sidebar { width: 100% !important; margin-bottom: 20px; }
                    .settings-main { flex: none; width: 100% !important; }
                }
                .clay-save-btn:hover { transform: translateY(-1px); box-shadow: 6px 6px 16px rgba(13,148,136,0.3), inset 1px 1px 2px rgba(255,255,255,0.15) !important; }
                .clay-reset-btn:hover { transform: translateY(-1px); }
            `}</style>
        </div>
    );
}
