import { redirect } from 'next/navigation'
import Link from 'next/link'
import EmployerLoginForm from '@/components/employer/EmployerLoginForm'
import { getCurrentUser } from '@/lib/auth/protect'

export const metadata = {
    title: 'Employer Login | PMHNP Jobs',
    description: 'Log in to your employer dashboard to manage job postings',
}

export default async function EmployerLoginPage() {
    const currentUser = await getCurrentUser()
    if (currentUser) {
        redirect('/employer/dashboard')
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center py-12 sm:px-6 lg:px-8" style={{ background: 'var(--bg-primary)' }}>
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <Link href="/" className="flex justify-center">
                    <span className="text-3xl font-bold text-teal-600">PMHNP Jobs</span>
                </Link>
                <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
                    Employer Login
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Manage your job listings and applicants
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10 border border-gray-100">
                    <EmployerLoginForm />
                </div>
            </div>
        </div>
    )
}
