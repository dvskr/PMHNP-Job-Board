"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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
  backgroundColor: '#0D9488',
  color: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.3)',
  boxShadow: '5px 5px 14px rgba(13,148,136,0.25), -3px -3px 8px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.06)',
  textDecoration: 'none',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
}

const handleHoverIn = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.transform = 'translateY(-2px)';
  const isTeal = e.currentTarget.style.backgroundColor === 'rgb(13, 148, 136)';
  if (!isTeal) {
    e.currentTarget.style.backgroundColor = '#E6FAF8';
    e.currentTarget.style.color = '#0D9488';
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
          <Link href="/admin" style={clayNavPill}
            onMouseEnter={handleHoverIn} onMouseLeave={handleHoverOut}
          >
            Admin
          </Link>
          <UserMenu user={profile} isMobile={!!onNavigate} />
        </div>
      )
    }
    if (profile.role === 'employer') {
      return (
        <div className="flex items-center gap-2">
          <Link href="/employer/dashboard" style={clayNavPill}
            onMouseEnter={handleHoverIn} onMouseLeave={handleHoverOut}
          >
            Dashboard
          </Link>
          <Link href="/employer/candidates" style={clayNavPill}
            onMouseEnter={handleHoverIn} onMouseLeave={handleHoverOut}
          >
            Candidates
          </Link>
          <UserMenu user={profile} isMobile={!!onNavigate} />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <Link href="/dashboard" style={clayNavPill}
          onMouseEnter={handleHoverIn} onMouseLeave={handleHoverOut}
        >
          Dashboard
        </Link>
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
