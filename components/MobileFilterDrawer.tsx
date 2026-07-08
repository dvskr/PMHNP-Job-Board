'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import LinkedInFilters from '@/components/jobs/LinkedInFilters';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';

interface MobileFilterDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function MobileFilterDrawer({ isOpen, onClose }: MobileFilterDrawerProps) {
    // Focus trap, ESC handler, and focus restore are centralised in
    // useFocusTrap so all dialogs in the app behave consistently.
    const trapRef = useFocusTrap<HTMLDivElement>({ isOpen, onEscape: onClose });

    // Live filtered total, reported by LinkedInFilters as counts land.
    // Filters apply immediately (each toggle pushes a new URL), so the
    // footer button only closes the drawer — its label reflects that.
    const [totalJobs, setTotalJobs] = useState<number | null>(null);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        // Cleanup on unmount
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div ref={trapRef} className="fixed inset-0 z-[110] lg:hidden">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 transition-opacity duration-300"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer */}
            <div
                className="fixed inset-y-0 left-0 w-full max-w-sm bg-white overflow-y-auto shadow-xl transform transition-transform duration-300"
                role="dialog"
                aria-modal="true"
                aria-label="Filter jobs"
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
                    <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Close filters"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Filter Content */}
                <div className="p-4">
                    <LinkedInFilters onTotalChange={setTotalJobs} />
                </div>

                {/* Footer close button — filters apply live, so this only
                    dismisses the drawer. "Show {n} jobs" says exactly what
                    tapping it reveals; the old apply-style label implied a
                    pending action that didn't exist. */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
                    <button
                        onClick={onClose}
                        className="w-full py-3 px-4 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors"
                    >
                        {totalJobs === null
                            ? 'Show jobs'
                            : `Show ${totalJobs.toLocaleString()} ${totalJobs === 1 ? 'job' : 'jobs'}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
