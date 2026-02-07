'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { User, Building2 } from 'lucide-react';
import LoginForm from './LoginForm';
import EmployerLoginForm from '@/components/employer/EmployerLoginForm';
import GoogleSignInButton from './GoogleSignInButton';
import Link from 'next/link';

type UserRole = 'job_seeker' | 'employer';

export default function LoginContent() {
    const searchParams = useSearchParams();
    const [role, setRole] = useState<UserRole>('job_seeker');

    useEffect(() => {
        const roleParam = searchParams.get('role');
        if (roleParam === 'employer') {
            setRole('employer');
        }
    }, [searchParams]);

    return (
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10 border border-gray-100">
            {/* Role Selection */}
            <div className="mb-8">
                {/* Role Toggle */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => setRole('job_seeker')}
                        className={`p-4 border rounded-lg text-center transition-all ${role === 'job_seeker'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <User className="w-6 h-6 mx-auto mb-2" />
                        <span className="font-medium">Job Seeker</span>
                        <p className="text-xs text-gray-500 mt-1">Looking for jobs</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => setRole('employer')}
                        className={`p-4 border rounded-lg text-center transition-all ${role === 'employer'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <Building2 className="w-6 h-6 mx-auto mb-2" />
                        <span className="font-medium">Employer</span>
                        <p className="text-xs text-gray-500 mt-1">Hiring talent</p>
                    </button>
                </div>
            </div>

            {role === 'job_seeker' ? (
                <>
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
                </>
            ) : (
                <EmployerLoginForm />
            )}
        </div>
    );
}
