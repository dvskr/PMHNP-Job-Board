"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Search } from 'lucide-react'
import UserMenu from './UserMenu'
import { User } from '@supabase/supabase-js'
import { calculateCompleteness, ProfileData } from '@/lib/profile-completeness'

interface UserProfile {
  email: string
  role: string
  firstName?: string | null
  lastName?: string | null
  avatarUrl?: string | null
}

interface HeaderAuthProps {
  onNavigate?: () => void;
  onRoleChange?: (role: string | null) => void;
}

/* ── Clay button styles ── */
const clayNavPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 18px',
  height: '38px',
  borderRadius: '14px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#374151',
  backgroundColor: '#EDF2EE',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
  textDecoration: 'none',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
}

const clayPrimaryPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 20px',
  height: '40px',
  borderRadius: '14px',
  fontSize: '15px',
  fontWeight: 600,
  // A11y: white on #0D9488 is 3.74:1, under the 4.5:1 WCAG AA floor for this
  // 15px label. #0F766E is 5.47:1 and is already the repo's compliant teal
  // (components/auth/authTokens.ts linkStyle).
  backgroundColor: '#0F766E',
  color: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.3)',
  boxShadow: '5px 5px 14px rgba(13,148,136,0.25), -3px -3px 8px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.06)',
  textDecoration: 'none',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
}

const handleHoverIn = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.transform = 'translateY(-2px)';
  // Match on the data attribute, not on a hardcoded rgb() string: the latter
  // silently stopped identifying the primary pill the moment its background
  // changed, which would have given the teal CTA the pale hover treatment.
  // handleHoverOut already keys off the same attribute.
  const isTeal = e.currentTarget.dataset.variant === 'primary';
  if (!isTeal) {
    e.currentTarget.style.backgroundColor = '#E6FAF8';
    // #0D9488 on #E6FAF8 is ~3.5:1; #0F766E clears 4.5:1.
    e.currentTarget.style.color = '#0F766E';
    e.currentTarget.style.boxShadow = '5px 5px 14px rgba(13,148,136,0.12), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';
  }
}
const handleHoverOut = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.transform = 'translateY(0)';
  const isTeal = e.currentTarget.dataset.variant === 'primary';
  if (!isTeal) {
    e.currentTarget.style.backgroundColor = '#EDF2EE';
    e.currentTarget.style.color = '#374151';
    e.currentTarget.style.boxShadow = clayNavPill.boxShadow as string;
  } else {
    e.currentTarget.style.boxShadow = clayPrimaryPill.boxShadow as string;
  }
}

export default function HeaderAuth({ onNavigate, onRoleChange }: HeaderAuthProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileCompleteness, setProfileCompleteness] = useState(100)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        try {
          const res = await fetch('/api/auth/profile')
          if (res.ok) {
            const profileData = await res.json()
            setProfile({
              email: user.email!,
              role: profileData.role,
              firstName: profileData.firstName,
              lastName: profileData.lastName,
              avatarUrl: profileData.avatarUrl,
            })
            onRoleChange?.(profileData.role)
            if (profileData.role === 'job_seeker') {
              setProfileCompleteness(calculateCompleteness(profileData as ProfileData).percentage)
            }
          }
        } catch (err) {
          console.error('Failed to fetch profile:', err)
        }
      }

      setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)

        if (session?.user) {
          try {
            const res = await fetch('/api/auth/profile')
            if (res.ok) {
              const profileData = await res.json()
              setProfile({
                email: session.user.email!,
                role: profileData.role,
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                avatarUrl: profileData.avatarUrl,
              })
              onRoleChange?.(profileData.role)
              if (profileData.role === 'job_seeker') {
                setProfileCompleteness(calculateCompleteness(profileData as ProfileData).percentage)
              }
            }
          } catch (err) {
            console.error('Failed to fetch profile:', err)
          }
        } else {
          setProfile(null)
          onRoleChange?.(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-16 h-8 animate-pulse rounded-xl" style={{
          backgroundColor: '#EDF2EE',
          boxShadow: '4px 4px 10px rgba(0,0,0,0.04), inset 2px 2px 4px rgba(255,255,255,0.7)',
        }} />
      </div>
    )
  }

  if (user && profile) {
    if (profile.role === 'admin') {
      return (
        <div className="flex items-center gap-2">
          <UserMenu user={profile} isMobile={!!onNavigate} />
        </div>
      )
    }
    // Notification-bell button removed (was a duplicate entry point to
    // /messages — both seeker and employer roles already have Messages in
    // the main nav + the BottomNav on mobile). Cleaner header chrome,
    // fewer redundant CTAs, no half-implemented unread-count dot.
    if (profile.role === 'employer') {
      return (
        <div className="flex items-center gap-3">
          <UserMenu user={profile} isMobile={!!onNavigate} />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-3">
        <UserMenu user={profile} profileCompleteness={profileCompleteness} isMobile={!!onNavigate} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/login"
        onClick={onNavigate}
        style={clayNavPill}
        onMouseEnter={handleHoverIn}
        onMouseLeave={handleHoverOut}
      >
        Log in
      </Link>
      <Link
        href="/signup"
        onClick={onNavigate}
        style={clayPrimaryPill}
        data-variant="primary"
        onMouseEnter={handleHoverIn}
        onMouseLeave={handleHoverOut}
      >
        Sign up
      </Link>
    </div>
  )
}
