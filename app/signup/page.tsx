import { redirect } from 'next/navigation'
import Link from 'next/link'
import SignUpForm from '@/components/auth/SignUpForm'
import { getCurrentUser } from '@/lib/auth/protect'

export const metadata = {
  title: 'Create Account | PMHNP Hiring',
  description: 'Create your PMHNP Hiring account',
}

export default async function SignUpPage() {
  const currentUser = await getCurrentUser()
  if (currentUser) {
    redirect('/dashboard')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Create your account
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Join thousands of PMHNPs finding their perfect role
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
          <SignUpForm />
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="underline hover:no-underline" style={{ color: 'var(--text-secondary)' }}>Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline hover:no-underline" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link>
        </p>
      </div>
    </div>
  )
}
