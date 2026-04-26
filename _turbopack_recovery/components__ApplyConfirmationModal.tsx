'use client';

import { useState } from 'react';
import { Mail, CheckCircle, Loader2, X } from 'lucide-react';

interface ApplyConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmApplied: () => void;
  onNotApplied: () => void;
  jobTitle: string;
  userEmail?: string | null;
}

export default function ApplyConfirmationModal({
  isOpen,
  onClose,
  onConfirmApplied,
  onNotApplied,
  jobTitle,
  userEmail,
}: ApplyConfirmationModalProps) {
  const [showEmailCapture, setShowEmailCapture] = useState(false);
  const [email, setEmail] = useState('');
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'loading' | 'done'>('idle');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirmApplied();

    // If user is logged in with an email, auto-subscribe (fire-and-forget)
    if (userEmail) {
      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, source: 'post_apply' }),
      }).catch(() => { });
      return;
    }

    // If not logged in, show email capture
    setShowEmailCapture(true);
  };

  const handleEmailSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;

    setCaptureStatus('loading');
    try {
      await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'post_apply' }),
      });
    } catch { /* silent */ }
    setCaptureStatus('done');
    setTimeout(() => onClose(), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 animate-fade-in"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-sm transform rounded-2xl p-6 shadow-xl animate-scale-in"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--border-color)',
          }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Post-apply email capture */}
          {showEmailCapture ? (
            <div className="text-center">
              {captureStatus === 'done' ? (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                    <CheckCircle size={24} style={{ color: '#22C55E' }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    You&apos;re subscribed!
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    We&apos;ll send you similar PMHNP opportunities.
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(45,212,191,0.15)' }}>
                    <Mail size={24} style={{ color: '#2DD4BF' }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Get notified about similar jobs
                  </h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                    Enter your email to receive matching PMHNP opportunities.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      onClick={handleEmailSubmit}
                      disabled={captureStatus === 'loading'}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
                    >
                      {captureStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : 'Subscribe'}
                    </button>
                  </div>
                  <button
                    onClick={onClose}
                    className="mt-3 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    No thanks
                  </button>
                </>
              )}
            </div>
          ) : (
            /* Standard confirmation */
            <div className="text-center">
              {/* Icon */}
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(45,212,191,0.15)' }}>
                <svg
                  className="h-6 w-6"
                  style={{ color: '#2DD4BF' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
              </div>

              {/* Heading */}
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Did you complete the application?
              </h3>

              {/* Subtext */}
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                You clicked apply for <span className="font-medium">{jobTitle}</span>
              </p>

              {/* Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleConfirm}
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                  style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
                >
                  Yes, I applied
                </button>
                <button
                  onClick={onNotApplied}
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  No, just browsing
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
