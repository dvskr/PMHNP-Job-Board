import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/protect'
import LoginContent from '@/components/auth/LoginContent'
import { Suspense } from 'react'

export const metadata = {
  title: 'Sign In | PMHNP Jobs',
  description: 'Sign in to your PMHNP Jobs account',
}

export default async function LoginPage() {
  const currentUser = await getCurrentUser()
  if (currentUser) {
    redirect('/dashboard')
  }

  return (
    <div
      className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Welcome back
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Sign in to access your dashboard
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color-dark)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          }}
        >
          <Suspense
            fallback={
              <div className="space-y-4">
                <div className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
                <div className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
                <div className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
              </div>
            }
          >
            <LoginContent />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
          By signing in, you agree to our{' '}
          <Link href="/terms" className="underline hover:no-underline" style={{ color: 'var(--text-secondary)' }}>Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline hover:no-underline" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link>
        </p>
      </div>
    </div>
  )
}
