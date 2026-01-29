'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

// Pages where popup should never show
const EXCLUDED_PATHS = [
  '/login',
  '/signup',
  '/dashboard',
  '/admin',
  '/employer',
  '/settings',
  '/job-alerts/manage',
];

// LocalStorage key for tracking dismissal
const STORAGE_KEY = 'exit_popup_dismissed';
const DISMISS_DURATION_DAYS = 7;

export default function ExitIntentPopup() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShownThisSession, setHasShownThisSession] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const pathname = usePathname();

  // Check if popup should be shown on this path
  const shouldShowOnPath = useCallback(() => {
    return !EXCLUDED_PATHS.some(path => pathname.startsWith(path));
  }, [pathname]);

  // Check if popup was recently dismissed
  const wasRecentlyDismissed = useCallback(() => {
    if (typeof window === 'undefined') return true;
    
    const dismissedAt = localStorage.getItem(STORAGE_KEY);
    if (!dismissedAt) return false;

    const dismissedDate = new Date(parseInt(dismissedAt, 10));
    const now = new Date();
    const daysSinceDismissed = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceDismissed < DISMISS_DURATION_DAYS;
  }, []);

  // Show popup
  const showPopup = useCallback(() => {
    if (hasShownThisSession || wasRecentlyDismissed() || !shouldShowOnPath()) {
      return;
    }
    setIsVisible(true);
    setHasShownThisSession(true);
  }, [hasShownThisSession, wasRecentlyDismissed, shouldShowOnPath]);

  // Dismiss popup and save to localStorage
  const dismissPopup = useCallback(() => {
    setIsVisible(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }, []);

  // Close popup without long-term dismissal (just for this session)
  const closePopup = useCallback(() => {
    setIsVisible(false);
  }, []);

  useEffect(() => {
    // Don't run on excluded paths
    if (!shouldShowOnPath()) return;
    
    // Don't run if already dismissed recently
    if (wasRecentlyDismissed()) return;

    // Detect if mobile
    const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;

    if (isMobile) {
      // Mobile: Show after 60 seconds
      const timer = setTimeout(() => {
        showPopup();
      }, 60000);

      return () => clearTimeout(timer);
    } else {
      // Desktop: Show when mouse moves to top of viewport
      const handleMouseLeave = (e: MouseEvent) => {
        if (e.clientY <= 10 && e.relatedTarget === null) {
          showPopup();
        }
      };

      document.addEventListener('mouseout', handleMouseLeave);

      return () => {
        document.removeEventListener('mouseout', handleMouseLeave);
      };
    }
  }, [shouldShowOnPath, wasRecentlyDismissed, showPopup]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        closePopup();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible, closePopup]);

  // Prevent body scroll when popup is open
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isVisible]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/job-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, frequency: 'weekly' }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus('success');
        // Auto-close after 4 seconds
        setTimeout(() => {
          dismissPopup();
        }, 4000);
      } else {
        setErrorMessage(data.error || 'Something went wrong');
        setStatus('error');
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closePopup}
      />

      {/* Popup */}
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={closePopup}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10 p-1"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-blue-600 px-6 py-8 text-white text-center">
          <span className="text-4xl mb-2 block">📊</span>
          <h2 className="text-2xl font-bold">Before You Go...</h2>
          <p className="text-teal-100 mt-2 text-sm">Get your FREE Salary Guide + Job Alerts</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {status === 'success' ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">You&apos;re In!</h3>
              <p className="text-gray-600">
                Check your email for the Salary Guide and to confirm your job alerts.
              </p>
            </div>
          ) : (
            <>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-gray-700 text-sm">
                  <span className="text-green-500 text-lg">✓</span>
                  <span><strong>Free 2026 Salary Guide</strong> (PDF)</span>
                </li>
                <li className="flex items-center gap-2 text-gray-700 text-sm">
                  <span className="text-green-500 text-lg">✓</span>
                  <span>Weekly alerts for new PMHNP jobs</span>
                </li>
                <li className="flex items-center gap-2 text-gray-700 text-sm">
                  <span className="text-green-500 text-lg">✓</span>
                  <span>Salary ranges by state + negotiation tips</span>
                </li>
              </ul>

              <form onSubmit={handleSubmit}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-gray-900"
                  disabled={status === 'loading'}
                />
                
                {status === 'error' && (
                  <p className="text-red-600 text-sm mb-3">{errorMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {status === 'loading' ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Subscribing...
                    </>
                  ) : (
                    'Get Free Guide + Job Alerts'
                  )}
                </button>
              </form>

              <p className="text-xs text-gray-400 text-center mt-4">
                No spam. Unsubscribe anytime.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-3 bg-gray-50">
          <button
            onClick={dismissPopup}
            className="text-sm text-gray-400 hover:text-gray-600 w-full text-center"
          >
            Don&apos;t show this again
          </button>
        </div>
      </div>
    </div>
  );
}
