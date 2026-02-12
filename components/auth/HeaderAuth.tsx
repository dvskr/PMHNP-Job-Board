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
}

export default function HeaderAuth({ onNavigate }: HeaderAuthProps) {
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
              if (profileData.role === 'job_seeker') {
                setProfileCompleteness(calculateCompleteness(profileData as ProfileData).percentage)
              }
            }
          } catch (err) {
            console.error('Failed to fetch profile:', err)
          }
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <div className="w-20 h-8 bg-gray-200 animate-pulse rounded" />
      </div>
    )
  }

  if (user && profile) {
    if (profile.role === 'admin') {
      return (
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="text-gray-700 hover:text-teal-600 font-medium transition-colors"
          >
            Admin
          </Link>
          <UserMenu user={profile} />
        </div>
      )
    }
    if (profile.role === 'employer') {
      return (
        <div className="flex items-center gap-4">
          <Link
            href="/employer/dashboard"
            className="text-gray-700 hover:text-teal-600 font-medium transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/employer/candidates"
            className="text-gray-700 hover:text-teal-600 font-medium transition-colors"
          >
            Candidates
          </Link>
          <UserMenu user={profile} />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="nav-link"
          style={{
            padding: '8px 14px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Dashboard
        </Link>
        <UserMenu user={profile} profileCompleteness={profileCompleteness} />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 w-full lg:w-auto">
      <Link
        href="/login"
        onClick={onNavigate}
        className="hdr-signin font-semibold text-base lg:text-[13px] text-center lg:text-left py-4 lg:py-2 px-4 lg:px-3 rounded-xl touch-manipulation"
        style={{ color: 'rgba(var(--text-primary-rgb, 255,255,255), 0.55)' }}
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        onClick={onNavigate}
        className="hdr-signup px-6 lg:px-5 py-4 lg:py-2 rounded-xl font-semibold text-base lg:text-[13px] text-center touch-manipulation"
        style={{
          color: 'var(--text-primary)',
          backgroundColor: 'rgba(var(--text-primary-rgb, 255,255,255), 0.08)',
          border: '1px solid rgba(var(--text-primary-rgb, 255,255,255), 0.12)',
        }}
      >
        Sign up
      </Link>
    </div>
  )
}

