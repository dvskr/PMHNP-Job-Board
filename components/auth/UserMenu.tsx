"use client"

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Settings, LayoutDashboard, LogOut, ChevronDown, Shield } from 'lucide-react'

interface UserMenuProps {
  user: {
    email: string
    role: string
    firstName?: string | null
    lastName?: string | null
    avatarUrl?: string | null
  }
  profileCompleteness?: number
}

export default function UserMenu({ user, profileCompleteness = 100 }: UserMenuProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl || null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profileRes = await fetch('/api/auth/profile')
        if (profileRes.ok) {
          const profile = await profileRes.json()
          setAvatarUrl(profile.avatarUrl)
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error)
      }
    }

    fetchProfile()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
    router.push('/')
  }

  const displayName = user.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user.email

  const initials = user.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] || ''}`
    : user.email[0].toUpperCase()

  const menuItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 16px', fontSize: '14px', fontWeight: 500,
    color: 'var(--text-primary)', textDecoration: 'none',
    transition: 'background 0.15s', cursor: 'pointer',
    background: 'none', border: 'none', width: '100%', textAlign: 'left',
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 12px', borderRadius: '10px',
          background: 'none', border: 'none', cursor: 'pointer',
          transition: 'background 0.15s',
          position: 'relative',
        }}
        className="um-trigger"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={32}
            height={32}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 600,
          }}>
            {initials}
          </div>
        )}
        <span className="hidden md:block" style={{
          fontSize: '14px', fontWeight: 500,
          color: 'var(--text-secondary)',
          maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayName}
        </span>
        <ChevronDown style={{
          width: '16px', height: '16px',
          color: 'var(--text-tertiary)',
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
        {/* Orange dot for incomplete profile */}
        {user.role !== 'employer' && user.role !== 'admin' && profileCompleteness < 100 && (
          <div style={{
            position: 'absolute', top: '4px', right: '4px',
            width: '10px', height: '10px', borderRadius: '50%',
            background: '#F97316',
            border: '2px solid var(--bg-secondary)',
          }} />
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', right: 0, marginTop: '8px',
          width: '240px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          zIndex: 50,
        }}>
          {/* User info header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {displayName}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
              {user.email}
            </p>
            <span style={{
              display: 'inline-block', marginTop: '6px',
              padding: '2px 10px', borderRadius: '12px',
              fontSize: '11px', fontWeight: 600,
              background: 'rgba(45,212,191,0.12)', color: '#2DD4BF',
              textTransform: 'capitalize',
            }}>
              {user.role.replace('_', ' ')}
            </span>
          </div>

          {/* Profile completeness indicator */}
          {user.role !== 'employer' && user.role !== 'admin' && profileCompleteness < 100 && (
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              style={{
                display: 'block', padding: '10px 16px',
                borderBottom: '1px solid var(--border-color)',
                textDecoration: 'none',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '6px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Profile
                </span>
                <span style={{
                  fontSize: '12px', fontWeight: 700,
                  color: profileCompleteness <= 30 ? '#EF4444' : profileCompleteness <= 60 ? '#F59E0B' : '#22C55E',
                }}>
                  {profileCompleteness}% complete
                </span>
              </div>
              <div style={{
                width: '100%', height: '4px', borderRadius: '2px',
                background: 'var(--bg-tertiary)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${profileCompleteness}%`, height: '100%', borderRadius: '2px',
                  background: profileCompleteness <= 30 ? '#EF4444' : profileCompleteness <= 60 ? '#F59E0B' : '#22C55E',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </Link>
          )}

          {/* Menu items */}
          <div style={{ padding: '4px 0' }}>
            <Link
              href="/dashboard"
              onClick={() => setIsOpen(false)}
              className="um-menu-item"
              style={menuItemStyle}
            >
              <LayoutDashboard style={{ width: '16px', height: '16px' }} />
              Dashboard
            </Link>

            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="um-menu-item"
              style={menuItemStyle}
            >
              <Settings style={{ width: '16px', height: '16px' }} />
              Settings
            </Link>

            {user.role === 'admin' && (
              <Link
                href="/admin/jobs"
                onClick={() => setIsOpen(false)}
                className="um-menu-item"
                style={menuItemStyle}
              >
                <Shield style={{ width: '16px', height: '16px' }} />
                Admin Panel
              </Link>
            )}
          </div>

          {/* Sign out */}
          <div style={{ borderTop: '1px solid var(--border-color)', padding: '4px 0' }}>
            <button
              onClick={handleSignOut}
              className="um-menu-item"
              style={{ ...menuItemStyle, color: '#EF4444' }}
            >
              <LogOut style={{ width: '16px', height: '16px' }} />
              Sign out
            </button>
          </div>
        </div>
      )}

      <style>{`
        .um-trigger:hover { background: var(--bg-tertiary) !important; }
        .um-menu-item:hover { background: var(--bg-tertiary) !important; }
      `}</style>
    </div>
  )
}
