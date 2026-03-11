'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calculateCompleteness, ProfileData } from '@/lib/profile-completeness'

export default function ProfileNudgeBanner() {
    const [visible, setVisible] = useState(false)
    const [percentage, setPercentage] = useState(0)

    useEffect(() => {
        // Don't show if already dismissed
        if (localStorage.getItem('profileNudgeDismissed') === 'true') return

        const checkProfile = async () => {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const res = await fetch('/api/auth/profile')
                if (!res.ok) return
                const profile = await res.json()

                // Only show for job seekers with incomplete profiles
                if (profile.role !== 'job_seeker') return
                const result = calculateCompleteness(profile as ProfileData)
                if (result.percentage < 100) {
                    setPercentage(result.percentage)
                    setVisible(true)
                }
            } catch {
                // Silently fail — banner is non-critical
            }
        }

        checkProfile()
    }, [])

    const dismiss = () => {
        setVisible(false)
        localStorage.setItem('profileNudgeDismissed', 'true')
    }

    if (!visible) return null

    return (
        <div style={{
            maxWidth: '1360px', margin: '0 auto', padding: '0 16px',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '16px', padding: '12px 20px', borderRadius: '12px',
                marginTop: '8px',
                background: 'linear-gradient(135deg, rgba(249,115,22,0.1), rgba(251,146,60,0.05))',
                border: '1px solid rgba(249,115,22,0.2)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <User size={16} style={{ color: '#F97316' }} />
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Your profile is <strong style={{ color: '#F97316' }}>{percentage}% complete</strong> —{' '}
                        <Link href="/settings" style={{ color: '#F97316', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                            complete it now
                        </Link>{' '}
                        so employers can find you.
                    </p>
                </div>
                <button
                    onClick={dismiss}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
                        color: 'var(--text-tertiary)', borderRadius: '6px', display: 'flex', flexShrink: 0,
                    }}
                    aria-label="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    )
}

