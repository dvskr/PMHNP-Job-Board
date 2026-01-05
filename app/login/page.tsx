import { redirect } from 'next/navigation'
import Link from 'next/link'
import LoginForm from '@/components/auth/LoginForm'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import { getCurrentUser } from '@/lib/auth/protect'

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
          <span className="text-3xl font-bold text-blue-600">PMHNP Jobs</span>
        </Link>
        <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Access saved jobs, applications, and more
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
          <GoogleSignInButton mode="login" />

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or continue with email</span>
            </div>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}

