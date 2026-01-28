'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

const EXCLUDED_PATHS = [
  '/login',
  '/signup',
  '/dashboard',
  '/admin',
  '/employer',
  '/settings',
  '/forgot-password',
  '/reset-password',
];

export default function ExitIntentPopup() {
  const [isVisible, setIsVisible] = useState(false);
  const hasTriggered = useRef(false);
  const pathname = usePathname();

  // Check if current path should be excluded
  const isExcludedPath = EXCLUDED_PATHS.some(path => 
    pathname === path || pathname.startsWith(path + '/')
  );

  // Don't render anything on excluded paths
  if (isExcludedPath) return null;

  // Helper function to check localStorage and show popup
  const showPopupIfAllowed = () => {
    if (hasTriggered.current) return;
    
    const dismissed = localStorage.getItem('pmhnp_exit_popup_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (dismissedTime > sevenDaysAgo) return; // Still within 7 days
    }
    hasTriggered.current = true;
    setIsVisible(true);
  };

  // Close handler
  const handleClose = () => {
    localStorage.setItem('pmhnp_exit_popup_dismissed', Date.now().toString());
    setIsVisible(false);
  };

  // Exit intent detection for desktop
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      // Only trigger when mouse leaves from top of viewport
      if (e.clientY <= 10 && !hasTriggered.current) {
        showPopupIfAllowed();
      }
    };
    
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, []);

  // Mobile fallback (time-based)
  useEffect(() => {
    // Only for mobile/touch devices
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) return;
    
    const timer = setTimeout(() => {
      if (!hasTriggered.current) {
        showPopupIfAllowed();
      }
    }, 60000); // 60 seconds
    
    return () => clearTimeout(timer);
  }, []);

  // Prevent body scroll when popup is open
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isVisible]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isVisible) window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-50 transition-all duration-300"
      onClick={handleClose}
    >
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg mx-4 bg-white rounded-2xl p-6 md:p-8 transition-all duration-300 scale-100 opacity-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Newsletter signup"
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close popup"
        >
          <X size={24} />
        </button>

        {/* Content */}
        <div className="space-y-3">
          <p className="text-lg font-semibold text-gray-600">
            📊 Before you go...
          </p>
          
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
            Get the 2026 PMHNP Salary Guide FREE
          </h2>
          
          <p className="text-gray-600 mb-6">
            Know your worth. See pay rates by state, telehealth vs. in-person, and negotiation tips.
          </p>

          {/* Beehiiv Iframe */}
          <iframe 
            src="https://subscribe-forms.beehiiv.com/ec7a9528-db98-40ff-948a-fa8f637fd4f0"
            className="beehiiv-embed w-full"
            data-test-id="beehiiv-embed"
            frameBorder="0"
            scrolling="no"
            style={{ 
              height: '280px', 
              backgroundColor: 'transparent',
              border: 'none'
            }}
          />

          <small className="text-gray-500 text-xs block text-center">
            No spam. Unsubscribe anytime.
          </small>
        </div>
      </div>
    </div>
  );
}

