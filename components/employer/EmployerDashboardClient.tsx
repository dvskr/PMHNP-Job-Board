'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDate, getExpiryStatus } from '@/lib/utils';
import { ExternalLink, Edit, RefreshCw, Mail, Loader2, Shield, Bell, Pause, Play, Rocket, Users, Eye, MousePointerClick, User, Plus, Briefcase, BarChart3, Star, MessageSquare, Send, HelpCircle } from 'lucide-react';
import { config } from '@/lib/config';
import ApplicantsTab from '@/components/employer/ApplicantsTab';
import AnalyticsTab from '@/components/employer/AnalyticsTab';
import SavedCandidatesTab from '@/components/employer/SavedCandidatesTab';
import MessagesTab from '@/components/employer/MessagesTab';
import UsageWidget from '@/components/employer/UsageWidget';

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface Job {
    id: string;
    title: string;
    isPublished: boolean;
    isFeatured: boolean;
    viewCount: number;
    applyClickCount: number;
    applicantCount?: number;
    createdAt: string;
    expiresAt: string | null;
    editToken: string;
    paymentStatus: string;
    pricingTier: string;
    slug: string | null;
}

interface EmployerDashboardClientProps {
    employerEmail: string;
    employerName: string;
    jobs: Job[];
    /** If provided, the user accessed via token link (not logged in). Shows signup banner & invoice links use this token. */
    dashboardToken?: string;
}

/* ═══════════════════════════════════════════
   CLAY DESIGN TOKENS
   ═══════════════════════════════════════════ */
const cardBase: React.CSSProperties = {
    background: '#F7FBF8',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
};

const cardRecessed: React.CSSProperties = {
    background: '#EDF5F0',
    borderRadius: '14px',
    border: '1px solid #D5E8E0',
    boxShadow: 'inset 2px 2px 6px rgba(0,60,50,0.06), inset -1px -1px 3px rgba(255,255,255,0.5)',
};

const clayPill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '4px 12px', borderRadius: '20px',
    fontSize: '11px', fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)',
};

const clayBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 16px', borderRadius: '12px',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.5)',
    transition: 'all 0.2s',
    textDecoration: 'none',
};

const clayToggle = (isActive: boolean): React.CSSProperties => ({
    position: 'relative',
    width: '44px', height: '24px',
    borderRadius: '12px',
    background: isActive ? '#0D9488' : '#EDF5F0',
    border: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : '#D5E8E0'}`,
    boxShadow: isActive
        ? '3px 3px 8px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
        : 'inset 2px 2px 5px rgba(0,60,50,0.06), inset -1px -1px 3px rgba(255,255,255,0.4)',
    cursor: 'pointer', transition: 'all 0.2s',
    flexShrink: 0,
});

const clayToggleKnob = (isActive: boolean): React.CSSProperties => ({
    position: 'absolute', top: '2px',
    left: isActive ? '22px' : '2px',
    width: '18px', height: '18px', borderRadius: '50%',
    background: '#fff',
    transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
});


export default function EmployerDashboardClient({ employerEmail, employerName, jobs, dashboardToken }: EmployerDashboardClientProps) {
    const isTokenAccess = !!dashboardToken;

    const [renewingJobId, setRenewingJobId] = useState<string | null>(null);
    const [upgradingJobId, setUpgradingJobId] = useState<string | null>(null);
    const [showRenewModal, setShowRenewModal] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
    const [localJobs, setLocalJobs] = useState(jobs);
    const [showSignupBanner, setShowSignupBanner] = useState(isTokenAccess);
    const [activeTab, setActiveTab] = useState<'jobs' | 'applicants' | 'analytics' | 'saved' | 'messages'>('jobs');
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Newsletter (only for logged-in users)
    const [newsletterOptIn, setNewsletterOptIn] = useState(false);
    const [newsletterLoading, setNewsletterLoading] = useState(false);
    const [newsletterChecked, setNewsletterChecked] = useState(false);

    useEffect(() => {
        if (isTokenAccess) return; // Skip newsletter for token access
        fetch('/api/newsletter/status?' + new URLSearchParams({ email: employerEmail }))
            .then(r => r.json())
            .then(d => { setNewsletterOptIn(d.optIn ?? false); setNewsletterChecked(true); })
            .catch(() => setNewsletterChecked(true));
    }, [employerEmail, isTokenAccess]);

    // Notification preferences (only for logged-in users)
    interface NotifPref {
        employerJobId: string;
        jobId: string;
        jobTitle: string;
        notifyOnApplication: boolean;
        notifyDigest: string;
    }
    const [notifPrefs, setNotifPrefs] = useState<NotifPref[]>([]);
    const [notifLoading, setNotifLoading] = useState<string | null>(null);

    useEffect(() => {
        if (isTokenAccess) return;
        fetch('/api/employer/settings/notifications')
            .then(r => r.json())
            .then(d => setNotifPrefs(d.preferences || []))
            .catch(() => { });
    }, [isTokenAccess]);

    const handleNewsletterToggle = async () => {
        setNewsletterLoading(true);
        const newState = !newsletterOptIn;
        setNewsletterOptIn(newState);
        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: employerEmail, optIn: newState, source: 'employer_newsletter' }),
            });
        } catch {
            setNewsletterOptIn(!newState);
        } finally {
            setNewsletterLoading(false);
        }
    };

    const getStatusBadge = (job: Job) => {
        if (!job.isPublished) {
            return <span style={{ ...clayPill, background: '#FEF3C7', color: '#D97706' }}>⏸ Paused</span>;
        }
        if (job.expiresAt) {
            const expiry = getExpiryStatus(new Date(job.expiresAt));
            if (expiry.isExpired) {
                return <span style={{ ...clayPill, background: '#FEE2E2', color: '#DC2626' }}>✕ Expired</span>;
            }
        }
        return <span style={{ ...clayPill, background: '#D1FAE5', color: '#059669' }}>● Live</span>;
    };

    const isExpired = (job: Job): boolean => {
        if (!job.expiresAt) return false;
        return new Date(job.expiresAt) < new Date();
    };

    const isExpiringSoon = (job: Job): boolean => {
        if (!job.expiresAt) return false;
        const expiry = getExpiryStatus(new Date(job.expiresAt));
        return expiry.isUrgent;
    };

    const shouldShowRenew = (job: Job): boolean => {
        return isExpired(job) || isExpiringSoon(job);
    };

    const handleRenewClick = (job: Job) => {
        setSelectedJob(job);
        setShowRenewModal(true);
    };

    const handleTogglePublish = async (job: Job) => {
        setTogglingJobId(job.id);
        try {
            const res = await fetch(`/api/employer/jobs/${job.id}/toggle-publish`, {
                method: 'PATCH',
            });
            const result = await res.json();
            if (res.ok && result.success) {
                setLocalJobs(prev => prev.map(j =>
                    j.id === job.id ? { ...j, isPublished: result.isPublished } : j
                ));
            }
        } catch { /* silent */ } finally {
            setTogglingJobId(null);
        }
    };

    const handleRenewCheckout = async (tier: 'starter' | 'growth' | 'premium') => {
        if (!selectedJob) return;

        setRenewingJobId(selectedJob.id);
        setShowRenewModal(false);

        try {
            const response = await fetch('/api/create-renewal-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: selectedJob.id,
                    editToken: selectedJob.editToken,
                    tier,
                }),
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to create checkout');
            }

            if (result.url) {
                window.location.href = result.url;
            } else if (result.success && result.free) {
                window.location.reload();
            }
        } catch (err) {
            console.error('Renewal checkout error:', err);
            alert(err instanceof Error ? err.message : 'Failed to start renewal process');
            setRenewingJobId(null);
        }
    };

    const handleUpgradeClick = async (job: Job) => {
        setUpgradingJobId(job.id);

        try {
            const response = await fetch('/api/create-upgrade-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: job.id,
                    editToken: job.editToken,
                }),
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to create checkout');
            }

            if (result.url) {
                window.location.href = result.url;
            } else if (result.success && result.free) {
                window.location.reload();
            }
        } catch (err) {
            console.error('Upgrade checkout error:', err);
            alert(err instanceof Error ? err.message : 'Failed to start upgrade process');
            setUpgradingJobId(null);
        }
    };

    // Build the job link — prefer slug for session access, fallback to id for token access
    const getJobHref = (job: Job) => {
        if (job.isPublished && job.slug) return `/jobs/${job.slug}`;
        if (job.isPublished) return `/jobs/${job.id}`;
        return '#';
    };

    // Summary stats
    const totalViews = localJobs.reduce((s, j) => s + j.viewCount, 0);
    const totalClicks = localJobs.reduce((s, j) => s + j.applyClickCount, 0);
    const totalApplicants = localJobs.reduce((s, j) => s + (j.applicantCount || 0), 0);
    const liveCount = localJobs.filter(j => j.isPublished && !isExpired(j)).length;

    const tabItems = [
        { key: 'jobs' as const, label: `My Jobs (${jobs.length})`, icon: <Briefcase size={14} /> },
        { key: 'applicants' as const, label: 'Applicants', icon: <User size={14} /> },
        { key: 'analytics' as const, label: 'Analytics', icon: <BarChart3 size={14} /> },
        { key: 'messages' as const, label: 'Messages', icon: <MessageSquare size={14} /> },
        { key: 'saved' as const, label: 'Saved', icon: <Star size={14} /> },
    ];

    return (
        <div style={{ background: '#F5F6F8' }}>
            {/* ═══ Hero Header ═══ */}
            <div style={{
                padding: '16px 16px 20px',
                background: 'linear-gradient(180deg, #F0F2F5 0%, #F5F6F8 100%)',
                borderBottom: '1px solid #E5E7EB',
            }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    {/* Signup Banner — token-access only */}
                    {showSignupBanner && isTokenAccess && (
                        <div style={{
                            ...cardBase, padding: '14px 20px', marginBottom: '20px',
                            background: '#CCFBF1', border: '1px solid #99F6E4',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                            flexWrap: 'wrap',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Shield size={18} style={{ color: '#0D9488' }} />
                                <p style={{ fontSize: '13px', color: '#134E4A', margin: 0 }}>
                                    Create an account for easier access to your dashboard in the future.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Link href="/signup?role=employer" style={{
                                    ...clayBtn, background: 'linear-gradient(145deg, #10B981, #0D9488)',
                                    color: '#fff', border: 'none',
                                    boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                                }}>Sign Up</Link>
                                <button onClick={() => setShowSignupBanner(false)} style={{
                                    ...clayBtn, background: 'rgba(255,255,255,0.5)',
                                    color: '#6B7F8A', fontSize: '12px', padding: '6px 10px',
                                }}>✕</button>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: '#CCFBF1', color: '#0D9488', flexShrink: 0,
                                border: '1px solid rgba(255,255,255,0.5)',
                                boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
                            }}>
                                <Briefcase size={22} />
                            </div>
                            <div>
                                <h1 style={{
                                    fontSize: '24px', fontWeight: 800,
                                    fontFamily: 'var(--font-lora), Georgia, serif',
                                    color: '#1A2E35', margin: '0 0 2px',
                                }}>Employer Dashboard</h1>
                                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0 }}>
                                    {employerName}{isTokenAccess ? ` · ${employerEmail}` : ''}
                                </p>
                            </div>
                        </div>
                        <Link href="/post-job" style={{
                            ...clayBtn, background: 'linear-gradient(145deg, #10B981, #0D9488)',
                            color: '#fff', border: 'none', padding: '10px 20px',
                            boxShadow: '4px 4px 12px rgba(13,148,136,0.25), -2px -2px 8px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}>
                            <Plus size={16} /> Post a New Job
                        </Link>
                    </div>
                </div>
            </div>

            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 16px 60px' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }} className="emp-dashboard-grid">
            <div>

                {/* ═══ Summary Stats ═══ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                    {[
                        { label: 'Live Jobs', value: liveCount, icon: <Rocket size={16} />, color: '#059669', bg: '#D1FAE5' },
                        { label: 'Total Views', value: totalViews, icon: <Eye size={16} />, color: '#0D9488', bg: '#CCFBF1' },
                        { label: 'Apply Clicks', value: totalClicks, icon: <MousePointerClick size={16} />, color: '#7C3AED', bg: '#EDE9FE' },
                        { label: 'Applicants', value: totalApplicants, icon: <User size={16} />, color: '#E879A8', bg: '#FCE7F3' },
                    ].map(s => (
                        <div key={s.label} style={{ ...cardBase, padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '12px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: s.bg, color: s.color, flexShrink: 0,
                                border: '1px solid rgba(255,255,255,0.5)',
                                boxShadow: '3px 3px 8px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
                            }}>
                                {s.icon}
                            </div>
                            <div>
                                <p style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: 0, lineHeight: 1 }}>{s.value}</p>
                                <p style={{ fontSize: '11px', color: '#8A9BA6', margin: 0, fontWeight: 500 }}>{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ═══ Quick Access Row ═══ */}
                {!isTokenAccess && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                        {/* Talent Pool */}
                        <Link href="/employer/candidates" className="emp-cta-card" style={{
                            ...cardBase, padding: '16px 20px', textDecoration: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'linear-gradient(145deg, #10B981, #0D9488)', color: '#fff',
                                    boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                                }}>
                                    <Users size={18} />
                                </div>
                                <div>
                                    <p style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: 0 }}>Browse Talent Pool</p>
                                    <p style={{ fontSize: '11px', color: '#8A9BA6', margin: 0 }}>Search qualified PMHNP candidates</p>
                                </div>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>Browse →</span>
                        </Link>

                        {/* Messages */}
                        <Link href="/messages" className="emp-cta-card" style={{
                            ...cardBase, padding: '16px 20px', textDecoration: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'linear-gradient(145deg, #818CF8, #6366F1)', color: '#fff',
                                    boxShadow: '3px 3px 8px rgba(99,102,241,0.15)',
                                }}>
                                    <Mail size={18} />
                                </div>
                                <div>
                                    <p style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: 0 }}>Messages</p>
                                    <p style={{ fontSize: '11px', color: '#8A9BA6', margin: 0 }}>View & reply to candidate conversations</p>
                                </div>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#6366F1' }}>Open →</span>
                        </Link>
                    </div>
                )}

                {/* ═══ Usage Widget ═══ */}
                {!isTokenAccess && <UsageWidget />}

                {/* ═══ Tab Navigation ═══ */}
                {!isTokenAccess && (
                    <div style={{
                        ...cardRecessed, display: 'flex', gap: '4px', padding: '4px',
                        marginBottom: '20px', overflowX: 'auto',
                    }}>
                        {tabItems.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    flex: 1, padding: '10px 14px', borderRadius: '12px',
                                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                    whiteSpace: 'nowrap', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    background: activeTab === tab.key ? '#F7FBF8' : 'transparent',
                                    color: activeTab === tab.key ? '#1A2E35' : '#8A9BA6',
                                    border: activeTab === tab.key ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
                                    boxShadow: activeTab === tab.key
                                        ? '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)'
                                        : 'none',
                                }}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* ═══ Tab Content ═══ */}
                {activeTab === 'applicants' && !isTokenAccess && <ApplicantsTab />}
                {activeTab === 'analytics' && !isTokenAccess && <AnalyticsTab />}
                {activeTab === 'messages' && !isTokenAccess && <MessagesTab />}
                {activeTab === 'saved' && !isTokenAccess && <SavedCandidatesTab />}

                {/* ═══ Jobs Tab ═══ */}
                {(activeTab === 'jobs' || isTokenAccess) && (
                    <>
                        {/* Empty State */}
                        {localJobs.length === 0 && (
                            <div style={{ ...cardBase, padding: '48px 24px', textAlign: 'center' }}>
                                <div style={{
                                    width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 16px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: '#CCFBF1', color: '#0D9488',
                                    border: '1px solid rgba(255,255,255,0.5)',
                                    boxShadow: '5px 5px 12px rgba(0,0,0,0.06), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.7)',
                                }}>
                                    <Briefcase size={28} />
                                </div>
                                <h3 style={{
                                    fontSize: '20px', fontWeight: 700,
                                    fontFamily: 'var(--font-lora), Georgia, serif',
                                    color: '#1A2E35', marginBottom: '6px',
                                }}>Welcome! Let&apos;s get started</h3>
                                <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '24px' }}>
                                    Follow these steps to start hiring qualified PMHNPs
                                </p>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', maxWidth: '560px', marginInline: 'auto', marginBottom: '24px' }}>
                                    {[
                                        { step: 1, title: 'Company Profile', desc: 'Add logo & company details', href: '/employer/settings', active: true },
                                        { step: 2, title: 'Post a Job', desc: 'Create your first listing', href: '/post-job', active: true },
                                        { step: 3, title: 'Track Results', desc: 'Views, clicks & applicants', href: '#', active: false },
                                    ].map(s => {
                                        const content = (
                                            <div style={{
                                                ...cardRecessed, padding: '14px', textAlign: 'left',
                                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                                opacity: s.active ? 1 : 0.5,
                                                cursor: s.active ? 'pointer' : 'default',
                                                transition: 'all 0.2s',
                                            }}>
                                                <span style={{
                                                    width: '26px', height: '26px', borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: s.active ? '#0D9488' : '#B0C4BC',
                                                    color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0,
                                                }}>{s.step}</span>
                                                <div>
                                                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', margin: '0 0 2px' }}>{s.title}</p>
                                                    <p style={{ fontSize: '11px', color: '#8A9BA6', margin: 0 }}>{s.desc}</p>
                                                </div>
                                            </div>
                                        );
                                        return s.active
                                            ? <Link key={s.step} href={s.href} style={{ textDecoration: 'none' }}>{content}</Link>
                                            : <div key={s.step}>{content}</div>;
                                    })}
                                </div>

                                <Link href="/post-job" style={{
                                    ...clayBtn, background: 'linear-gradient(145deg, #10B981, #0D9488)',
                                    color: '#fff', border: 'none', padding: '12px 24px', fontSize: '14px',
                                    boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                                }}>
                                    <Rocket size={16} /> Post Your First Job
                                </Link>
                            </div>
                        )}

                        {/* Jobs List */}
                        {localJobs.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {localJobs.map((job: Job) => (
                                    <div key={job.id} className="emp-job-card" style={{
                                        ...cardBase, padding: '18px 20px',
                                        transition: 'all 0.2s',
                                    }}>
                                        {/* Header: Title + Status */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <Link href={getJobHref(job)} style={{
                                                        fontSize: '16px', fontWeight: 700,
                                                        fontFamily: 'var(--font-lora), Georgia, serif',
                                                        color: '#1A2E35', textDecoration: 'none',
                                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    }} className="emp-job-title">
                                                        {job.title}
                                                        {job.isPublished && <ExternalLink size={14} style={{ color: '#B0C4BC' }} />}
                                                    </Link>
                                                    {getStatusBadge(job)}
                                                    {job.isFeatured && (
                                                        <span style={{ ...clayPill, background: '#CCFBF1', color: '#0D9488' }}>★ Featured</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stats Row */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                            <span style={{ ...cardRecessed, padding: '4px 10px', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Eye size={11} /> {job.viewCount} views
                                            </span>
                                            <span style={{ ...cardRecessed, padding: '4px 10px', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <MousePointerClick size={11} /> {job.applyClickCount} clicks
                                            </span>
                                            {(job.applicantCount !== undefined && job.applicantCount > 0) && (
                                                <span style={{ ...cardRecessed, padding: '4px 10px', fontSize: '11px', fontWeight: 600, color: '#059669', background: '#D1FAE5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <User size={11} /> {job.applicantCount} applicant{job.applicantCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* Date Row */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: '#8A9BA6', marginBottom: '14px' }}>
                                            <span>Posted {formatDate(job.createdAt)}</span>
                                            {mounted && job.expiresAt && (
                                                <span style={{ color: isExpiringSoon(job) ? '#D97706' : '#8A9BA6', fontWeight: isExpiringSoon(job) ? 600 : 400 }}>
                                                    {isExpired(job) ? 'Expired' : 'Expires'} {formatDate(job.expiresAt)}
                                                    {isExpiringSoon(job) && ' ⚠️'}
                                                </span>
                                            )}
                                            {job.paymentStatus === 'paid' && (
                                                <a
                                                    href={`/api/employer/invoice?jobId=${job.id}${dashboardToken ? `&token=${dashboardToken}` : ''}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ color: '#0D9488', textDecoration: 'underline', fontWeight: 600 }}
                                                >
                                                    Download Invoice
                                                </a>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                                            <Link href={`/jobs/edit/${job.editToken}`} className="emp-action-btn" style={{
                                                ...clayBtn, background: '#F7FBF8', color: '#2A4A5A',
                                            }}>
                                                <Edit size={14} /> Edit
                                            </Link>
                                            {mounted && !isExpired(job) && (
                                                <button
                                                    onClick={() => handleTogglePublish(job)}
                                                    disabled={togglingJobId === job.id}
                                                    className="emp-action-btn"
                                                    style={{
                                                        ...clayBtn,
                                                        background: job.isPublished ? '#FEF3C7' : '#D1FAE5',
                                                        color: job.isPublished ? '#D97706' : '#059669',
                                                        opacity: togglingJobId === job.id ? 0.6 : 1,
                                                    }}
                                                >
                                                    {togglingJobId === job.id
                                                        ? <Loader2 size={14} className="animate-spin" />
                                                        : job.isPublished ? <Pause size={14} /> : <Play size={14} />}
                                                    {togglingJobId === job.id ? '...' : job.isPublished ? 'Pause' : 'Unpause'}
                                                </button>
                                            )}
                                            {/* Upgrade button removed — single-tier model */}
                                            {mounted && shouldShowRenew(job) && (
                                                <button
                                                    onClick={() => handleRenewClick(job)}
                                                    disabled={renewingJobId === job.id}
                                                    className="emp-action-btn"
                                                    style={{
                                                        ...clayBtn,
                                                        background: 'linear-gradient(145deg, #10B981, #0D9488)',
                                                        color: '#fff', border: 'none',
                                                        boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                                                        opacity: renewingJobId === job.id ? 0.6 : 1,
                                                    }}
                                                >
                                                    <RefreshCw size={14} className={renewingJobId === job.id ? 'animate-spin' : ''} />
                                                    {renewingJobId === job.id ? 'Processing...' : 'Renew'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Newsletter Opt-in — session access only */}
                        {!isTokenAccess && newsletterChecked && (
                            <div style={{ ...cardBase, padding: '16px 20px', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '12px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: '#CCFBF1', color: '#0D9488',
                                        border: '1px solid rgba(255,255,255,0.5)',
                                        boxShadow: '3px 3px 8px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.7)',
                                    }}>
                                        <Mail size={16} />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: 0 }}>Employer Newsletter</p>
                                        <p style={{ fontSize: '11px', color: '#8A9BA6', margin: 0 }}>Hiring tips, salary benchmarks & PMHNP market insights</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleNewsletterToggle}
                                    disabled={newsletterLoading}
                                    style={clayToggle(newsletterOptIn)}
                                >
                                    <div style={clayToggleKnob(newsletterOptIn)} />
                                </button>
                            </div>
                        )}

                        {/* Notification Preferences — session access only */}
                        {!isTokenAccess && notifPrefs.length > 0 && (
                            <div style={{ ...cardBase, padding: '18px 20px', marginTop: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '12px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: '#CCFBF1', color: '#0D9488',
                                        border: '1px solid rgba(255,255,255,0.5)',
                                        boxShadow: '3px 3px 8px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.7)',
                                    }}>
                                        <Bell size={16} />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: 0 }}>Application Notifications</p>
                                        <p style={{ fontSize: '11px', color: '#8A9BA6', margin: 0 }}>Get notified when candidates apply</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {notifPrefs.map(pref => (
                                        <div
                                            key={pref.employerJobId}
                                            style={{
                                                ...cardRecessed, padding: '10px 14px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                                            }}
                                        >
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pref.jobTitle}</p>
                                                <p style={{ fontSize: '10px', color: '#8A9BA6', margin: 0 }}>
                                                    {pref.notifyOnApplication ? 'Email on each application' : 'Notifications off'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    setNotifLoading(pref.employerJobId);
                                                    const newState = !pref.notifyOnApplication;
                                                    setNotifPrefs(prev => prev.map(p =>
                                                        p.employerJobId === pref.employerJobId
                                                            ? { ...p, notifyOnApplication: newState }
                                                            : p
                                                    ));
                                                    try {
                                                        await fetch('/api/employer/settings/notifications', {
                                                            method: 'PATCH',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                employerJobId: pref.employerJobId,
                                                                notifyOnApplication: newState,
                                                            }),
                                                        });
                                                    } catch {
                                                        setNotifPrefs(prev => prev.map(p =>
                                                            p.employerJobId === pref.employerJobId
                                                                ? { ...p, notifyOnApplication: !newState }
                                                                : p
                                                        ));
                                                    } finally {
                                                        setNotifLoading(null);
                                                    }
                                                }}
                                                disabled={notifLoading === pref.employerJobId}
                                                style={clayToggle(pref.notifyOnApplication)}
                                            >
                                                <div style={clayToggleKnob(pref.notifyOnApplication)} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}


                    </>
                )}

                {/* ═══ Renewal Modal ═══ */}
                {showRenewModal && selectedJob && (
                    <div style={{
                        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '16px', zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                    }}>
                        <div style={{
                            ...cardBase, maxWidth: '440px', width: '100%', padding: '24px',
                            boxShadow: '12px 12px 30px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
                        }}>
                            <h3 style={{
                                fontSize: '18px', fontWeight: 700,
                                fontFamily: 'var(--font-lora), Georgia, serif',
                                color: '#1A2E35', marginBottom: '4px',
                            }}>Renew Job Posting</h3>
                            <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '20px' }}>{selectedJob.title}</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                                {/* Single-tier renewal */}
                                <button onClick={() => handleRenewCheckout('growth')} className="emp-tier-btn" style={{
                                    ...cardBase, padding: '14px 16px', cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                                    textAlign: 'left', transition: 'all 0.2s',
                                    background: '#CCFBF1', border: '2px solid #0D9488',
                                }}>
                                    <div>
                                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#134E4A', margin: '0 0 4px' }}>Renew Listing</p>
                                        <p style={{ fontSize: '11px', color: '#0D9488', margin: 0, lineHeight: 1.5 }}>✓ 60 more days · Featured · 25 unlocks · 25 InMails</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '20px', fontWeight: 800, color: '#134E4A' }}>${config.renewalPrice}</span>
                                        <p style={{ fontSize: '10px', color: '#6B7F8A', margin: 0 }}>Save 20%</p>
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={() => { setShowRenewModal(false); setSelectedJob(null); }}
                                style={{
                                    ...clayBtn, width: '100%', justifyContent: 'center',
                                    background: '#EDF5F0', color: '#6B7F8A',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ RIGHT SIDEBAR — All Cards ═══ */}
            <aside style={{ position: 'sticky', top: '100px', display: 'flex', flexDirection: 'column', gap: '16px' }} className="emp-right-panel">

                {/* ── Hiring Tips ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
                    <img
                        src="/images/employer-hiring.png"
                        alt="Hiring tips"
                        style={{ width: '100%', height: '180px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 6px' }}>
                            Hiring Tips
                        </h3>
                        <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 10px', lineHeight: 1.5 }}>
                            Featured job postings get 3x more qualified applicants. Your first 2 posts are free.
                        </p>
                        <Link href="/post-job" className="emp-cta-card" style={{
                            fontSize: '12px', fontWeight: 600, color: '#fff',
                            background: 'linear-gradient(145deg, #0D9488, #10B981)',
                            padding: '7px 14px', borderRadius: '10px',
                            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            boxShadow: '3px 3px 8px rgba(13,148,136,0.15), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}>
                            <Plus size={13} /> Post a Job
                        </Link>
                    </div>
                </div>

                {/* ── Talent Pool ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
                    <img
                        src="/images/employer-talent.png"
                        alt="Browse talent"
                        style={{ width: '100%', height: '180px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 6px' }}>
                            Talent Pool
                        </h3>
                        <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 10px', lineHeight: 1.5 }}>
                            Browse qualified PMHNP candidates. Save, tag, and manage your pipeline.
                        </p>
                        <Link href="/employer/candidates" className="emp-cta-card" style={{
                            fontSize: '12px', fontWeight: 600, color: '#0D9488',
                            background: '#CCFBF1',
                            padding: '7px 14px', borderRadius: '10px',
                            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            border: '1px solid #99F6E4',
                            boxShadow: '3px 3px 8px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.6)',
                        }}>
                            <Users size={13} /> Browse Candidates
                        </Link>
                    </div>
                </div>

                {/* ── Star Rating ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
                    <img
                        src="/images/employer-feedback.png"
                        alt="Rate your experience"
                        style={{ width: '100%', height: '180px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <EmployerFeedbackCard />
                    </div>
                </div>

                {/* ── Share Your Story ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
                    <img
                        src="/images/employer-story.png"
                        alt="Share your story"
                        style={{ width: '100%', height: '180px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <EmployerTestimonialCard employerName={employerName} />
                    </div>
                </div>

                {/* ── Support & Help ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
                    <img
                        src="/images/employer-support.png"
                        alt="Get support"
                        style={{ width: '100%', height: '180px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px', textAlign: 'center' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 6px' }}>
                            Need Help?
                        </h3>
                        <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 12px', lineHeight: 1.4 }}>
                            We typically respond within 24 hours.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <Link href="/contact" className="emp-cta-card" style={{
                                fontSize: '12px', fontWeight: 600, color: '#fff',
                                background: 'linear-gradient(145deg, #0D9488, #10B981)',
                                padding: '7px 14px', borderRadius: '10px',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                boxShadow: '3px 3px 8px rgba(13,148,136,0.15), inset 0 1px 0 rgba(255,255,255,0.15)',
                            }}>
                                <MessageSquare size={12} /> Contact
                            </Link>
                            <Link href="/faq" className="emp-cta-card" style={{
                                fontSize: '12px', fontWeight: 600, color: '#0D9488',
                                background: '#F0FDFA',
                                padding: '7px 14px', borderRadius: '10px',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                border: '1px solid rgba(13,148,136,0.15)',
                            }}>
                                <HelpCircle size={12} /> FAQs
                            </Link>
                        </div>
                    </div>
                </div>

            </aside>
            </div>
            </div>

            {/* ═══ Hover Styles ═══ */}
            <style>{`
                .emp-job-card:hover {
                    box-shadow: 10px 10px 24px rgba(0,0,0,0.09), -5px -5px 14px rgba(255,255,255,0.95), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02) !important;
                    transform: translateY(-1px);
                }
                .emp-cta-card:hover {
                    box-shadow: 10px 10px 24px rgba(0,0,0,0.09), -5px -5px 14px rgba(255,255,255,0.95), inset 2px 2px 4px rgba(255,255,255,0.6) !important;
                    transform: translateY(-1px);
                }
                .emp-action-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 4px 4px 10px rgba(0,0,0,0.07), -3px -3px 8px rgba(255,255,255,0.8) !important;
                }
                .emp-job-title:hover {
                    color: #0D9488 !important;
                }
                .emp-tier-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 6px 6px 14px rgba(0,0,0,0.1), -3px -3px 8px rgba(255,255,255,0.9) !important;
                }
                @media (max-width: 900px) {
                    .emp-dashboard-grid {
                        grid-template-columns: 1fr !important;
                    }
                    .emp-right-panel {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}

/* ═══ Employer Feedback Rating Card ═══ */
function EmployerFeedbackCard() {
    const [hovered, setHovered] = useState(0);
    const [selected, setSelected] = useState(0);
    const [message, setMessage] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (selected === 0) return;
        setLoading(true);
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: selected, message, page: 'employer-dashboard' }),
            });
            setSubmitted(true);
        } catch { /* silent */ }
        setLoading(false);
    };

    if (submitted) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#0D9488', margin: '0 0 4px' }}>Thank You!</h3>
                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0 }}>Your feedback helps us improve the platform for all employers.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                Rate Your Experience
            </h3>
            <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 14px', lineHeight: 1.4 }}>
                How would you rate PMHNP Hiring so far?
            </p>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        onMouseEnter={() => setHovered(n)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => setSelected(n)}
                        style={{
                            background: 'none', border: 'none', padding: '4px', cursor: 'pointer',
                            transform: (hovered >= n || selected >= n) ? 'scale(1.15)' : 'scale(1)',
                            transition: 'transform 0.15s ease',
                        }}
                        aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                    >
                        <Star
                            size={24}
                            fill={(hovered >= n || selected >= n) ? '#F59E0B' : 'none'}
                            color={(hovered >= n || selected >= n) ? '#F59E0B' : '#CBD5E1'}
                            strokeWidth={1.5}
                        />
                    </button>
                ))}
            </div>
            {selected > 0 && (
                <>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tell us more (optional)..."
                        rows={2}
                        style={{
                            width: '100%', padding: '10px 12px', fontSize: '13px',
                            borderRadius: '12px', border: '1px solid rgba(0,0,0,0.06)',
                            background: '#F5F6F8', color: '#1A2E35', resize: 'none',
                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04)',
                            outline: 'none', fontFamily: 'inherit', marginBottom: '10px',
                        }}
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{
                            alignSelf: 'flex-start',
                            fontSize: '12px', fontWeight: 600, color: '#fff',
                            background: 'linear-gradient(145deg, #0D9488, #10B981)',
                            padding: '8px 18px', borderRadius: '12px', border: 'none',
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                            boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                        }}
                    >
                        {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        Submit Feedback
                    </button>
                </>
            )}
        </div>
    );
}

/* ═══ Employer Testimonial Collection Card ═══ */
function EmployerTestimonialCard({ employerName }: { employerName: string }) {
    const [review, setReview] = useState('');
    const [consent, setConsent] = useState(false);
    const [displayAs, setDisplayAs] = useState<'full' | 'initial' | 'anonymous'>('initial');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!review.trim()) return;
        setLoading(true);
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: 5,
                    message: `[EMPLOYER-TESTIMONIAL] ${review} | consent=${consent} | display=${displayAs}`,
                    page: 'employer-dashboard-testimonial',
                }),
            });
            setSubmitted(true);
        } catch { /* silent */ }
        setLoading(false);
    };

    if (submitted) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>💜</div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#818CF8', margin: '0 0 4px' }}>Story Shared!</h3>
                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0 }}>We may feature your experience to help other employers.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                Share Your Story
            </h3>
            <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 12px', lineHeight: 1.4 }}>
                {employerName}, your hiring experience matters! Help others discover PMHNP Hiring.
            </p>
            <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="How has PMHNP Hiring helped your recruitment?"
                rows={3}
                maxLength={500}
                style={{
                    width: '100%', padding: '10px 12px', fontSize: '13px',
                    borderRadius: '12px', border: '1px solid rgba(0,0,0,0.06)',
                    background: '#F5F6F8', color: '#1A2E35', resize: 'none',
                    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04)',
                    outline: 'none', fontFamily: 'inherit', marginBottom: '8px',
                }}
            />
            <span style={{ fontSize: '11px', color: '#A0AEB5', marginBottom: '10px', textAlign: 'right' }}>
                {review.length}/500
            </span>
            <label style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                fontSize: '12px', color: '#4A5E6A', cursor: 'pointer',
                marginBottom: '6px', lineHeight: 1.4,
            }}>
                <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    style={{ marginTop: '2px', accentColor: '#0D9488' }}
                />
                I consent to my review being featured publicly
            </label>
            {consent && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#6B7F8A', lineHeight: '24px' }}>Display as:</span>
                    {([
                        { key: 'full' as const, label: 'Full Name' },
                        { key: 'initial' as const, label: 'First + Last Initial' },
                        { key: 'anonymous' as const, label: 'Anonymous' },
                    ]).map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => setDisplayAs(opt.key)}
                            style={{
                                fontSize: '11px', fontWeight: displayAs === opt.key ? 600 : 400,
                                padding: '3px 10px', borderRadius: '8px', border: 'none',
                                cursor: 'pointer',
                                background: displayAs === opt.key ? '#CCFBF1' : '#F5F6F8',
                                color: displayAs === opt.key ? '#0D9488' : '#6B7F8A',
                                boxShadow: displayAs === opt.key
                                    ? '2px 2px 5px rgba(13,148,136,0.1), inset 1px 1px 2px rgba(255,255,255,0.5)'
                                    : 'none',
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
            <button
                onClick={handleSubmit}
                disabled={loading || !review.trim()}
                style={{
                    alignSelf: 'flex-start',
                    fontSize: '12px', fontWeight: 600, color: '#fff',
                    background: review.trim() ? 'linear-gradient(145deg, #818CF8, #6366F1)' : '#CBD5E1',
                    padding: '8px 18px', borderRadius: '12px', border: 'none',
                    cursor: review.trim() ? 'pointer' : 'not-allowed',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    boxShadow: review.trim()
                        ? '3px 3px 8px rgba(99,102,241,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)'
                        : 'none',
                }}
            >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Share Story
            </button>
        </div>
    );
}
