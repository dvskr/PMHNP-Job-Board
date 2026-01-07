'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function ProductHuntBanner() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if banner was previously dismissed
        const isDismissed = localStorage.getItem('ph_banner_dismissed');
        if (!isDismissed) {
            setIsVisible(true);
        }
    }, []);

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('ph_banner_dismissed', 'true');
    };

    if (!isVisible) return null;

    return (
        <div className="relative bg-gradient-to-r from-[#FF6154] to-[#FF9054] text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-center sm:text-left flex-1 justify-center sm:justify-start">
                    <span className="text-sm sm:text-base font-medium">
                        🚀 We're live on Product Hunt! Support us and help PMHNPs find better jobs
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <a
                        href="https://www.producthunt.com/products/pmhnp-jobs?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-pmhnp-jobs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                    >
                        <img
                            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1059031&theme=light&t=1767757599195"
                            alt="PMHNP Jobs - The #1 job board for Psychiatric Mental Health NPs | Product Hunt"
                            style={{ width: '250px', height: '54px' }}
                            width="250"
                            height="54"
                        />
                    </a>

                    <button
                        onClick={handleDismiss}
                        className="p-1 hover:bg-white/20 rounded-full transition-colors"
                        aria-label="Dismiss banner"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
