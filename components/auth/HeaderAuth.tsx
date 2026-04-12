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

  // Shared nav link classes
  const navLinkClass = "px-4 py-2 text-[15px] font-medium transition-colors rounded-lg"
  const navLinkStyle = { color: '#CBD5E1' }

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-16 h-8 animate-pulse rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
      </div>
    )
  }

  if (user && profile) {
    if (profile.role === 'admin') {
      return (
        <div className="flex items-center gap-1">
          <Link href="/admin" className={navLinkClass} style={navLinkStyle}>
            Admin
          </Link>
          <UserMenu user={profile} isMobile={!!onNavigate} />
        </div>
      )
    }
    if (profile.role === 'employer') {
      return (
        <div className="flex items-center gap-1">
          <Link href="/employer/dashboard" className={navLinkClass} style={navLinkStyle}>
            Dashboard
          </Link>
          <Link href="/employer/candidates" className={navLinkClass} style={navLinkStyle}>
            Candidates
          </Link>
          <UserMenu user={profile} isMobile={!!onNavigate} />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1">
        <Link href="/dashboard" className={navLinkClass} style={navLinkStyle}>
          Dashboard
        </Link>
        <UserMenu user={profile} profileCompleteness={profileCompleteness} isMobile={!!onNavigate} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        onClick={onNavigate}
        className={navLinkClass}
        style={navLinkStyle}
      >
        Log in
      </Link>
      <Link
        href="/signup"
        onClick={onNavigate}
        className="inline-flex items-center justify-center rounded-lg transition-colors shadow-sm"
        style={{
          padding: '0 20px',
          height: '40px',
          fontSize: '15px',
          fontWeight: 600,
          backgroundColor: '#0D9488',
          color: '#FFFFFF',
        }}
      >
        Sign up
      </Link>
    </div>
  )
}
