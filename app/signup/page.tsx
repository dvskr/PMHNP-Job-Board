import { redirect } from 'next/navigation'
import Link from 'next/link'
import SignUpForm from '@/components/auth/SignUpForm'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import { getCurrentUser } from '@/lib/auth/protect'

export const metadata = {
  title: 'Create Account | PMHNP Jobs',
  description: 'Create your PMHNP Jobs account',
}

export default async function SignUpPage() {
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

      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">


          <SignUpForm />
        </div>
      </div>
    </div>
  )
}

