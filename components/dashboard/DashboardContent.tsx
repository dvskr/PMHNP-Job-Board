'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { calculateCompleteness } from '@/lib/profile-completeness'
import useSavedJobs from '@/lib/hooks/useSavedJobs'
import {
    Bookmark, Send, Eye, Bell, ArrowRight, Briefcase, MapPin,
    DollarSign, Loader2, TrendingUp, Clock
} from 'lucide-react'

/* ── Types ── */
interface DashboardJob {
    id: string
    title: string
    slug: string | null
    employer: string
    location: string
    jobType: string | null
    mode: string | null
    displaySalary: string | null
    isRemote?: boolean
}

interface Application {
    id: string
    appliedAt: string
    job: DashboardJob
}

interface DashboardData {
    profile: {
        firstName: string | null
        lastName: string | null
        role: string
        headline: string | null
        bio: string | null
        phone: string | null
        resumeUrl: string | null
        avatarUrl: string | null
        certifications: string | null
        licenseStates: string | null
        specialties: string | null
        yearsExperience: number | null
        preferredWorkMode: string | null
        preferredJobType: string | null
        openToOffers: boolean
        profileVisible: boolean
        newsletterOptIn?: boolean
    }
    stats: {
        savedJobs: number
        applied: number
        profileViews: number
        activeAlerts: number
    }
    applications: Application[]
    savedJobs: DashboardJob[]
    recommendedJobs: DashboardJob[]
}

/* ── Shared styles ── */
const cardBase: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color)',
    borderRadius: '16px',
    padding: '24px',
}

const sectionHeading: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
}

const viewAllLink: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: '#2DD4BF',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
}

/* ── Reusable mini job card ── */
function CompactJobCard({ job, extra }: { job: DashboardJob; extra?: React.ReactNode }) {
    return (
        <Link
            href={job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'var(--bg-primary)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--border-color)',
                textDecoration: 'none',
                transition: 'border-color 0.2s',
            }}
        >
            {/* icon */}
            <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: 'rgba(45,212,191,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Briefcase size={18} style={{ color: '#2DD4BF' }} />
            </div>

            {/* text */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                    fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    margin: 0,
                }}>
                    {job.title}
                </p>
                <p style={{
                    fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px',
                    display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
                    margin: 0,
                }}>
                    <span>{job.employer}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <MapPin size={11} /> {job.location}
                    </span>
                    {job.displaySalary && (
                        <>
                            <span style={{ opacity: 0.4 }}>·</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <DollarSign size={11} /> {job.displaySalary}
                            </span>
                        </>
                    )}
                </p>
            </div>

            {/* extra (e.g. applied date) */}
            {extra}
        </Link>
    )
}

function NewsletterCard({ initialOptIn, email }: { initialOptIn: boolean; email?: string }) {
    const [optIn, setOptIn] = useState(initialOptIn)
    const [loading, setLoading] = useState(false)

    const handleToggle = async () => {
        setLoading(true)
        const newState = !optIn
        setOptIn(newState) // optimistic update

        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    optIn: newState,
                    source: 'dashboard_toggle',
                }),
            })
        } catch {
            setOptIn(!newState) // revert on error
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ ...cardBase, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: 'rgba(20,184,166,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Send size={20} style={{ color: '#14B8A6' }} />
                </div>
                <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        Email Newsletter
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        Get the latest jobs & career tips
                    </p>
                </div>
            </div>

            <button
                onClick={handleToggle}
                disabled={loading}
                style={{
                    position: 'relative',
                    width: '44px', height: '24px',
                    borderRadius: '12px',
                    background: optIn ? '#14B8A6' : 'var(--bg-tertiary)',
                    border: '1px solid',
                    borderColor: optIn ? '#14B8A6' : 'var(--border-color)',
                    cursor: 'pointer', transition: 'all 0.2s',
                }}
            >
                <div style={{
                    position: 'absolute', top: '2px', left: optIn ? '22px' : '2px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#fff',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }} />
            </button>
        </div>
    )
}

/* ══════════════════════════════════════════════════
   DASHBOARD CONTENT — Client Component
   ══════════════════════════════════════════════════ */
export default function DashboardContent() {
    const router = useRouter()
    const { savedJobs: savedJobIds } = useSavedJobs()
    const [data, setData] = useState<DashboardData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [hasFetched, setHasFetched] = useState(false)
    const [userEmail, setUserEmail] = useState<string>('')

    const fetchDashboard = useCallback(async (ids: string[]) => {
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            setUserEmail(user.email || '')

            const qs = ids.length > 0 ? `?savedJobIds=${ids.join(',')}` : ''
            const res = await fetch(`/api/dashboard${qs}`)

            if (res.status === 401) { router.push('/login'); return }
            if (res.status === 403) { router.push('/'); return }
            if (!res.ok) throw new Error('Failed to load dashboard')

            setData(await res.json())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong')
        } finally {
            setLoading(false)
            setHasFetched(true)
        }
    }, [router])

    useEffect(() => {
        if (hasFetched) return
        // Small delay for useSavedJobs to hydrate from localStorage
        const t = setTimeout(() => fetchDashboard(savedJobIds), 150)
        return () => clearTimeout(t)
    }, [savedJobIds, hasFetched, fetchDashboard])

    /* ── Loading ── */
    if (loading) {
        return (
            <div style={{
                maxWidth: '960px', margin: '0 auto', padding: '80px 20px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
            }}>
                <Loader2 size={36} style={{ color: '#2DD4BF', animation: 'spin 1s linear infinite' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading your dashboard…</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        )
    }

    /* ── Error ── */
    if (error || !data) {
        return (
            <div style={{ maxWidth: '960px', margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
                <p style={{ color: '#EF4444', fontSize: '16px', marginBottom: '12px' }}>
                    {error || 'Failed to load dashboard'}
                </p>
                <button
                    onClick={() => { setLoading(true); setError(null); setHasFetched(false) }}
                    style={{
                        padding: '10px 24px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                        color: '#fff', fontWeight: 600, fontSize: '14px',
                        border: 'none', cursor: 'pointer',
                    }}
                >
                    Try Again
                </button>
            </div>
        )
    }

    const { profile, stats, applications, savedJobs, recommendedJobs } = data
    const completeness = calculateCompleteness(profile)

    const statCards = [
        { label: 'Saved Jobs', value: stats.savedJobs, icon: Bookmark, color: '#818CF8', href: '/saved' },
        { label: 'Applied', value: stats.applied, icon: Send, color: '#2DD4BF', href: null },
        { label: 'Profile Views', value: stats.profileViews, icon: Eye, color: '#F59E0B', href: null },
        { label: 'Active Alerts', value: stats.activeAlerts, icon: Bell, color: '#F472B6', href: null },
    ]

    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 16px 80px' }}>

            {/* ═══ Welcome Header ═══ */}
            <div style={{ ...cardBase, marginBottom: '24px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: '16px',
                }}>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                            Welcome back{profile.firstName ? `, ${profile.firstName}` : ''}! 👋
                        </h1>
                        {profile.headline && (
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {profile.headline}
                            </p>
                        )}
                    </div>

                    {/* Compact completeness bar */}
                    <div style={{ minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Profile</span>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: completeness.color }}>
                                {completeness.percentage}%
                            </span>
                        </div>
                        <div style={{
                            width: '100%', height: '6px', borderRadius: '3px',
                            background: 'var(--bg-tertiary)', overflow: 'hidden',
                        }}>
                            <div style={{
                                width: `${completeness.percentage}%`, height: '100%', borderRadius: '3px',
                                background: completeness.color, transition: 'width 0.5s ease',
                            }} />
                        </div>
                        {completeness.percentage < 100 && (
                            <Link href="/settings" style={{
                                fontSize: '11px', color: '#2DD4BF', textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '4px',
                            }}>
                                Complete Profile <ArrowRight size={11} />
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ Stat Cards ═══ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '14px',
                marginBottom: '24px',
            }}>
                {statCards.map((s) => {
                    const Icon = s.icon
                    const inner = (
                        <div style={{
                            ...cardBase,
                            padding: '20px',
                            display: 'flex', flexDirection: 'column', gap: '8px',
                            cursor: s.href ? 'pointer' : 'default',
                            transition: 'border-color 0.2s',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '10px',
                                    background: `${s.color}18`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Icon size={18} style={{ color: s.color }} />
                                </div>
                                <p style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>
                                    {s.value}
                                </p>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                                {s.label}
                            </p>
                        </div>
                    )
                    return s.href
                        ? <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>{inner}</Link>
                        : <div key={s.label}>{inner}</div>
                })}
            </div>

            {/* ═══ Two-column grid ═══ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '20px',
            }}>

                {/* ── Recent Applications ── */}
                <div style={cardBase}>
                    <div style={sectionHeading}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={16} style={{ color: '#2DD4BF' }} /> Recent Applications
                        </span>
                    </div>

                    {applications.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '32px 16px',
                            borderRadius: '12px', background: 'var(--bg-primary)',
                        }}>
                            <Send size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                No applications yet
                            </p>
                            <Link href="/jobs" style={{ ...viewAllLink, fontSize: '14px' }}>
                                Start browsing jobs <ArrowRight size={14} />
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {applications.map((app) => (
                                <CompactJobCard
                                    key={app.id}
                                    job={app.job}
                                    extra={
                                        <span style={{
                                            fontSize: '11px', color: 'var(--text-muted)',
                                            whiteSpace: 'nowrap', flexShrink: 0,
                                        }}>
                                            {new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Saved Jobs ── */}
                <div style={cardBase}>
                    <div style={sectionHeading}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bookmark size={16} style={{ color: '#818CF8' }} /> Saved Jobs
                        </span>
                        {savedJobs.length > 0 && (
                            <Link href="/saved" style={viewAllLink}>View All <ArrowRight size={13} /></Link>
                        )}
                    </div>

                    {savedJobs.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '32px 16px',
                            borderRadius: '12px', background: 'var(--bg-primary)',
                        }}>
                            <Bookmark size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                No saved jobs yet
                            </p>
                            <Link href="/jobs" style={{ ...viewAllLink, fontSize: '14px' }}>
                                Start browsing jobs <ArrowRight size={14} />
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {savedJobs.map((job) => (
                                <CompactJobCard key={job.id} job={job} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ Recommended Jobs ═══ */}
            <div style={{ ...cardBase, marginTop: '20px' }}>
                <div style={sectionHeading}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={16} style={{ color: '#F59E0B' }} /> Recommended for You
                    </span>
                    <Link href="/jobs" style={viewAllLink}>See All Jobs <ArrowRight size={13} /></Link>
                </div>

                {recommendedJobs.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '32px 16px',
                        borderRadius: '12px', background: 'var(--bg-primary)',
                    }}>
                        <Briefcase size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                            No recommendations yet — complete your profile preferences
                        </p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '10px',
                    }}>
                        {recommendedJobs.map((job) => (
                            <CompactJobCard key={job.id} job={job} />
                        ))}
                    </div>
                )}
            </div>

            {/* ═══ Newsletter Toggle ═══ */}
            <div style={{ marginTop: '20px' }}>
                <NewsletterCard initialOptIn={!!profile.newsletterOptIn} email={userEmail} />
            </div>
        </div>
    )
}
