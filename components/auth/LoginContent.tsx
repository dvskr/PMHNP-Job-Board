'use client';

import { useRouter } from 'next/navigation';
import { User, Building2 } from 'lucide-react';
import LoginForm from './LoginForm';
import GoogleSignInButton from './GoogleSignInButton';

export default function LoginContent() {
    const router = useRouter();

    return (
        <div className="space-y-6">
            {/* Role Selection - Pill Toggle */}
            <div className="flex rounded-lg p-1" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                <button
                    type="button"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all"
                    style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--color-primary)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                    }}
                >
                    <User className="w-4 h-4" />
                    Job Seeker
                </button>
                <button
                    type="button"
                    onClick={() => router.push('/employer/login')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all"
                    style={{
                        background: 'transparent',
                        color: 'var(--text-tertiary)',
                        boxShadow: 'none',
                    }}
                >
                    <Building2 className="w-4 h-4" />
                    Employer
                </button>
            </div>

            <GoogleSignInButton mode="login" />

            {/* Divider */}
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" style={{ borderColor: 'var(--border-color)' }} />
                </div>
                <div className="relative flex justify-center">
                    <span
                        className="px-3 text-xs uppercase tracking-wider font-medium"
                        style={{ background: '#fff', color: 'var(--text-tertiary)' }}
                    >
                        or
                    </span>
                </div>
            </div>

            <LoginForm />
        </div>
    );
}
