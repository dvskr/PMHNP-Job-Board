'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * /auth/confirm
 * 
 * Client-side page that handles Supabase hash fragment redirects.
 * This handles:
 * - Magic link confirmations (#access_token=...&type=magiclink)
 * - Password reset links (#access_token=...&type=recovery)
 * 
 * The server-side /auth/callback remains for Google OAuth (PKCE with ?code=)
 */
export default function AuthConfirmPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Confirming your email...')

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const supabase = createClient()

        // Supabase client automatically reads the hash fragment
        // and exchanges it for a session
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Auth confirm error:', error.message)
          setStatus('error')
          setMessage('Something went wrong. Please try again.')
          setTimeout(() => router.push('/login'), 3000)
          return
        }

        if (session) {
          // Check the auth event type from the hash fragment
          const hash = window.location.hash
          const isRecovery = hash.includes('type=recovery')

          if (isRecovery) {
            // Password reset — redirect to reset password page
            setMessage('Redirecting to reset password...')
            setStatus('success')
            router.push('/reset-password')
            return
          }

          // Magic link / email confirmation — user is logged in
          setMessage('Email confirmed! Redirecting to dashboard...')
          setStatus('success')
          setTimeout(() => router.push('/dashboard'), 1500)
          return
        }

        // No session — might be a confirmation-only link
        // Check if the hash has error or access_denied
        const hash = window.location.hash
        if (hash.includes('error')) {
          setStatus('error')
          setMessage('This link has expired or is invalid. Please request a new one.')
          setTimeout(() => router.push('/login'), 3000)
          return
        }

        // No session, no error — just redirect to login
        setMessage('Email confirmed! Please log in.')
        setStatus('success')
        setTimeout(() => router.push('/login?message=email_confirmed'), 2000)
      } catch (err) {
        console.error('Auth confirm unexpected error:', err)
        setStatus('error')
        setMessage('Something went wrong. Please try again.')
        setTimeout(() => router.push('/login'), 3000)
      }
    }

    // Small delay to let Supabase client initialize and read hash
    setTimeout(handleAuth, 500)
  }, [router])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #060E18)',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          padding: '48px 32px',
          background: 'var(--bg-secondary, #0F1923)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #1E293B)',
          maxWidth: '420px',
          width: '100%',
        }}
      >
        {status === 'loading' && (
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(45,212,191,0.2)',
              borderTopColor: '#2DD4BF',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 20px',
            }}
          />
        )}
        {status === 'success' && (
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
        )}
        {status === 'error' && (
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
        )}
        <p
          style={{
            color: status === 'error' ? '#EF4444' : 'var(--text-primary, #F1F5F9)',
            fontSize: '16px',
            fontWeight: 600,
            margin: 0,
          }}
        >
          {message}
        </p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
