'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { User, Building2 } from 'lucide-react';
import LoginForm from './LoginForm';
import EmployerLoginForm from '@/components/employer/EmployerLoginForm';
import GoogleSignInButton from './GoogleSignInButton';

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
        <div className="space-y-6">
            {/* Role Selection - Pill Toggle */}
            <div className="flex rounded-lg p-1" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                <button
                    type="button"
                    onClick={() => setRole('job_seeker')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all"
                    style={{
                        background: role === 'job_seeker' ? 'var(--bg-secondary)' : 'transparent',
                        color: role === 'job_seeker' ? 'var(--color-primary)' : 'var(--text-tertiary)',
                        boxShadow: role === 'job_seeker' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    }}
                >
                    <User className="w-4 h-4" />
                    Job Seeker
                </button>
                <button
                    type="button"
                    onClick={() => setRole('employer')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all"
                    style={{
                        background: role === 'employer' ? 'var(--bg-secondary)' : 'transparent',
                        color: role === 'employer' ? 'var(--color-primary)' : 'var(--text-tertiary)',
                        boxShadow: role === 'employer' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    }}
                >
                    <Building2 className="w-4 h-4" />
                    Employer
                </button>
            </div>

            {role === 'job_seeker' ? (
                <>
                    <GoogleSignInButton mode="login" />

                    {/* Divider */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t" style={{ borderColor: 'var(--border-color)' }} />
                        </div>
                        <div className="relative flex justify-center">
                            <span
                                className="px-3 text-xs uppercase tracking-wider font-medium"
                                style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                            >
                                or
                            </span>
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
