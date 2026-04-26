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

export default function HeaderAuth() {
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
    <div className="flex items-center gap-3">
      <Link
        href="/login"
        className="text-gray-600 hover:text-gray-900 font-medium text-sm"
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
      >
        Sign up
      </Link>
    </div>
  )
}

