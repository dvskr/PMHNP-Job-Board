import { redirect } from 'next/navigation'
import SignUpForm from '@/components/auth/SignUpForm'
import AuthLayout from '@/components/auth/AuthLayout'
import { getCurrentUser } from '@/lib/auth/protect'

export const metadata = {
  title: 'Create Account',
  description: 'Create your free PMHNP Hiring account. Save jobs, set up alerts, and get matched with psychiatric nurse practitioner positions across all 50 states.',
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const currentUser = await getCurrentUser()
  const params = await searchParams
  const redirectTo = params.redirectTo || '/dashboard'
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard'
  if (currentUser) {
    redirect(safeRedirect)
  }

  return (
    <AuthLayout variant="signup">
      <SignUpForm />
    </AuthLayout>
  )
}
