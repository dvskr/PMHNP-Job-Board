'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { calculateCompleteness } from '@/lib/profile-completeness'
import useSavedJobs from '@/lib/hooks/useSavedJobs'
import {
    Bookmark, Send, Eye, Bell, ArrowRight, Briefcase, MapPin,
    DollarSign, Loader2, TrendingUp, Clock, AlertTriangle,
    Search, FileText, Settings, BellRing, CheckCircle, ExternalLink, BookOpen,
    HelpCircle, Star, MessageSquare
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
    isPublished?: boolean
    createdAt?: string
    isFeatured?: boolean
    isVerifiedEmployer?: boolean
    companyLogoUrl?: string | null
    applyLink?: string | null
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
    unreadMessages: number
}

/* ── Shared styles — Clay Design ── */
const cardBase: React.CSSProperties = {
    background: '#F7FBF8',
    border: '1px solid rgba(213, 232, 224, 0.5)',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '6px 6px 14px rgba(0, 60, 50, 0.06), -2px -2px 8px rgba(255, 255, 255, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
}

const cardRecessed: React.CSSProperties = {
    borderRadius: '14px',
    background: '#EDF5F0',
    border: '1px solid #D5E8E0',
    boxShadow: 'inset 2px 2px 5px rgba(0, 40, 30, 0.05), inset -1px -1px 3px rgba(255, 255, 255, 0.7)',
}

const sectionHeading: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: 'var(--font-lora), Georgia, serif',
    color: '#1A2E35',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
}

const viewAllLink: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: '#0D9488',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
}

/* ── Reusable mini job card ── */
function CompactJobCard({ job, extra }: { job: DashboardJob; extra?: React.ReactNode }) {
    const isUnavailable = job.isPublished === false

    const cardStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        borderRadius: '12px',
        background: '#F5F9F6',
        border: '1px solid #E8F0EB',
        textDecoration: 'none',
        transition: 'none',
        opacity: isUnavailable ? 0.6 : 1,
        cursor: isUnavailable ? 'default' : 'pointer',
    }

    const inner = (
        <>
            {/* icon */}
            <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'rgba(13,148,136,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Briefcase size={18} style={{ color: '#0D9488' }} />
            </div>

            {/* text */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                    fontSize: '14px', fontWeight: 600, color: '#1A2E35',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    margin: 0,
                }}>
                    {job.title}
                </p>
                <p style={{
                    fontSize: '12px', color: '#6B7F8A', marginTop: '2px',
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

            {/* extra (e.g. applied date) or unavailable badge */}
            {isUnavailable ? (
                <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '3px 8px',
                    borderRadius: '6px', whiteSpace: 'nowrap', flexShrink: 0,
                    backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444',
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                }}>
                    <AlertTriangle size={10} /> Expired
                </span>
            ) : extra}
        </>
    )

    if (isUnavailable) {
        return <div style={cardStyle}>{inner}</div>
    }

    return (
        <Link href={job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`} style={cardStyle}>
            {inner}
        </Link>
    )
}

/* ── Interactive Rating Card — stars + optional message ── */
function FeedbackRatingCard() {
    const [hovered, setHovered] = useState(0)
    const [selected, setSelected] = useState(0)
    const [message, setMessage] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async () => {
        if (selected === 0) return
        setLoading(true)
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: selected, message, page: 'dashboard' }),
            })
            setSubmitted(true)
        } catch { /* silent */ }
        setLoading(false)
    }

    if (submitted) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                textAlign: 'center',
            }}>
                <div style={{
                    fontSize: '32px', marginBottom: '8px',
                    animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}>🎉</div>
                <h3 style={{
                    fontSize: '15px', fontWeight: 700,
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    color: '#0D9488', margin: '0 0 4px',
                }}>Thank You!</h3>
                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0 }}>
                    Your feedback helps us build a better experience for all PMHNPs.
                </p>
            </div>
        )
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
        }}>
            <h3 style={{
                fontSize: '15px', fontWeight: 700,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', margin: '0 0 4px',
            }}>
                Rate Your Experience
            </h3>
            <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 14px', lineHeight: 1.4 }}>
                How would you rate PMHNP Hiring so far?
            </p>

            {/* Stars */}
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

            {/* Optional message */}
            {selected > 0 && (
                <>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tell us more (optional)..."
                        rows={2}
                        style={{
                            width: '100%', padding: '10px 12px', fontSize: '13px',
                            borderRadius: '10px', border: '1px solid #D5E8E0',
                            background: '#EDF5F0', color: '#1A2E35', resize: 'none',
                            boxShadow: 'inset 2px 2px 4px rgba(0,40,30,0.04)',
                            outline: 'none', fontFamily: 'inherit',
                            marginBottom: '10px',
                        }}
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="jc-apply-btn"
                        style={{
                            alignSelf: 'flex-start',
                            fontSize: '12px', fontWeight: 600, color: '#fff',
                            background: 'linear-gradient(145deg, #0D9488, #10B981)',
                            padding: '8px 18px', borderRadius: '10px', border: 'none',
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
    )
}

/* ── Testimonial Collection Card — written review + consent ── */
function TestimonialCard({ firstName }: { firstName: string | null }) {
    const [review, setReview] = useState('')
    const [consent, setConsent] = useState(false)
    const [displayAs, setDisplayAs] = useState<'full' | 'initial' | 'anonymous'>('initial')
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async () => {
        if (!review.trim()) return
        setLoading(true)
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: 5,
                    message: `[TESTIMONIAL] ${review} | consent=${consent} | display=${displayAs}`,
                    page: 'dashboard-testimonial',
                }),
            })
            setSubmitted(true)
        } catch { /* silent */ }
        setLoading(false)
    }

    if (submitted) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                textAlign: 'center',
            }}>
                <div style={{
                    fontSize: '32px', marginBottom: '8px',
                    animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}>💜</div>
                <h3 style={{
                    fontSize: '15px', fontWeight: 700,
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    color: '#818CF8', margin: '0 0 4px',
                }}>Story Shared!</h3>
                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0 }}>
                    We may feature your experience on our website to inspire others.
                </p>
            </div>
        )
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
        }}>
            <h3 style={{
                fontSize: '15px', fontWeight: 700,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', margin: '0 0 4px',
            }}>
                Share Your Story
            </h3>
            <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 12px', lineHeight: 1.4 }}>
                {firstName ? `${firstName}, your` : 'Your'} experience matters! Help other PMHNPs discover opportunities.
            </p>

            <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="What has your experience been like using PMHNP Hiring?"
                rows={3}
                maxLength={500}
                style={{
                    width: '100%', padding: '10px 12px', fontSize: '13px',
                    borderRadius: '10px', border: '1px solid #D5E8E0',
                    background: '#EDF5F0', color: '#1A2E35', resize: 'none',
                    boxShadow: 'inset 2px 2px 4px rgba(0,40,30,0.04)',
                    outline: 'none', fontFamily: 'inherit',
                    marginBottom: '8px',
                }}
            />
            <span style={{ fontSize: '11px', color: '#A0AEB5', marginBottom: '10px', textAlign: 'right' }}>
                {review.length}/500
            </span>

            {/* Consent + Display Preference */}
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
                I consent to my review being featured publicly on the website
            </label>

            {consent && (
                <div style={{
                    display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap',
                }}>
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
                                background: displayAs === opt.key ? '#D5F5F1' : '#EDF5F0',
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
                className="jc-apply-btn"
                style={{
                    alignSelf: 'flex-start',
                    fontSize: '12px', fontWeight: 600, color: '#fff',
                    background: review.trim() ? 'linear-gradient(145deg, #818CF8, #6366F1)' : '#CBD5E1',
                    padding: '8px 18px', borderRadius: '10px', border: 'none',
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
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: 'rgba(13,148,136,0.10)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'inset 1px 1px 3px rgba(0, 40, 30, 0.06)',
                }}>
                    <Send size={20} style={{ color: '#0D9488' }} />
                </div>
                <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', margin: 0, color: '#1A2E35' }}>
                        Email Newsletter
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6B7F8A', margin: '2px 0 0' }}>
                        Get the latest jobs & career tips
                    </p>
                </div>
            </div>

            <button
                onClick={handleToggle}
                disabled={loading}
                style={{
                    position: 'relative',
                    width: '48px', height: '26px',
                    borderRadius: '13px',
                    background: optIn ? '#0D9488' : '#E0EDE6',
                    border: '1px solid',
                    borderColor: optIn ? '#0D9488' : '#C5DDD5',
                    cursor: 'pointer', transition: 'all 0.25s ease',
                    boxShadow: optIn
                        ? '0 2px 6px rgba(13,148,136,0.3)'
                        : 'inset 2px 2px 4px rgba(0, 40, 30, 0.06), inset -1px -1px 3px rgba(255, 255, 255, 0.7)',
                }}
            >
                <div style={{
                    position: 'absolute', top: '3px', left: optIn ? '24px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#fff',
                    transition: 'all 0.25s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
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
    const { savedJobs: savedJobIds, isSaved, saveJob, removeJob } = useSavedJobs()
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
                <Loader2 size={36} style={{ color: '#0D9488', animation: 'spin 1s linear infinite' }} />
                <p style={{ color: '#6B7F8A', fontSize: '14px' }}>Loading your dashboard…</p>
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
                        padding: '12px 28px', borderRadius: '14px',
                        background: 'linear-gradient(145deg, #10B981, #0D9488)',
                        color: '#fff', fontWeight: 600, fontSize: '14px',
                        border: 'none', cursor: 'pointer',
                        boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 1px rgba(255,255,255,0.2)',
                    }}
                >
                    Try Again
                </button>
            </div>
        )
    }

    const { profile, stats, applications, savedJobs, recommendedJobs, unreadMessages } = data
    const completeness = calculateCompleteness(profile)

    const statCards = [
        { label: 'jobs saved', value: stats.savedJobs, icon: Bookmark, color: '#818CF8', href: '/saved', illustration: '/illustrations/clay-stat-saved.png' },
        { label: 'applications sent', value: stats.applied, icon: Send, color: '#0D9488', href: null, illustration: '/illustrations/clay-stat-applied.png' },
        { label: 'profile views', value: stats.profileViews, icon: Eye, color: '#F59E0B', href: null, illustration: '/illustrations/clay-stat-views.png' },
        { label: 'active alert', value: stats.activeAlerts, icon: Bell, color: '#E879A8', href: '/job-alerts/manage', illustration: '/illustrations/clay-stat-alerts.png' },
    ]

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 16px 80px' }}>
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: '24px',
            alignItems: 'start',
        }} className="dashboard-grid">

        {/* ═══ LEFT: Main Content ═══ */}
        <div>

            {/* ═══ Styled Greeting ═══ */}
            <div style={{ marginBottom: '28px' }}>
                <p style={{
                    fontSize: '15px', color: '#0D9488', margin: '0 0 6px',
                    fontWeight: 600, letterSpacing: '0.02em',
                    display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                    <span style={{ fontSize: '20px' }}>👋</span>
                    {new Date().getHours() < 12 ? 'Good morning,' : new Date().getHours() < 17 ? 'Good afternoon,' : 'Good evening,'}
                </p>
                <h1 style={{
                    fontSize: '36px', fontWeight: 800,
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    color: '#1A2E35',
                    margin: '0 0 8px',
                    letterSpacing: '-0.01em',
                }}>
                    {profile.firstName || 'there'}
                </h1>
                <p style={{
                    fontSize: '15px', color: '#8A9BA6', margin: 0,
                    lineHeight: 1.5,
                }}>
                    Here&apos;s what&apos;s happening with your job search.
                </p>
            </div>

            {/* ═══ Profile Attention Card ═══ */}
            {completeness.percentage < 100 && (
                <div style={{ ...cardBase, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    {/* Circular Progress */}
                    <div style={{ position: 'relative', width: '64px', height: '64px', flexShrink: 0 }}>
                        <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx="32" cy="32" r="28" fill="none" stroke="#E0EDE6" strokeWidth="5" />
                            <circle cx="32" cy="32" r="28" fill="none" stroke={completeness.color} strokeWidth="5"
                                strokeDasharray={`${(completeness.percentage / 100) * 175.9} 175.9`}
                                strokeLinecap="round" />
                        </svg>
                        <span style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35',
                        }}>
                            {completeness.percentage}%
                        </span>
                        {/* notification dot removed */}
                    </div>

                    {/* Text + chips */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                            Your profile needs attention
                        </h3>
                        <p style={{ fontSize: '13px', color: '#6B7F8A', margin: '0 0 10px' }}>
                            Employers are 5x more likely to reach out to profiles that are 80%+ complete.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {completeness.missingItems.slice(0, 4).map((item) => (
                                <span key={item.label} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    fontSize: '12px', color: '#6B7F8A',
                                    padding: '4px 10px', borderRadius: '20px',
                                    background: '#EDF5F0',
                                    border: '1px solid #D5E8E0',
                                    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.6)',
                                }}>
                                    {item.label} <span style={{ color: '#0D9488', fontWeight: 600 }}>+{item.weight}%</span>
                                </span>
                            ))}
                            {completeness.missingItems.length > 4 && (
                                <span style={{ fontSize: '12px', color: '#6B7F8A', padding: '4px 0', alignSelf: 'center' }}>
                                    +{completeness.missingItems.length - 4} more
                                </span>
                            )}
                        </div>
                    </div>

                    {/* CTA Button */}
                    <Link href="/settings" className="clay-cta-btn" style={{
                        padding: '12px 24px', borderRadius: '14px',
                        background: '#1A2E35', color: '#fff',
                        fontSize: '14px', fontWeight: 700,
                        textDecoration: 'none',
                        boxShadow: '4px 4px 10px rgba(26,46,53,0.2), -2px -2px 6px rgba(255,255,255,0.3), inset 1px 1px 2px rgba(255,255,255,0.1)',
                        whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                        Complete Profile
                    </Link>
                </div>
            )}

            {/* ═══ Quick Actions ═══ */}
            <div style={{
                display: 'flex', gap: '10px', marginBottom: '20px',
                flexWrap: 'wrap',
            }}>
                {[
                    { icon: Search, label: 'Browse Jobs', href: '/jobs' },
                    { icon: FileText, label: 'Upload Resume', href: '/settings' },
                    { icon: Settings, label: 'Preferences', href: '/settings?tab=screening' },
                    { icon: BellRing, label: 'Manage Alerts', href: '/job-alerts/manage' },
                ].map((action) => {
                    const ActionIcon = action.icon
                    return (
                        <Link key={action.label} href={action.href} className="clay-action-pill" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '10px 16px', borderRadius: '14px',
                            background: '#F7FBF8', border: '1px solid rgba(213, 232, 224, 0.6)',
                            boxShadow: '3px 3px 8px rgba(0, 60, 50, 0.05), -1px -1px 4px rgba(255, 255, 255, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                            fontSize: '13px', fontWeight: 600, color: '#2A4A5A',
                            textDecoration: 'none', transition: 'all 0.2s',
                            whiteSpace: 'nowrap',
                        }}>
                            <ActionIcon size={15} style={{ color: '#0D9488' }} />
                            {action.label}
                        </Link>
                    )
                })}
            </div>

            {/* ═══ Stat Cards ═══ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '14px',
                marginBottom: '24px',
            }}>
                {statCards.map((s) => {
                    const inner = (
                        <div className="clay-stat-card" style={{
                            ...cardBase,
                            padding: '20px',
                            display: 'flex', alignItems: 'center', gap: '16px',
                            cursor: s.href ? 'pointer' : 'default',
                            minHeight: '100px',
                        }}>
                            {/* Vector illustration */}
                            <img
                                src={s.illustration}
                                alt=""
                                style={{
                                    width: '64px', height: '64px',
                                    objectFit: 'contain',
                                    flexShrink: 0,
                                    borderRadius: '14px',
                                }}
                            />
                            {/* Number + label */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 2px', lineHeight: 1 }}>
                                    {s.value}
                                </p>
                                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0, fontWeight: 500 }}>
                                    {s.label}
                                </p>
                            </div>
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
                <div className="clay-section-card" style={cardBase}>
                    <div style={sectionHeading}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={16} style={{ color: '#0D9488' }} /> Recent Applications
                        </span>
                    </div>

                    {applications.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '32px 16px',
                            ...cardRecessed,
                        }}>
                            <img src="/illustrations/empty-applications.png" alt="" style={{ width: '80px', height: '80px', margin: '0 auto 12px', objectFit: 'contain', opacity: 0.85 }} />
                            <p style={{ fontSize: '14px', fontWeight: 600, color: '#4A5E6A', marginBottom: '4px' }}>
                                No applications yet
                            </p>
                            <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '12px' }}>
                                Applied jobs will appear here
                            </p>
                            <Link href="/jobs" style={{ ...viewAllLink, fontSize: '14px' }}>
                                Start browsing jobs <ArrowRight size={14} />
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {applications.map((app) => {
                                // Derive status from time since application
                                const daysSince = Math.floor((Date.now() - new Date(app.appliedAt).getTime()) / (1000 * 60 * 60 * 24))
                                const status = daysSince <= 1 ? { label: 'Submitted', color: '#0D9488', bg: '#B2F5EA' }
                                    : daysSince <= 5 ? { label: 'Under Review', color: '#D97706', bg: '#FEF3C7' }
                                    : { label: 'In Progress', color: '#818CF8', bg: '#EDE9FE' }
                                return (
                                <CompactJobCard
                                    key={app.id}
                                    job={app.job}
                                    extra={
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                            <span style={{
                                                fontSize: '10px', fontWeight: 600, padding: '3px 8px',
                                                borderRadius: '6px', whiteSpace: 'nowrap',
                                                backgroundColor: status.bg, color: status.color,
                                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                            }}>
                                                <CheckCircle size={9} /> {status.label}
                                            </span>
                                            <span style={{
                                                fontSize: '11px', color: '#6B7F8A',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    }
                                />
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Saved Jobs ── */}
                <div className="clay-section-card" style={cardBase}>
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
                            ...cardRecessed,
                        }}>
                            <img src="/illustrations/empty-saved.png" alt="" style={{ width: '80px', height: '80px', margin: '0 auto 12px', objectFit: 'contain', opacity: 0.85 }} />
                            <p style={{ fontSize: '14px', fontWeight: 600, color: '#4A5E6A', marginBottom: '4px' }}>
                                No saved jobs
                            </p>
                            <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '12px' }}>
                                Bookmark jobs below to save them
                            </p>
                            <Link href="/jobs" style={{ ...viewAllLink, fontSize: '14px' }}>
                                Browse jobs <ArrowRight size={14} />
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
            <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                            Recommended for you
                        </h2>
                        <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0 }}>
                            Based on your profile and preferences
                        </p>
                    </div>
                    <Link href="/jobs" style={viewAllLink}>
                        See All Jobs <ArrowRight size={13} />
                    </Link>
                </div>

                {recommendedJobs.length === 0 ? (
                    <div style={{ ...cardBase, textAlign: 'center', padding: '48px 24px' }}>
                        <Briefcase size={32} style={{ color: '#A8C5B8', margin: '0 auto 12px' }} />
                        <p style={{ fontSize: '14px', color: '#6B7F8A' }}>
                            No recommendations yet — complete your profile preferences
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {recommendedJobs.map((job) => {
                            const jobIsSaved = isSaved(job.id)
                            const postedLabel = job.createdAt
                                ? (() => {
                                    const days = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86400000)
                                    if (days === 0) return 'Today'
                                    if (days === 1) return '1 day ago'
                                    if (days < 7) return `${days} days ago`
                                    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`
                                    return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`
                                })()
                                : null
                            const shortLocation = (() => {
                                if (!job.location) return 'Remote'
                                const first = job.location.split(';')[0].split(',').slice(0, 2).join(',').trim()
                                return first.length > 35 ? first.slice(0, 33) + '…' : first
                            })()

                            return (
                                <div key={job.id} className="clay-rec-card" style={{
                                    ...cardBase,
                                    padding: '20px 24px',
                                    display: 'flex', alignItems: 'flex-start', gap: '16px',
                                    border: job.isFeatured ? '2px solid #0D9488' : cardBase.border,
                                }}>
                                    {/* Company logo / initials */}
                                    <div style={{ flexShrink: 0 }}>
                                        {job.companyLogoUrl ? (
                                            <img
                                                src={job.companyLogoUrl}
                                                alt={`${job.employer} logo`}
                                                style={{
                                                    width: '48px', height: '48px', borderRadius: '12px',
                                                    objectFit: 'contain', border: '1px solid #D5E8E0',
                                                    background: '#fff',
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: '48px', height: '48px', borderRadius: '12px',
                                                background: `hsl(${(job.employer || '').charCodeAt(0) * 7 % 360}, 40%, 50%)`,
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '18px', fontWeight: 700,
                                            }}>
                                                {(job.employer || '?')[0].toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Middle: all job info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Title */}
                                        <Link href={`/jobs/${job.slug || job.id}`} style={{
                                            fontSize: '17px', fontWeight: 700,
                                            fontFamily: 'var(--font-lora), Georgia, serif',
                                            color: '#1A2E35', textDecoration: 'none',
                                            display: 'block', marginBottom: '3px',
                                            lineHeight: 1.3,
                                        }}>
                                            {job.title}
                                        </Link>

                                        {/* Employer */}
                                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#6B7F8A', margin: '0 0 8px' }}>
                                            {job.employer}
                                        </p>

                                        {/* Salary + Location + Type + Mode pills */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                            {job.displaySalary && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '4px 12px', borderRadius: '20px',
                                                    fontSize: '12px', fontWeight: 700,
                                                    background: '#A7F3D0', color: '#065F46',
                                                    border: '1px solid rgba(255,255,255,0.5)',
                                                    boxShadow: '3px 3px 8px rgba(16,185,129,0.10), -1px -1px 4px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                                                }}>
                                                    {job.displaySalary.startsWith('$') ? job.displaySalary : `$${job.displaySalary}`}
                                                </span>
                                            )}
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '4px 10px', borderRadius: '20px',
                                                fontSize: '12px', fontWeight: 500, color: '#4A5E6A',
                                                background: '#EDF2EE', border: '1px solid rgba(255,255,255,0.5)',
                                            }}>
                                                <MapPin size={12} style={{ color: '#0D9488' }} /> {shortLocation}
                                            </span>
                                            {job.jobType && (
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: '20px',
                                                    fontSize: '12px', fontWeight: 500, color: '#4A5E6A',
                                                    background: '#EDF2EE', border: '1px solid rgba(255,255,255,0.5)',
                                                }}>{job.jobType}</span>
                                            )}
                                            {job.mode && (
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: '20px',
                                                    fontSize: '12px', fontWeight: 500, color: '#4A5E6A',
                                                    background: '#EDF2EE', border: '1px solid rgba(255,255,255,0.5)',
                                                }}>{job.mode}</span>
                                            )}
                                        </div>

                                        {/* Status badges: Featured, Verified, Remote */}
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {job.isFeatured && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '4px 12px', borderRadius: '20px',
                                                    fontSize: '12px', fontWeight: 700,
                                                    background: '#FDE68A', color: '#78350F',
                                                    border: '1px solid rgba(255,255,255,0.5)',
                                                    boxShadow: '3px 3px 8px rgba(245,158,11,0.12), -1px -1px 4px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                                                }}>⚡ Featured</span>
                                            )}
                                            {job.isVerifiedEmployer && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '4px 12px', borderRadius: '20px',
                                                    fontSize: '12px', fontWeight: 600,
                                                    background: '#B2F5EA', color: '#0F766E',
                                                    border: '1px solid rgba(255,255,255,0.5)',
                                                    boxShadow: '3px 3px 8px rgba(13,148,136,0.10), -1px -1px 4px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                                                }}><CheckCircle size={12} /> Verified</span>
                                            )}
                                            {job.isRemote && (
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: '20px',
                                                    fontSize: '12px', fontWeight: 500, color: '#0D7368',
                                                    background: '#D5F5F1', border: '1px solid #A7E8E0',
                                                }}>Remote</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: actions + posted */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {/* Save */}
                                            <button
                                                onClick={() => jobIsSaved ? removeJob(job.id) : saveJob(job.id)}
                                                className="jc-save-btn"
                                                style={{
                                                    padding: '8px 14px', borderRadius: '14px',
                                                    fontSize: '13px', fontWeight: 600,
                                                    color: jobIsSaved ? '#0F766E' : '#374151',
                                                    backgroundColor: jobIsSaved ? '#B2F5EA' : '#EDF2EE',
                                                    border: '1px solid rgba(255,255,255,0.5)',
                                                    boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7)',
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {jobIsSaved ? 'Saved' : 'Save'}
                                            </button>

                                            {/* View Job */}
                                            <Link href={`/jobs/${job.slug || job.id}`} className="jc-view-btn" style={{
                                                padding: '8px 14px', borderRadius: '14px',
                                                fontSize: '13px', fontWeight: 600,
                                                color: '#374151',
                                                backgroundColor: '#EDF2EE',
                                                border: '1px solid rgba(255,255,255,0.5)',
                                                boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7)',
                                                textDecoration: 'none',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                View Job →
                                            </Link>

                                            {/* Apply */}
                                            {job.applyLink && (
                                                <a
                                                    href={job.applyLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="jc-apply-btn"
                                                    style={{
                                                        padding: '8px 16px', borderRadius: '14px',
                                                        fontSize: '13px', fontWeight: 700,
                                                        color: '#fff', backgroundColor: '#0D9488',
                                                        border: '1px solid rgba(255,255,255,0.3)',
                                                        boxShadow: '4px 4px 10px rgba(13,148,136,0.20), -2px -2px 6px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.2)',
                                                        textDecoration: 'none',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    Apply
                                                </a>
                                            )}
                                        </div>
                                        {postedLabel && (
                                            <p style={{ fontSize: '12px', color: '#8A9BA6', margin: 0 }}>
                                                Posted {postedLabel}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ═══ Newsletter Toggle ═══ */}
            <div style={{ marginTop: '20px' }}>
                <NewsletterCard initialOptIn={!!profile.newsletterOptIn} email={userEmail} />
            </div>



            {/* ═══ Unread Messages Banner ═══ */}
            {unreadMessages > 0 && (
                <Link href="/messages" style={{
                    ...cardBase,
                    display: 'flex', alignItems: 'center', gap: '14px',
                    marginTop: '20px',
                    background: 'linear-gradient(145deg, #F0FDFA, #E6FAF8)',
                    border: '1px solid rgba(13,148,136,0.15)',
                    textDecoration: 'none',
                    cursor: 'pointer',
                }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '14px',
                        background: 'linear-gradient(145deg, #0D9488, #10B981)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.2)',
                        flexShrink: 0,
                    }}>
                        <Bell size={20} style={{ color: '#fff' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', margin: '0 0 2px' }}>
                            You have {unreadMessages} unread message{unreadMessages > 1 ? 's' : ''}
                        </p>
                        <p style={{ fontSize: '12px', color: '#6B7F8A', margin: 0 }}>
                            From employers interested in your profile
                        </p>
                    </div>
                    <ArrowRight size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                </Link>
            )}

            {/* ═══ END LEFT COLUMN ═══ */}
            </div>

            {/* ═══ RIGHT: Feedback & Support Panel ═══ */}
            <aside style={{ position: 'sticky', top: '100px', display: 'flex', flexDirection: 'column', gap: '16px' }} className="dashboard-right-panel">


                {/* ── Star Rating ── */}
                <div style={{
                    ...cardBase,
                    padding: '0',
                    overflow: 'hidden',
                }}>
                    <img
                        src="/illustrations/vector-feedback-v4.png"
                        alt="Share your feedback"
                        style={{ width: '100%', height: '200px', objectFit: 'cover', objectPosition: 'top', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <FeedbackRatingCard />
                    </div>
                </div>

                {/* ── Share Your Story ── */}
                <div style={{
                    ...cardBase,
                    padding: '0',
                    overflow: 'hidden',
                }}>
                    <img
                        src="/illustrations/vector-share-story-v3.png"
                        alt="Share your story"
                        style={{ width: '100%', height: '200px', objectFit: 'cover', objectPosition: 'top', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <TestimonialCard firstName={profile.firstName} />
                    </div>
                </div>

                {/* ── Support & Help ── */}
                <div style={{
                    ...cardBase,
                    padding: '0',
                    overflow: 'hidden',
                }}>
                    <img
                        src="/illustrations/vector-support-v3.png"
                        alt="Get support"
                        style={{ width: '100%', height: '200px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px', textAlign: 'center' }}>
                        <h3 style={{
                            fontSize: '15px', fontWeight: 700,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35', margin: '0 0 6px',
                        }}>
                            Need Help?
                        </h3>
                        <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 12px', lineHeight: 1.4 }}>
                            We typically respond within 24 hours.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <Link href="/contact" className="jc-view-btn" style={{
                                fontSize: '12px', fontWeight: 600, color: '#fff',
                                background: 'linear-gradient(145deg, #0D9488, #10B981)',
                                padding: '7px 14px', borderRadius: '10px',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                            }}>
                                <MessageSquare size={12} /> Contact
                            </Link>
                            <Link href="/faq" className="jc-view-btn" style={{
                                fontSize: '12px', fontWeight: 600, color: '#0D9488',
                                background: '#E6FAF8',
                                padding: '7px 14px', borderRadius: '10px',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                border: '1px solid rgba(13,148,136,0.15)',
                            }}>
                                <HelpCircle size={12} /> FAQs
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ── Job Market Pulse ── */}
                <div style={{
                    ...cardBase,
                    padding: '0',
                    overflow: 'hidden',
                }}>
                    <img
                        src="/illustrations/vector-career-pulse-v3.png"
                        alt="Job market trends"
                        style={{ width: '100%', height: '200px', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 6px' }}>Job Market Pulse</h3>
                        <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 8px', lineHeight: 1.5 }}>
                            PMHNP roles grew <span style={{ color: '#0D9488', fontWeight: 600 }}>18%</span> this quarter. Telehealth surging.
                        </p>
                        <Link href="/salary-guide" className="jc-view-btn" style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            Salary Guide <ArrowRight size={11} />
                        </Link>
                    </div>
                </div>

                {/* ── Career Resources ── */}
                <div style={{
                    ...cardBase,
                    padding: '0',
                    overflow: 'hidden',
                }}>
                    <img
                        src="/illustrations/vector-resources-v3.png"
                        alt="Career resources"
                        style={{ width: '100%', height: '200px', objectFit: 'cover', objectPosition: 'top', display: 'block', borderRadius: '20px 20px 0 0' }}
                    />
                    <div style={{ padding: '16px 18px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 6px' }}>Career Resources</h3>
                        <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 8px', lineHeight: 1.5 }}>
                            50-state licensure guides, interview prep, career growth.
                        </p>
                        <Link href="/resources" className="jc-view-btn" style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            Explore <ArrowRight size={11} />
                        </Link>
                    </div>
                </div>

            </aside>

            {/* ═══ END GRID ═══ */}
            </div>

            {/* ═══ Global hover/press feedback for ALL dashboard interactives ═══ */}
            <style>{`
                /* Quick action pills */
                .clay-action-pill:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 4px 4px 12px rgba(13,148,136,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 0 1px 0 rgba(255,255,255,0.5) !important;
                    color: #0D9488 !important;
                    border-color: rgba(13,148,136,0.2) !important;
                }
                .clay-action-pill:active {
                    transform: translateY(0) scale(0.97) !important;
                    box-shadow: 2px 2px 6px rgba(0,60,50,0.08), inset 1px 1px 3px rgba(0,0,0,0.04) !important;
                }

                /* Stat cards - static, no hover */

                /* Quick Apply buttons */
                .jc-apply-btn {
                    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease !important;
                }
                .jc-apply-btn:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 6px 6px 16px rgba(13,148,136,0.30), -3px -3px 8px rgba(255,255,255,0.4), inset 1px 1px 2px rgba(255,255,255,0.2) !important;
                }
                .jc-apply-btn:active {
                    transform: translateY(0) scale(0.95) !important;
                }

                /* Save buttons */
                .jc-save-btn {
                    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
                }
                .jc-save-btn:hover {
                    transform: translateY(-1px) !important;
                    box-shadow: 3px 3px 8px rgba(0,0,0,0.08), inset 1px 1px 2px rgba(255,255,255,0.7) !important;
                }

                /* View Job buttons */
                .jc-view-btn {
                    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
                }
                .jc-view-btn:hover {
                    transform: translateY(-1px) !important;
                    box-shadow: 6px 6px 14px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7) !important;
                }
                .jc-view-btn:active {
                    transform: translateY(0) scale(0.95) !important;
                }

                /* Recommended job cards - NO hover lift per design constraint */
                .clay-rec-card {
                    transition: none !important;
                }

                /* View All / See All links */
                a[style*="color: rgb(13, 148, 136)"][style*="text-decoration: none"]:hover {
                    opacity: 0.8;
                }

                /* Feedback submission celebration pop */
                @keyframes popIn {
                    0% { transform: scale(0); opacity: 0; }
                    60% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); }
                }

                /* Responsive: stack on mobile/tablet */
                @media (max-width: 900px) {
                    .dashboard-grid {
                        grid-template-columns: 1fr !important;
                    }
                    .dashboard-right-panel {
                        position: static !important;
                        display: grid !important;
                        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)) !important;
                    }
                }
            `}</style>
        </div>
    )
}


