'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatDate, getExpiryStatus } from '@/lib/utils';
import { ExternalLink, Edit, RefreshCw, Mail, Loader2, Shield, Pause, Play, Rocket, Users, Eye, MousePointerClick, User, Plus, Briefcase, BarChart3, Star, MessageSquare, Send, HelpCircle, Archive, ArchiveRestore, Info, FileText } from 'lucide-react';
import { config } from '@/lib/config';
import { trackBeginCheckout } from '@/lib/analytics';
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
    archivedAt: string | null;
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



export default function EmployerDashboardClient({ employerEmail, employerName, jobs, dashboardToken }: EmployerDashboardClientProps) {
    const isTokenAccess = !!dashboardToken;

    const [renewingJobId, setRenewingJobId] = useState<string | null>(null);
    const [upgradingJobId, setUpgradingJobId] = useState<string | null>(null);
    const [showRenewModal, setShowRenewModal] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
    const [archivingJobId, setArchivingJobId] = useState<string | null>(null);
    const [jobFilter, setJobFilter] = useState<'active' | 'archived'>('active');
    const [archiveTarget, setArchiveTarget] = useState<Job | null>(null);
    // Unpublish-reason capture: when employer pauses a live job, prompt them
    // for the reason. Republishing skips the modal entirely (handled below).
    const [unpublishTarget, setUnpublishTarget] = useState<Job | null>(null);
    const [unpublishReason, setUnpublishReason] = useState<string>('');
    const [unpublishNote, setUnpublishNote] = useState<string>('');
    const [localJobs, setLocalJobs] = useState(jobs);
    const [showSignupBanner, setShowSignupBanner] = useState(isTokenAccess);
    // Tab can be deep-linked via `?tab=...` so the top-nav "Applicants" entry
    // (and any external link) lands directly on the right tab.
    const TAB_KEYS = ['jobs', 'applicants', 'analytics', 'saved', 'messages'] as const;
    type TabKey = typeof TAB_KEYS[number];
    const isValidTab = (t: string | null): t is TabKey =>
        t !== null && (TAB_KEYS as readonly string[]).includes(t);

    const searchParams = useSearchParams();
    const tabFromUrl = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState<TabKey>(
        isValidTab(tabFromUrl) ? tabFromUrl : 'jobs',
    );
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Sync internal tab state when the URL query changes (top-nav navigation
    // between Dashboard and Applicants is the primary trigger).
    useEffect(() => {
        if (isValidTab(tabFromUrl) && tabFromUrl !== activeTab) {
            setActiveTab(tabFromUrl);
        }
        // Intentionally only depend on tabFromUrl — depending on activeTab
        // would create a loop with the user's manual tab clicks.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabFromUrl]);

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

    // Click handler on the Pause/Unpause button. For "pause" (published -> not),
    // open the reason modal first; for "unpause" (not -> published), call the
    // API immediately — no reason needed for republish.
    const handleTogglePublish = (job: Job) => {
        if (job.isPublished) {
            setUnpublishTarget(job);
            setUnpublishReason('');
            setUnpublishNote('');
            return;
        }
        void performTogglePublish(job, null, null);
    };

    const performTogglePublish = async (job: Job, reason: string | null, note: string | null) => {
        setTogglingJobId(job.id);
        try {
            const res = await fetch(`/api/employer/jobs/${job.id}/toggle-publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: reason ? JSON.stringify({ reason, note: note ?? undefined }) : undefined,
            });
            const result = await res.json();
            if (res.ok && result.success) {
                setLocalJobs(prev => prev.map(j =>
                    j.id === job.id ? { ...j, isPublished: result.isPublished } : j
                ));
            }
        } catch { /* silent */ } finally {
            setTogglingJobId(null);
            setUnpublishTarget(null);
        }
    };

    const submitUnpublish = () => {
        if (!unpublishTarget) return;
        // Allow paused-without-reason — don't force the user to pick. The modal
        // suggests options but skipping is a single click on "Pause anyway".
        const reason = unpublishReason || null;
        const note = unpublishReason === 'other' ? unpublishNote : null;
        void performTogglePublish(unpublishTarget, reason, note);
    };

    const handleToggleArchive = (job: Job) => {
        // Restoring is reversible — no confirmation needed. Archiving needs confirmation
        // because the job leaves the public board and free posts don't refund quota.
        if (job.archivedAt) {
            void performArchiveToggle(job);
            return;
        }
        setArchiveTarget(job);
    };

    const performArchiveToggle = async (job: Job) => {
        setArchivingJobId(job.id);
        setArchiveTarget(null);
        try {
            const res = await fetch(`/api/employer/jobs/${job.id}/archive`, { method: 'PATCH' });
            const result = await res.json();
            if (res.ok && result.success) {
                setLocalJobs(prev => prev.map(j =>
                    j.id === job.id
                        ? { ...j, archivedAt: result.archivedAt, isPublished: result.archivedAt ? false : j.isPublished }
                        : j
                ));
            }
        } catch { /* silent */ } finally {
            setArchivingJobId(null);
        }
    };

    const handleRenewCheckout = async (tier: 'pro') => {
        if (!selectedJob) return;

        setRenewingJobId(selectedJob.id);
        setShowRenewModal(false);

        // P7: fire begin_checkout for renewal
        trackBeginCheckout(config.stripeRenewalPriceInCents, 'renewal');

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
        <div style={{ background: '#F5F0EB', overflowX: 'hidden' }}>
            {/* overflowX: hidden is a defensive guard against any child grid /
                flex / image accidentally forcing a horizontal scroll on
                phones — it doesn't fix the underlying overflow source, but
                it does prevent the user-visible symptom (page wider than
                viewport → "right side cut off" / title clipping). If a
                child element is overflowing we want to know — but on a
                customer-facing dashboard, a clean phone view trumps
                surfacing layout bugs to end users. */}
            {/* ═══ Hero Header ═══ */}
            <div style={{
                padding: '16px 16px 20px',
                background: 'linear-gradient(180deg, #EDE7E0 0%, #F5F0EB 100%)',
                borderBottom: '1px solid #E5DDD3',
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

            {/* Grid template moved into the .emp-dashboard-grid CSS class so
                the @media (max-width: 900px) rule below can actually
                override it on phones. Keeping it as an inline style meant
                the inline rule was winning even with !important inside the
                <style> JSX block — observed live as a 578px-wide grid on
                a 414px iPhone XR viewport, with the right sidebar refusing
                to collapse. */}
            <div className="emp-dashboard-grid" style={{ display: 'grid', gap: '24px', alignItems: 'start' }}>
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

                {/* ═══ Quick Access Row ═══
                    Stack the two CTA cards on phones — at 1fr 1fr the icon +
                    two-line copy + chevron clipped both cards (Talent Pool
                    truncated to "Search qualified PMHNP", Messages to
                    "Messa..."). Single column on ≤640px, 2-col on tablet+. */}
                {!isTokenAccess && (
                    <div className="emp-quick-access" style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
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
                        <style>{`
                            @media (min-width: 641px) {
                                .emp-quick-access {
                                    grid-template-columns: 1fr 1fr !important;
                                }
                            }
                        `}</style>
                    </div>
                )}

                {/* ═══ Usage Widget ═══ */}
                {!isTokenAccess && <UsageWidget />}

                {/* ═══ Tab Navigation ═══
                    flex: 1 was forcing all 5 tabs to share the row equally,
                    which on a 414px viewport meant each label collapsed to
                    icon-only or got clipped; overflowX: auto did nothing
                    because the children already "fit" (shrunk). Switched to
                    flex: 0 0 auto + a class that adds touch-action + a
                    hidden scrollbar so mobile users can swipe through all
                    five tabs (Messages/Saved live off-screen on phones).
                    On md+ the .emp-tab-strip rule restores flex: 1 so the
                    desktop look (tabs filling the row) is unchanged. */}
                {!isTokenAccess && (
                    <div
                        className="emp-tab-strip"
                        style={{
                            ...cardRecessed, display: 'flex', gap: '4px', padding: '4px',
                            marginBottom: '20px', overflowX: 'auto',
                            touchAction: 'pan-x',
                            WebkitOverflowScrolling: 'touch',
                            scrollbarWidth: 'none',
                        }}
                    >
                        {tabItems.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className="emp-tab-btn"
                                style={{
                                    flex: '0 0 auto', padding: '10px 14px', borderRadius: '12px',
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

                        {/* Active / Archived filter — visible only when there's at least one archived job */}
                        {localJobs.some(j => j.archivedAt) && localJobs.length > 0 && (
                            <div style={{
                                ...cardRecessed, display: 'inline-flex', gap: '4px', padding: '4px',
                                marginBottom: '14px',
                            }}>
                                {(['active', 'archived'] as const).map(f => {
                                    const count = localJobs.filter(j => f === 'archived' ? !!j.archivedAt : !j.archivedAt).length;
                                    return (
                                        <button
                                            key={f}
                                            onClick={() => setJobFilter(f)}
                                            style={{
                                                padding: '6px 14px', borderRadius: '10px',
                                                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                                background: jobFilter === f ? '#fff' : 'transparent',
                                                color: jobFilter === f ? '#1A2E35' : '#8A9BA6',
                                                border: jobFilter === f ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
                                                boxShadow: jobFilter === f
                                                    ? '2px 2px 6px rgba(0,0,0,0.05), -1px -1px 4px rgba(255,255,255,0.7), inset 1px 1px 1px rgba(255,255,255,0.5)'
                                                    : 'none',
                                                textTransform: 'capitalize',
                                            }}
                                        >
                                            {f} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Jobs List */}
                        {localJobs.length > 0 && (() => {
                            const filteredJobs = localJobs.filter(j => jobFilter === 'archived' ? !!j.archivedAt : !j.archivedAt);
                            if (filteredJobs.length === 0) {
                                return (
                                    <div style={{ ...cardBase, padding: '32px 24px', textAlign: 'center' }}>
                                        <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0 }}>
                                            {jobFilter === 'archived' ? 'No archived jobs yet.' : 'No active jobs.'}
                                        </p>
                                    </div>
                                );
                            }
                            return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {filteredJobs.map((job: Job) => (
                                    <div key={job.id} className="emp-job-card" style={{
                                        ...cardBase, padding: '18px 20px',
                                        transition: 'all 0.2s',
                                    }}>
                                        {/* Header: Title + Status */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                {/* Title on its own block row so long titles wrap
                                                    cleanly instead of clipping mid-word. The
                                                    previous flex-wrap row mixed title + badges,
                                                    and flex items don't break their internal text
                                                    when the item's box width exceeds the row —
                                                    they just overflow. Splitting them gives the
                                                    title freedom to wrap and lets badges still
                                                    flex-wrap underneath. */}
                                                <Link
                                                    href={getJobHref(job)}
                                                    className="emp-job-title"
                                                    style={{
                                                        display: 'block',
                                                        maxWidth: '100%',
                                                        fontSize: '16px', fontWeight: 700,
                                                        fontFamily: 'var(--font-lora), Georgia, serif',
                                                        color: '#1A2E35', textDecoration: 'none',
                                                        marginBottom: '8px',
                                                        wordBreak: 'break-word',
                                                        overflowWrap: 'anywhere',
                                                        // hyphens helps the wrap step pick natural break
                                                        // points inside the very long "TMS Brain Health
                                                        // Startup" title strings the employers tend to
                                                        // post — without this, wordBreak alone can
                                                        // produce ugly mid-word splits.
                                                        hyphens: 'auto',
                                                    }}
                                                >
                                                    {job.title}
                                                    {job.isPublished && <ExternalLink size={14} style={{ color: '#B0C4BC', display: 'inline-block', verticalAlign: 'middle', marginLeft: '6px' }} />}
                                                </Link>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    {getStatusBadge(job)}
                                                    {job.isFeatured && (
                                                        <span style={{ ...clayPill, background: '#CCFBF1', color: '#0D9488' }}>★ Featured</span>
                                                    )}
                                                    {(job.paymentStatus === 'free' || job.paymentStatus === 'free_renewed' || job.paymentStatus === 'free_upgraded') && (
                                                        <span style={{ ...clayPill, background: '#F0FDFA', color: '#0D9488', border: '1px solid rgba(13,148,136,0.18)' }}>Free trial</span>
                                                    )}
                                                    {job.archivedAt && (
                                                        <span style={{ ...clayPill, background: '#EDE9FE', color: '#7C3AED' }}>Archived</span>
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
                                            {/* Always render the applicant chip — even at zero — so the row reads
                                                consistently with the views and clicks chips. Greyed when zero so the
                                                empty state doesn't read as "broken counter". */}
                                            <span style={{
                                                ...cardRecessed,
                                                padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                                                color: (job.applicantCount ?? 0) > 0 ? '#059669' : '#6B7F8A',
                                                background: (job.applicantCount ?? 0) > 0 ? '#D1FAE5' : undefined,
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            }}>
                                                <User size={11} /> {(job.applicantCount ?? 0)} applicant{(job.applicantCount ?? 0) !== 1 ? 's' : ''}
                                            </span>
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
                                                    download={`invoice-${(job.title || 'job').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`}
                                                    style={{
                                                        color: '#0D9488', textDecoration: 'none', fontWeight: 600,
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    }}
                                                >
                                                    <FileText size={11} /> Download Invoice
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
                                            {mounted && (() => {
                                                const expired = isExpired(job);
                                                const disabled = expired || togglingJobId === job.id;
                                                return (
                                                    <button
                                                        onClick={() => !expired && handleTogglePublish(job)}
                                                        disabled={disabled}
                                                        title={expired ? 'This posting has expired — renew or post a new listing to make changes.' : undefined}
                                                        className="emp-action-btn"
                                                        style={{
                                                            ...clayBtn,
                                                            background: expired ? '#F3F4F6' : (job.isPublished ? '#FEF3C7' : '#D1FAE5'),
                                                            color: expired ? '#B0BEC5' : (job.isPublished ? '#D97706' : '#059669'),
                                                            opacity: togglingJobId === job.id ? 0.6 : (expired ? 0.55 : 1),
                                                            cursor: expired ? 'not-allowed' : 'pointer',
                                                        }}
                                                    >
                                                        {togglingJobId === job.id
                                                            ? <Loader2 size={14} className="animate-spin" />
                                                            : job.isPublished ? <Pause size={14} /> : <Play size={14} />}
                                                        {togglingJobId === job.id ? '...' : job.isPublished ? 'Pause' : 'Unpause'}
                                                    </button>
                                                );
                                            })()}
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
                                            {/* Archive / Restore — always available, hides post from public board */}
                                            <button
                                                onClick={() => handleToggleArchive(job)}
                                                disabled={archivingJobId === job.id}
                                                className="emp-action-btn"
                                                style={{
                                                    ...clayBtn,
                                                    background: job.archivedAt ? '#EDE9FE' : '#F3F4F6',
                                                    color: job.archivedAt ? '#7C3AED' : '#6B7280',
                                                    opacity: archivingJobId === job.id ? 0.6 : 1,
                                                }}
                                            >
                                                {archivingJobId === job.id ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : job.archivedAt ? (
                                                    <ArchiveRestore size={14} />
                                                ) : (
                                                    <Archive size={14} />
                                                )}
                                                {archivingJobId === job.id ? '...' : job.archivedAt ? 'Restore' : 'Archive'}
                                            </button>
                                        </div>

                                        {/* Pause-doesn't-extend hint — only when paused, not archived, not expired */}
                                        {mounted && !job.isPublished && !job.archivedAt && !isExpired(job) && (
                                            <div style={{
                                                display: 'flex', alignItems: 'flex-start', gap: '6px',
                                                fontSize: '11px', color: '#8A9BA6', margin: '10px 0 0',
                                                lineHeight: 1.5,
                                            }}>
                                                <Info size={13} style={{ flexShrink: 0, marginTop: '1px', color: '#B0BEC5' }} />
                                                <span>Pausing hides the listing but doesn&apos;t extend it — your {config.durationDays}-day window keeps counting.</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            );
                        })()}

                    </>
                )}

                {/* ═══ Archive Confirmation Modal — branches by paid vs free ═══ */}
                {archiveTarget && (() => {
                    const isFreePost = archiveTarget.paymentStatus === 'free'
                        || archiveTarget.paymentStatus === 'free_renewed'
                        || archiveTarget.paymentStatus === 'free_upgraded';
                    return (
                        <div style={{
                            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '16px', zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                        }}>
                            <div style={{
                                ...cardBase, maxWidth: '460px', width: '100%', padding: '24px',
                                boxShadow: '12px 12px 30px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
                            }}>
                                {/* Icon header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                    <div style={{
                                        width: '44px', height: '44px', borderRadius: '14px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: '#EDE9FE', color: '#7C3AED',
                                        border: '1px solid rgba(255,255,255,0.5)',
                                        boxShadow: '3px 3px 8px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.5)',
                                    }}>
                                        <Archive size={20} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h3 style={{
                                            fontSize: '18px', fontWeight: 700,
                                            fontFamily: 'var(--font-lora), Georgia, serif',
                                            color: '#1A2E35', margin: 0,
                                        }}>Archive this posting?</h3>
                                        <p style={{
                                            fontSize: '13px', color: '#8A9BA6', margin: '2px 0 0',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{archiveTarget.title}</p>
                                    </div>
                                </div>

                                {/* What will happen — bullet list */}
                                <div style={{
                                    background: '#F8FAFC', border: '1px solid rgba(0,0,0,0.05)',
                                    borderRadius: '12px', padding: '14px 16px', marginBottom: '16px',
                                }}>
                                    <p style={{
                                        fontSize: '11px', fontWeight: 700, color: '#6B7F8A',
                                        textTransform: 'uppercase', letterSpacing: '0.05em',
                                        margin: '0 0 8px',
                                    }}>What happens</p>
                                    <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: '13px', color: '#1A2E35', lineHeight: 1.6 }}>
                                        <li>Removed from the public job board immediately</li>
                                        <li>Stays in your dashboard under <strong>Archived</strong></li>
                                        <li>Existing applications and analytics are preserved</li>
                                        <li>You can restore it any time, then republish manually</li>
                                    </ul>
                                </div>

                                {/* Branch — paid vs free quota note */}
                                {isFreePost ? (
                                    <div style={{
                                        background: '#FFF8E1', border: '1px solid rgba(245,158,11,0.18)',
                                        borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
                                    }}>
                                        <p style={{ fontSize: '12px', color: '#92400E', margin: 0, lineHeight: 1.5 }}>
                                            <strong>Heads up:</strong> this is a free trial post. Archiving doesn&apos;t refund the credit — your organization&apos;s free quota stays at the same count.
                                        </p>
                                    </div>
                                ) : (
                                    <div style={{
                                        background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.18)',
                                        borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
                                    }}>
                                        <p style={{ fontSize: '12px', color: '#115E59', margin: 0, lineHeight: 1.5 }}>
                                            Your remaining {config.durationDays}-day window keeps counting down even while archived. Restoring later won&apos;t reset the expiry.
                                        </p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setArchiveTarget(null)}
                                        style={{
                                            ...clayBtn, flex: 1, justifyContent: 'center',
                                            background: '#F5F0EB', color: '#6B7F8A',
                                            padding: '12px 16px', fontWeight: 600, fontSize: '14px',
                                        }}
                                    >
                                        Keep Active
                                    </button>
                                    <button
                                        onClick={() => performArchiveToggle(archiveTarget)}
                                        style={{
                                            ...clayBtn, flex: 1, justifyContent: 'center',
                                            background: 'linear-gradient(145deg, #8B5CF6, #7C3AED)', color: '#fff',
                                            border: 'none', padding: '12px 16px', fontWeight: 700, fontSize: '14px',
                                            boxShadow: '4px 4px 12px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                                        }}
                                    >
                                        <Archive size={14} /> Archive
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ═══ Unpublish-Reason Modal — captures why an employer paused a live job ═══ */}
                {unpublishTarget && (() => {
                    const REASONS: { value: string; label: string; sub: string }[] = [
                        { value: 'filled', label: 'Filled the role', sub: 'You hired someone for this position' },
                        { value: 'enough_applicants', label: 'Got enough applicants', sub: 'You have enough candidates to review' },
                        { value: 'too_many_applicants', label: 'Too many applicants', sub: 'Inbox is overwhelmed — pausing to catch up' },
                        { value: 'low_quality', label: 'Applicants weren’t a fit', sub: 'Quality of candidates didn’t match what you need' },
                        { value: 'reposting_later', label: 'Reposting later', sub: 'Pausing temporarily — will republish soon' },
                        { value: 'other', label: 'Other', sub: 'Tell us in the box below' },
                    ];
                    const submitting = togglingJobId === unpublishTarget.id;
                    return (
                        <div style={{
                            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '16px', zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                        }}>
                            <div style={{
                                ...cardBase, maxWidth: '480px', width: '100%', padding: '24px',
                                maxHeight: '90vh', overflowY: 'auto',
                                boxShadow: '12px 12px 30px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '12px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'linear-gradient(145deg, #FEF3C7, #FDE68A)',
                                        boxShadow: '3px 3px 8px rgba(245,158,11,0.18), inset 1px 1px 2px rgba(255,255,255,0.5)',
                                    }}>
                                        <Pause size={18} color="#92400E" />
                                    </div>
                                    <h3 style={{
                                        fontSize: '18px', fontWeight: 700,
                                        fontFamily: 'var(--font-lora), Georgia, serif',
                                        color: '#1A2E35', margin: 0,
                                    }}>Quick question before pausing</h3>
                                </div>
                                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: '0 0 18px', lineHeight: 1.5 }}>
                                    Why are you pausing <strong style={{ color: '#1A2E35' }}>{unpublishTarget.title}</strong>?
                                    Helps us understand what&apos;s working and what isn&apos;t. Optional — you can skip.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                                    {REASONS.map((opt) => {
                                        const selected = unpublishReason === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setUnpublishReason(opt.value)}
                                                style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                                                    padding: '12px 14px', borderRadius: '12px',
                                                    background: selected ? '#F0FDFA' : '#FFFFFF',
                                                    border: `1px solid ${selected ? '#0D9488' : 'rgba(0,0,0,0.08)'}`,
                                                    boxShadow: selected
                                                        ? 'inset 2px 2px 4px rgba(13,148,136,0.06), 0 0 0 3px rgba(13,148,136,0.1)'
                                                        : '2px 2px 6px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.6)',
                                                    cursor: 'pointer', textAlign: 'left',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <span style={{
                                                    flexShrink: 0, marginTop: '2px',
                                                    width: '16px', height: '16px', borderRadius: '50%',
                                                    border: `2px solid ${selected ? '#0D9488' : '#CBD5E0'}`,
                                                    background: selected ? '#0D9488' : 'transparent',
                                                    boxShadow: selected ? 'inset 0 0 0 3px #fff' : 'none',
                                                }} />
                                                <div>
                                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', margin: 0 }}>{opt.label}</p>
                                                    <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '2px 0 0', lineHeight: 1.4 }}>{opt.sub}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {unpublishReason === 'other' && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <textarea
                                            value={unpublishNote}
                                            onChange={(e) => setUnpublishNote(e.target.value.slice(0, 1000))}
                                            placeholder="What's the reason? (optional, ~1000 chars max)"
                                            rows={3}
                                            style={{
                                                width: '100%', padding: '10px 12px',
                                                borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)',
                                                background: '#F5F6F8', color: '#1A2E35', fontSize: '14px',
                                                fontFamily: 'inherit', resize: 'vertical',
                                                boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
                                                outline: 'none',
                                            }}
                                        />
                                        <p style={{ fontSize: '11px', color: '#94A3B8', margin: '4px 0 0', textAlign: 'right' }}>
                                            {unpublishNote.length}/1000
                                        </p>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setUnpublishTarget(null)}
                                        disabled={submitting}
                                        style={{
                                            ...clayBtn, flex: 1, justifyContent: 'center',
                                            background: '#F5F0EB', color: '#6B7F8A',
                                            padding: '12px 16px', fontWeight: 600, fontSize: '14px',
                                            opacity: submitting ? 0.6 : 1,
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitUnpublish}
                                        disabled={submitting}
                                        style={{
                                            ...clayBtn, flex: 1, justifyContent: 'center',
                                            background: 'linear-gradient(145deg, #F59E0B, #D97706)', color: '#fff',
                                            border: 'none', padding: '12px 16px', fontWeight: 700, fontSize: '14px',
                                            boxShadow: '4px 4px 12px rgba(245,158,11,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                                            opacity: submitting ? 0.7 : 1,
                                        }}
                                    >
                                        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                                        {submitting ? 'Pausing...' : (unpublishReason ? 'Pause Job' : 'Pause Anyway')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ═══ Renewal Modal — branches on whether the original posting was free ═══ */}
                {showRenewModal && selectedJob && selectedJob.paymentStatus === 'free' && (
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
                            }}>This free post can&apos;t be renewed</h3>
                            <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '14px' }}>{selectedJob.title}</p>

                            <p style={{ fontSize: '14px', color: '#1A2E35', lineHeight: 1.6, marginBottom: '8px' }}>
                                Renewals at the discounted ${config.renewalPrice} rate are available for paid postings only.
                            </p>
                            <p style={{ fontSize: '13px', color: '#6B7F8A', lineHeight: 1.6, marginBottom: '20px' }}>
                                You can post this role again as a fresh listing for ${config.postingPrice} — same {config.durationDays}-day duration and a new bucket of {config.limits.candidateUnlocksPerPosting} unlocks &amp; {config.limits.inmailsPerPosting} InMails.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <Link href="/post-job" style={{
                                    ...clayBtn, width: '100%', justifyContent: 'center',
                                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                                    textDecoration: 'none', padding: '12px 16px', fontWeight: 700, fontSize: '14px',
                                }}>
                                    Post a New Job — ${config.postingPrice}
                                </Link>
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
                    </div>
                )}

                {showRenewModal && selectedJob && selectedJob.paymentStatus !== 'free' && (
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
                                <button onClick={() => handleRenewCheckout('pro')} className="emp-tier-btn" style={{
                                    ...cardBase, padding: '14px 16px', cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                                    textAlign: 'left', transition: 'all 0.2s',
                                    background: '#CCFBF1', border: '2px solid #0D9488',
                                }}>
                                    <div>
                                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#134E4A', margin: '0 0 4px' }}>Renew Listing</p>
                                        <p style={{ fontSize: '11px', color: '#0D9488', margin: 0, lineHeight: 1.5 }}>✓ Adds {config.durationDays} days to your expiration · Featured · {config.limits.candidateUnlocksPerPosting} unlocks · {config.limits.inmailsPerPosting} InMails</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '20px', fontWeight: 800, color: '#134E4A' }}>${config.renewalPrice}</span>
                                        <p style={{ fontSize: '10px', color: '#6B7F8A', margin: 0 }}>Save 10%</p>
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

                {/* ── Hiring Tips — numbered playbook, no duplicate CTA (header already has Post a New Job) ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 18px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 12px' }}>
                            Hiring Tips
                        </h3>
                        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[
                                <>Featured listings get <strong>3× more qualified applicants</strong> than non-featured posts.</>,
                                <>Posts with a salary range get <strong>2× the apply clicks</strong> of posts without one.</>,
                                <>Adding <strong>2–3 screening questions</strong> cuts unqualified applicants by ~40%.</>,
                                <>Use <strong>in-platform apply</strong> instead of an external link — applications land directly in your dashboard so nothing slips through.</>,
                                <>Don&apos;t wait for inbound — <strong>browse the Talent Pool</strong> and reach out to candidates who match your role.</>,
                            ].map((tip, i) => (
                                <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                    <span style={{
                                        flexShrink: 0,
                                        width: '20px', height: '20px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'linear-gradient(145deg, #0D9488, #10B981)',
                                        color: '#fff', fontSize: '11px', fontWeight: 700,
                                        boxShadow: '2px 2px 5px rgba(13,148,136,0.18), inset 0 1px 0 rgba(255,255,255,0.2)',
                                        marginTop: '1px',
                                    }}>{i + 1}</span>
                                    <span style={{ fontSize: '12px', color: '#6B7F8A', lineHeight: 1.55 }}>{tip}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>

                {/* ── Talent Pool ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
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

                {/* ── Rate + Share Your Story (combined) ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
                    <img
                        src="/illustrations/employer-story.png"
                        alt="Share your story"
                        style={{ width: '100%', height: '180px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <EmployerFeedbackCard />
                        <div style={{ borderTop: '1px solid #E0EDE6', margin: '14px 0' }} />
                        <EmployerTestimonialCard employerName={employerName} />
                    </div>
                </div>

                {/* ── Support & Help ── */}
                <div style={{ ...cardBase, padding: '0', overflow: 'hidden' }}>
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
                .emp-job-title {
                    display: block !important;
                    max-width: 100% !important;
                    word-break: break-word !important;
                    overflow-wrap: anywhere !important;
                    hyphens: auto;
                }
                .emp-job-title:hover {
                    color: #0D9488 !important;
                }
                /* The default min-width: auto on flex/grid children means
                   the card's intrinsic minimum width equals the longest
                   unbreakable run of content inside it — which for
                   .emp-cta-card was the full subtitle string ("Search
                   qualified PMHNP candidates"), pinning these cards to
                   ~576px and forcing the entire dashboard grid wider than
                   the iPhone XR viewport. min-width: 0 breaks that trap so
                   the cards actually shrink with their parent. Diagnosed
                   2026-05-11 via scripts/diag-dashboard-overflow.ts. */
                .emp-job-card,
                .emp-cta-card {
                    min-width: 0 !important;
                    max-width: 100% !important;
                    box-sizing: border-box;
                    overflow: hidden;
                }
                /* Same fix at the grid-track level: minmax(auto, 1fr) is
                   the default which lets the track expand to its content's
                   min-content. minmax(0, 1fr) forces the track to truly
                   shrink to its container width. */
                .emp-dashboard-grid {
                    grid-template-columns: minmax(0, 1fr) 300px;
                }
                @media (max-width: 900px) {
                    .emp-dashboard-grid {
                        grid-template-columns: minmax(0, 1fr);
                    }
                    .emp-right-panel {
                        display: none !important;
                    }
                }
                .emp-tier-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 6px 6px 14px rgba(0,0,0,0.1), -3px -3px 8px rgba(255,255,255,0.9) !important;
                }
                /* (Older 1fr 300px / 1fr media query removed — replaced by
                   the minmax(0, 1fr) version above which actually shrinks.) */
                /* Tab strip — hide the WebKit scrollbar (the cross-browser
                   scrollbar-width: none is set inline). On md+ restore the
                   tabs filling the row equally; on phones each tab is its
                   natural width and the strip scrolls horizontally. */
                .emp-tab-strip::-webkit-scrollbar { display: none; }
                @media (min-width: 768px) {
                    .emp-tab-btn { flex: 1 !important; }
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
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (selected === 0) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: selected, message, page: 'employer-dashboard' }),
            });
            if (res.ok) {
                setSubmitted(true);
            } else {
                const data = await res.json().catch(() => ({} as { error?: string }));
                setError(data.error || 'Couldn’t submit feedback right now. Please try again.');
            }
        } catch {
            setError('Network error — please try again.');
        }
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
                        onChange={(e) => { setMessage(e.target.value); if (error) setError(null); }}
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
                    {error && (
                        <div style={{
                            fontSize: '11px', color: '#DC2626',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            borderRadius: '8px', padding: '6px 10px', marginBottom: '10px',
                            lineHeight: 1.4,
                        }}>
                            {error}
                        </div>
                    )}
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
const TESTIMONIAL_MIN_CHARS = 10;
const TESTIMONIAL_MAX_CHARS = 500; // matches the textarea maxLength

function EmployerTestimonialCard({ employerName }: { employerName: string }) {
    const [review, setReview] = useState('');
    const [consent, setConsent] = useState(false);
    const [displayAs, setDisplayAs] = useState<'full' | 'initial' | 'anonymous'>('initial');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmed = review.trim();
    const tooShort = trimmed.length > 0 && trimmed.length < TESTIMONIAL_MIN_CHARS;
    const canSubmit = trimmed.length >= TESTIMONIAL_MIN_CHARS && consent && !loading;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/employer/testimonials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: trimmed,
                    consent,
                    displayAs,
                }),
            });
            if (res.ok) {
                setSubmitted(true);
            } else {
                const data = await res.json().catch(() => ({} as { error?: string }));
                setError(data.error || 'Couldn’t share your story right now. Please try again.');
            }
        } catch {
            setError('Network error — please try again.');
        }
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
                onChange={(e) => { setReview(e.target.value); if (error) setError(null); }}
                placeholder="How has PMHNP Hiring helped your recruitment?"
                rows={3}
                maxLength={TESTIMONIAL_MAX_CHARS}
                style={{
                    width: '100%', padding: '10px 12px', fontSize: '13px',
                    borderRadius: '12px',
                    border: `1px solid ${tooShort ? 'rgba(245,158,11,0.5)' : 'rgba(0,0,0,0.06)'}`,
                    background: '#F5F6F8', color: '#1A2E35', resize: 'none',
                    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04)',
                    outline: 'none', fontFamily: 'inherit', marginBottom: '6px',
                }}
            />
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '10px', fontSize: '11px',
            }}>
                <span style={{ color: tooShort ? '#D97706' : '#A0AEB5' }}>
                    {tooShort
                        ? `${TESTIMONIAL_MIN_CHARS - trimmed.length} more character${TESTIMONIAL_MIN_CHARS - trimmed.length === 1 ? '' : 's'} to share`
                        : trimmed.length === 0
                            ? `Minimum ${TESTIMONIAL_MIN_CHARS} characters`
                            : ''}
                </span>
                <span style={{ color: '#A0AEB5' }}>{review.length}/{TESTIMONIAL_MAX_CHARS}</span>
            </div>
            {error && (
                <div style={{
                    fontSize: '11px', color: '#DC2626',
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: '8px', padding: '6px 10px', marginBottom: '10px',
                    lineHeight: 1.4,
                }}>
                    {error}
                </div>
            )}
            <label style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                fontSize: '12px', color: '#4A5E6A', cursor: 'pointer',
                marginBottom: '6px', lineHeight: 1.4,
            }}>
                <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => { setConsent(e.target.checked); if (error) setError(null); }}
                    style={{ marginTop: '2px', accentColor: '#0D9488' }}
                />
                <span>
                    I consent to my review being featured publicly
                    <span style={{ color: '#DC2626', marginLeft: '4px' }}>*</span>
                </span>
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
                disabled={!canSubmit}
                title={
                    !consent
                        ? 'Check the consent box to share your testimonial'
                        : trimmed.length < TESTIMONIAL_MIN_CHARS
                            ? `Add at least ${TESTIMONIAL_MIN_CHARS} characters`
                            : undefined
                }
                style={{
                    alignSelf: 'flex-start',
                    fontSize: '12px', fontWeight: 600, color: '#fff',
                    background: canSubmit ? 'linear-gradient(145deg, #818CF8, #6366F1)' : '#CBD5E1',
                    padding: '8px 18px', borderRadius: '12px', border: 'none',
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    boxShadow: canSubmit
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
