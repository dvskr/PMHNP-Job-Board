'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, X, Star, Loader2, CheckCircle, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Feedback widget — only for logged-in users on 3rd+ visit.
 * Shows as a small floating pill in bottom-right after 60 seconds.
 * Suppressed for 14 days after dismiss or submit.
 */
export default function FeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [rating, setRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

    useEffect(() => {
        // Suppress for 14 days after dismiss
        try {
            const dismissedAt = localStorage.getItem('feedback-dismissed');
            if (dismissedAt) {
                const daysAgo = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
                if (daysAgo < 14) return;
            }
        } catch { return; }

        // Only on 3rd+ visit
        const visits = parseInt(localStorage.getItem('pmhnp_visit_count') || '0', 10);
        if (visits < 3) return;

        // Only for logged-in users
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            // Show pill after 60 seconds of browsing
            const timer = setTimeout(() => setIsVisible(true), 60000);
            return () => clearTimeout(timer);
        });
    }, []);

    const handleDismiss = () => {
        setIsOpen(false);
        setIsVisible(false);
        localStorage.setItem('feedback-dismissed', Date.now().toString());
    };

    const handleSubmit = async () => {
        if (rating === 0) return;

        setStatus('submitting');
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating,
                    message: message.trim() || undefined,
                    page: window.location.pathname,
                }),
            });

            if (res.ok) {
                setStatus('success');
                localStorage.setItem('feedback-dismissed', Date.now().toString());
                setTimeout(() => {
                    setIsOpen(false);
                    setIsVisible(false);
                }, 2500);
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('error');
        }
    };

    if (!isVisible) return null;

    return (
        <div
            className="fixed"
            style={{
                bottom: '20px',
                right: '16px',
                zIndex: 9985,
            }}
        >
            {isOpen ? (
                /* Expanded Card */
                <div
                    className="rounded-2xl shadow-2xl w-[300px] overflow-hidden"
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        animation: 'fbSlideUp 0.3s ease-out',
                    }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-3"
                        style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}
                    >
                        <div className="flex items-center gap-2 text-white">
                            <MessageSquare size={14} />
                            <span className="font-semibold text-sm">Quick feedback</span>
                        </div>
                        <button
                            onClick={handleDismiss}
                            className="text-white/70 hover:text-white transition-colors cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="p-4">
                        {status === 'success' ? (
                            <div className="text-center py-3">
                                <CheckCircle size={32} className="mx-auto mb-2 text-green-500" />
                                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Thank you!</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Your feedback helps us improve.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Star Rating */}
                                <div className="mb-3">
                                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                                        How&apos;s your experience?
                                    </p>
                                    <div className="flex gap-0.5">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                onClick={() => setRating(star)}
                                                onMouseEnter={() => setHoveredStar(star)}
                                                onMouseLeave={() => setHoveredStar(0)}
                                                className="p-0.5 transition-transform hover:scale-110 cursor-pointer"
                                                style={{ background: 'none', border: 'none' }}
                                            >
                                                <Star
                                                    size={24}
                                                    fill={(hoveredStar || rating) >= star ? '#f59e0b' : 'transparent'}
                                                    stroke={(hoveredStar || rating) >= star ? '#f59e0b' : 'var(--text-tertiary)'}
                                                    strokeWidth={1.5}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Message */}
                                {rating > 0 && (
                                    <div className="mb-3">
                                        <textarea
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder="Any thoughts? (optional)"
                                            rows={2}
                                            maxLength={500}
                                            className="w-full px-3 py-2 rounded-lg text-xs resize-none focus:outline-none"
                                            style={{
                                                backgroundColor: 'var(--bg-primary)',
                                                border: '1px solid var(--border-color)',
                                                color: 'var(--text-primary)',
                                            }}
                                        />
                                    </div>
                                )}

                                {status === 'error' && (
                                    <p className="text-xs text-red-400 mb-2">Something went wrong.</p>
                                )}

                                {/* Submit */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={rating === 0 || status === 'submitting'}
                                    className="w-full py-2 px-4 rounded-lg font-semibold text-xs text-white flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
                                    style={{
                                        background: rating > 0 ? 'linear-gradient(135deg, #0D9488, #0F766E)' : 'var(--bg-tertiary)',
                                        color: rating > 0 ? '#ffffff' : 'var(--text-tertiary)',
                                        border: 'none',
                                    }}
                                >
                                    {status === 'submitting' ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <><Send size={12} /> Send</>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                /* Collapsed Pill — small and subtle */
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg transition-all hover:scale-105 cursor-pointer"
                    style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-muted)',
                        animation: 'fbSlideUp 0.3s ease-out',
                        fontSize: 12,
                    }}
                >
                    <MessageSquare size={13} style={{ color: '#2DD4BF' }} />
                    <span className="font-medium">Feedback</span>
                </button>
            )}

            <style jsx>{`
                @keyframes fbSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
