'use client';

import { useState, useEffect } from 'react';
import { Download, CheckCircle, Loader2, Mail } from 'lucide-react';

interface ResourceDownloadGateProps {
    resourceUrl: string;
    resourceTitle: string;
}

const STORAGE_KEY = 'pmhnp_resource_unlocked';

export default function ResourceDownloadGate({ resourceUrl, resourceTitle }: ResourceDownloadGateProps) {
    const [unlocked, setUnlocked] = useState(false);
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setUnlocked(localStorage.getItem(STORAGE_KEY) === 'true');
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;

        setStatus('loading');
        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, source: 'resource_download' }),
            });
        } catch { /* silent */ }
        localStorage.setItem(STORAGE_KEY, 'true');
        setUnlocked(true);
        setStatus('done');
        // Auto-trigger download
        window.open(resourceUrl, '_blank');
    };

    if (unlocked) {
        return (
            <a
                href={resourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-colors"
                style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
            >
                <Download size={18} />
                Download {resourceTitle}
            </a>
        );
    }

    return (
        <div
            className="rounded-xl p-6 max-w-md"
            style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(20,184,166,0.04))',
                border: '1px solid rgba(45,212,191,0.2)',
            }}
        >
            <div className="flex items-center gap-2 mb-3">
                <Mail size={20} style={{ color: '#14B8A6' }} />
                <h4 className="font-semibold text-gray-900">Get free access</h4>
            </div>
            <p className="text-sm text-gray-600 mb-4">
                Enter your email to download the {resourceTitle}. You&apos;ll also receive career tips & job market updates.
            </p>
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="flex-1 px-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                />
                <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-1"
                    style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
                >
                    {status === 'loading' ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : status === 'done' ? (
                        <><CheckCircle size={16} /> Done</>
                    ) : (
                        <><Download size={16} /> Get PDF</>
                    )}
                </button>
            </form>
        </div>
    );
}
