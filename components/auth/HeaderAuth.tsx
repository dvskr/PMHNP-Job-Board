"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import UserMenu from './UserMenu'
import { User } from '@supabase/supabase-js'

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
    return <UserMenu user={profile} />
  }

  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 w-full lg:w-auto">
      <Link
        href="/login"
        onClick={onNavigate}
        className="text-gray-700 hover:text-gray-900 hover:bg-gray-50 font-medium text-base lg:text-sm text-center lg:text-left py-4 lg:py-2 px-4 lg:px-3 rounded-lg transition-colors touch-manipulation"
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        onClick={onNavigate}
        className="bg-blue-600 text-white px-6 lg:px-5 py-4 lg:py-2 rounded-lg font-medium text-base lg:text-sm hover:bg-blue-700 transition-colors text-center touch-manipulation shadow-md hover:shadow-lg active:scale-95"
      >
        Sign up
      </Link>
    </div>
  )
}

