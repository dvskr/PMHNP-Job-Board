'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calculateCompleteness, ProfileData } from '@/lib/profile-completeness'

export default function ProfileNudgeBanner() {
    const [visible, setVisible] = useState(false)

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
                const { percentage } = calculateCompleteness(profile as ProfileData)
                if (percentage < 100) setVisible(true)
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
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60,
            background: 'linear-gradient(90deg, #F97316, #FB923C)',
            color: '#fff',
            padding: '10px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', fontWeight: 600,
            gap: '12px',
        }}>
            <Link
                href="/settings"
                style={{
                    color: '#fff', textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                }}
            >
                Complete your profile so employers can find you →
            </Link>
            <button
                onClick={dismiss}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.8)', padding: '4px',
                    display: 'flex', alignItems: 'center',
                }}
                aria-label="Dismiss"
            >
                <X size={16} />
            </button>
        </div>
    )
}
