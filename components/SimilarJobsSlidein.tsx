'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, Sparkles, ArrowRight } from 'lucide-react';

interface SimilarJob {
    id: string;
    slug: string;
    title: string;
    employer: string;
    city?: string | null;
    stateCode?: string | null;
}

interface Props {
    jobs: SimilarJob[];
    /** Trigger visibility externally */
    isVisible: boolean;
    onDismiss: () => void;
}

/**
 * Similar jobs slide-in — shows after applying to a job.
 * Displays 3 related positions in a bottom card. No email capture.
 */
export default function SimilarJobsSlidein({ jobs, isVisible, onDismiss }: Props) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (isVisible && jobs.length > 0) {
            const timer = setTimeout(() => setShow(true), 500);
            return () => clearTimeout(timer);
        }
        setShow(false);
        return undefined;
    }, [isVisible, jobs.length]);

    if (!show || jobs.length === 0) return null;

    const displayed = jobs.slice(0, 3);

    return (
        <div
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[9980] animate-slide-up"
            style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                    <Sparkles size={16} style={{ color: '#2DD4BF' }} />
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        Similar positions
                    </span>
                </div>
                <button
                    onClick={() => { setShow(false); onDismiss(); }}
                    className="p-1 rounded-md cursor-pointer transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Jobs list */}
            <div className="px-4 pb-4 space-y-2">
                {displayed.map((job) => (
                    <Link
                        key={job.id}
                        href={`/jobs/${job.slug}`}
                        className="block p-3 rounded-lg transition-all"
                        style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid transparent',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(45,212,191,0.3)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                    >
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {job.title}
                        </p>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                            {job.employer}{job.city ? ` · ${job.city}` : ''}{job.stateCode ? `, ${job.stateCode}` : ''}
                        </p>
                    </Link>
                ))}

                <Link
                    href="/jobs"
                    className="flex items-center justify-center gap-1 pt-1 text-xs font-medium"
                    style={{ color: '#2DD4BF' }}
                >
                    Browse all jobs <ArrowRight size={12} />
                </Link>
            </div>

            <style jsx global>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(40px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slideUp 0.35s ease-out;
                }
            `}</style>
        </div>
    );
}
