'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, X, Star, Loader2, CheckCircle, Send, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function FeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [rating, setRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    useEffect(() => {
        // Don't show if dismissed recently
        const dismissedAt = localStorage.getItem('feedback-dismissed');
        if (dismissedAt) {
            const daysAgo = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
            if (daysAgo < 7) return;
        }

        // Check auth
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsAuthenticated(!!user);
        });

        // Delay showing the pill for 30 seconds
        const timer = setTimeout(() => setIsVisible(true), 30000);
        return () => clearTimeout(timer);
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
                bottom: '80px',
                right: '16px',
                zIndex: 99999,
            }}
        >
            {isOpen ? (
                /* Expanded Card */
                <div
                    className="rounded-2xl shadow-2xl w-[320px] overflow-hidden"
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        animation: 'slideUp 0.3s ease-out',
                    }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-3"
                        style={{
                            background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                        }}
                    >
                        <div className="flex items-center gap-2 text-white">
                            <MessageSquare size={16} />
                            <span className="font-semibold text-sm">How are we doing?</span>
                        </div>
                        <button
                            onClick={handleDismiss}
                            className="text-white/70 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-4">
                        {isAuthenticated === false ? (
                            /* Sign In Prompt */
                            <div className="text-center py-4">
                                <LogIn size={36} className="mx-auto mb-2" style={{ color: 'var(--color-primary)' }} />
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    Sign in to leave feedback
                                </p>
                                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                                    We&apos;d love to hear from you!
                                </p>
                                <Link
                                    href="/login"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white"
                                    style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}
                                >
                                    <LogIn size={14} />
                                    Sign In
                                </Link>
                            </div>
                        ) : status === 'success' ? (
                            /* Success State */
                            <div className="text-center py-4">
                                <CheckCircle size={40} className="mx-auto mb-2 text-green-500" />
                                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Thank you!</p>
                                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Your feedback helps us improve.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Star Rating */}
                                <div className="mb-4">
                                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                        Rate your experience
                                    </p>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                onClick={() => setRating(star)}
                                                onMouseEnter={() => setHoveredStar(star)}
                                                onMouseLeave={() => setHoveredStar(0)}
                                                className="p-0.5 transition-transform hover:scale-110"
                                            >
                                                <Star
                                                    size={28}
                                                    fill={(hoveredStar || rating) >= star ? '#f59e0b' : 'transparent'}
                                                    stroke={(hoveredStar || rating) >= star ? '#f59e0b' : 'var(--text-tertiary)'}
                                                    strokeWidth={1.5}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                    {rating > 0 && (
                                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                            {rating <= 2 ? "We'll work on it!" : rating <= 4 ? 'Thanks for the feedback!' : 'Awesome! Glad you love it!'}
                                        </p>
                                    )}
                                </div>

                                {/* Message */}
                                <div className="mb-3">
                                    <textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Tell us what you think... (optional)"
                                        rows={3}
                                        maxLength={500}
                                        className="w-full px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:ring-2"
                                        style={{
                                            backgroundColor: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-primary)',
                                        }}
                                    />
                                </div>

                                {/* Error */}
                                {status === 'error' && (
                                    <p className="text-xs text-red-400 mb-2">Something went wrong. Please try again.</p>
                                )}

                                {/* Submit */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={rating === 0 || status === 'submitting'}
                                    className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{
                                        background: rating > 0 ? 'linear-gradient(135deg, #0D9488, #0F766E)' : 'var(--bg-tertiary)',
                                        color: rating > 0 ? '#ffffff' : 'var(--text-tertiary)',
                                    }}
                                >
                                    {status === 'submitting' ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <>
                                            <Send size={14} />
                                            Send Feedback
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                /* Collapsed Pill */
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all hover:scale-105"
                    style={{
                        background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                        color: '#ffffff',
                        animation: 'slideUp 0.3s ease-out',
                    }}
                >
                    <MessageSquare size={16} />
                    <span className="text-sm font-semibold">Feedback</span>
                </button>
            )}

            <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}
