'use client';

import { useState, useEffect } from 'react';
import { Lock, CheckCircle, Loader2 } from 'lucide-react';

interface SalaryGateProps {
    salary: string | null | undefined;
    compact?: boolean;
}

const STORAGE_KEY = 'pmhnp_salary_unlocked';

export default function SalaryGate({ salary, compact = false }: SalaryGateProps) {
    const [unlocked, setUnlocked] = useState(false);
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
    const [showInput, setShowInput] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setUnlocked(localStorage.getItem(STORAGE_KEY) === 'true');
        }
    }, []);

    if (!salary) return null;

    if (unlocked) {
        return <span>{salary}</span>;
    }

    const handleUnlock = async () => {
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;

        setStatus('loading');
        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, source: 'salary_unlock' }),
            });
        } catch { /* silent */ }
        localStorage.setItem(STORAGE_KEY, 'true');
        setUnlocked(true);
        setStatus('done');
    };

    if (!showInput) {
        return (
            <button
                onClick={() => setShowInput(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                style={{ color: 'var(--color-primary, #14B8A6)' }}
            >
                <Lock size={compact ? 12 : 14} />
                {compact ? 'Unlock salary' : 'Enter email to see salary'}
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {status === 'done' ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: '#22C55E' }}>
                    <CheckCircle size={14} /> Unlocked!
                </span>
            ) : (
                <>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                        placeholder="you@example.com"
                        className="px-2 py-1 rounded text-xs outline-none"
                        style={{
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            width: compact ? '140px' : '180px',
                        }}
                        autoFocus
                    />
                    <button
                        onClick={handleUnlock}
                        disabled={status === 'loading'}
                        className="px-2 py-1 rounded text-xs font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: 'var(--color-primary, #14B8A6)' }}
                    >
                        {status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : '→'}
                    </button>
                </>
            )}
        </div>
    );
}
