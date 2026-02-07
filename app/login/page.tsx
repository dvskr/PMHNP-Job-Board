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
    <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex justify-center">
          <span className="text-2xl font-bold text-teal-600">PMHNP Hiring</span>
        </Link>

        <p className="mt-2 text-center text-base font-normal text-gray-500">
          Access your dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Suspense fallback={<div className="h-96 bg-white animate-pulse rounded-lg shadow-lg"></div>}>
          <LoginContent />
        </Suspense>
      </div>
    </div>
  )
}

