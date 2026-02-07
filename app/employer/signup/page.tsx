import { redirect } from 'next/navigation'
import Link from 'next/link'
import EmployerSignUpForm from '@/components/employer/EmployerSignUpForm'
import { getCurrentUser } from '@/lib/auth/protect'

export const metadata = {
    title: 'Employer Sign Up | PMHNP Jobs',
    description: 'Create an employer account to post jobs and find qualified psychiatric nurse practitioners.',
}

export default async function EmployerSignUpPage() {
    const currentUser = await getCurrentUser()
    if (currentUser) {
        redirect('/employer/dashboard')
    }

    return (
        <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <Link href="/" className="flex justify-center">
                    <span className="text-3xl font-bold text-blue-600">PMHNP Jobs</span>
                </Link>
                <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
                    Create Employer Account
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Start hiring qualified PMHNPs today
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10 border border-gray-100">
                    <EmployerSignUpForm />
                </div>
            </div>
        </div>
    )
}
